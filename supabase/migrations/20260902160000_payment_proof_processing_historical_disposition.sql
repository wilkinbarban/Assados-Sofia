-- Historical processing work may be terminally abandoned only when the proof is
-- already quarantined and its recorded original is absent from private storage.
alter table private.payment_proof_processing_queue
 drop constraint payment_proof_processing_queue_status_check,
 add constraint payment_proof_processing_queue_status_check
  check(status in ('pending','claimed','completed','dead_letter','abandoned'));

create table private.payment_proof_processing_maintenance_audit (
 id bigint generated always as identity primary key,
 idempotency_key uuid not null unique,
 target_fingerprint text not null check(target_fingerprint~'^[0-9a-f]{64}$'),
 proof_id uuid references public.payment_proofs(id) on delete set null,
 decision text not null check(decision in ('abandoned_missing_original','invalid_request','ineligible')),
 reason_code text not null check(reason_code in ('historical_original_missing','invalid_request','ineligible')),
 prior_queue_status text,
 prior_proof_status text,
 actor_id uuid not null,
 actor_role public.tipo_funcao not null check(actor_role in ('admin','supervisor')),
 created_at timestamptz not null default now()
);
revoke all on private.payment_proof_processing_maintenance_audit from public,anon,authenticated,service_role;

create function private.block_payment_proof_processing_maintenance_audit_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise exception using errcode='42501',message='PAYMENT_PROOF_PROCESSING_MAINTENANCE_AUDIT_IMMUTABLE';
end$$;
create trigger payment_proof_processing_maintenance_audit_immutable
before update or delete on private.payment_proof_processing_maintenance_audit
for each row execute function private.block_payment_proof_processing_maintenance_audit_mutation();
revoke all on function private.block_payment_proof_processing_maintenance_audit_mutation() from public,anon,authenticated,service_role;

create function public.dispose_payment_proof_processing_missing_original(p_target_id text,p_reason_code text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
<<dispose_processing>>
declare
 actor uuid:=auth.uid(); role_at_action public.tipo_funcao;
 proof public.payment_proofs%rowtype; q private.payment_proof_processing_queue%rowtype;
 prior private.payment_proof_processing_maintenance_audit%rowtype;
 fingerprint text; canonical_target uuid; outcome text; audit_reason text;
begin
 select p.funcao into role_at_action from public.perfis p
  where p.id=actor and p.ativo and p.funcao in ('admin','supervisor') for update;
 if role_at_action is null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_PROCESSING_MAINTENANCE_FORBIDDEN';
 end if;
 if p_idempotency_key is null then
  raise exception using errcode='22023',message='PAYMENT_PROOF_PROCESSING_MAINTENANCE_IDEMPOTENCY_KEY_REQUIRED';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_object('operation','dispose_missing_original','target_id',p_target_id,'reason_code',p_reason_code)::text,'sha256'),'hex');
 select * into prior from private.payment_proof_processing_maintenance_audit
  where idempotency_key=p_idempotency_key for update;
 if found then
  if prior.target_fingerprint<>fingerprint then
   raise exception using errcode='23505',message='PAYMENT_PROOF_PROCESSING_MAINTENANCE_IDEMPOTENCY_CONFLICT';
  end if;
  return jsonb_build_object('outcome',prior.decision);
 end if;
 begin
  canonical_target:=p_target_id::uuid;
 exception when invalid_text_representation then
  canonical_target:=null;
 end;
 if p_reason_code is distinct from 'historical_original_missing' or canonical_target is null then
  outcome:='invalid_request';audit_reason:='invalid_request';
 else
  select * into proof from public.payment_proofs where id=canonical_target for update;
  if found then
   select * into q from private.payment_proof_processing_queue where proof_id=canonical_target for update;
  end if;
  if proof.id is not null and q.proof_id is not null
   and proof.status='quarantined'
   and proof.original_storage_key is not null
   and q.status='pending' and q.attempts=0
   and q.claimed_until is null and q.lease_token is null
   and q.completed_at is null and q.dead_lettered_at is null and q.failure_stage is null
   and not exists(
    select 1 from storage.objects o
    where o.bucket_id='payment-proofs' and o.name=proof.original_storage_key
   ) then
   update private.payment_proof_processing_queue
    set status='abandoned',completed_at=null,dead_lettered_at=null,
        claimed_until=null,lease_token=null,failure_stage=null,updated_at=now()
    where proof_id=canonical_target;
   outcome:='abandoned_missing_original';audit_reason:='historical_original_missing';
  else
   outcome:='ineligible';audit_reason:='ineligible';
  end if;
 end if;
 insert into private.payment_proof_processing_maintenance_audit(
  idempotency_key,target_fingerprint,proof_id,decision,reason_code,
  prior_queue_status,prior_proof_status,actor_id,actor_role
 ) values(
  p_idempotency_key,fingerprint,proof.id,outcome,audit_reason,
  q.status,proof.status,actor,role_at_action
 );
 return jsonb_build_object('outcome',outcome);
end$$;

-- Abandoned historical work is terminal: it must not be re-queued or repaired.
create or replace function public.get_payment_proof_delivery_state(p_channel text,p_delivery_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payment_proofs%rowtype;q private.payment_proof_processing_queue%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_channel not in('web','telegram','whatsapp') or nullif(btrim(p_delivery_key),'') is null then raise exception using errcode='22023',message='PAYMENT_PROOF_DELIVERY_INVALID';end if;
 select * into p from public.payment_proofs where channel=p_channel and delivery_key=btrim(p_delivery_key) for update;
 if not found then return jsonb_build_object('state','missing');end if;
 select * into q from private.payment_proof_processing_queue where proof_id=p.id;
 if p.status='duplicate' or p.status in('review','quarantined','admitted','purging','purged') or q.status in('completed','dead_letter','abandoned') then return jsonb_build_object('state','complete');end if;
 if found or q.proof_id is not null then return jsonb_build_object('state','queued');end if;
 if p.original_storage_key is not null and p.sha256 is not null then
  insert into private.payment_proof_processing_queue(proof_id) values(p.id) on conflict do nothing;
  return jsonb_build_object('state','queued');
 end if;
 return jsonb_build_object('state','repairable');
end$$;

revoke all on function public.get_payment_proof_delivery_state(text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_payment_proof_delivery_state(text,text) to service_role;

alter function public.dispose_payment_proof_processing_missing_original(text,text,uuid) owner to supabase_admin;
revoke all on function public.dispose_payment_proof_processing_missing_original(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.dispose_payment_proof_processing_missing_original(text,text,uuid) to authenticated;
