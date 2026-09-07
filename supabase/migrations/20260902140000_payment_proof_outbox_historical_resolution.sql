-- Historical outbox rows created before the destination contract can be resolved
-- exactly once by an authorized operator, or terminally abandoned without delivery.
create table private.payment_proof_outbox_maintenance_audit (
 id bigint generated always as identity primary key,
 idempotency_key uuid not null,
 target_fingerprint text not null check(target_fingerprint~'^[0-9a-f]{64}$'),
 decision text not null check(decision in ('destination_repaired','abandoned_unresolvable','invalid_request','ineligible')),
 reason_code text not null check(reason_code in ('historical_destination_unresolvable','historical_destination_repaired','invalid_request','ineligible')),
 prior_status text,
 actor_id uuid not null,
 actor_role public.tipo_funcao not null,
 created_at timestamptz not null default now(),
 unique(idempotency_key)
);
revoke all on private.payment_proof_outbox_maintenance_audit from public,anon,authenticated,service_role;

create function private.block_payment_proof_outbox_maintenance_audit_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise exception using errcode='42501',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_AUDIT_IMMUTABLE';
end$$;
create trigger payment_proof_outbox_maintenance_audit_immutable
before update or delete on private.payment_proof_outbox_maintenance_audit
for each row execute function private.block_payment_proof_outbox_maintenance_audit_mutation();
revoke all on function private.block_payment_proof_outbox_maintenance_audit_mutation() from public,anon,authenticated,service_role;

alter table public.payment_proof_outbox drop constraint payment_proof_outbox_status_check,
 add constraint payment_proof_outbox_status_check check(status in('pending','claimed','completed','dead_letter','abandoned'));

create function public.dispose_payment_proof_outbox_dead_letter(p_target_id text,p_reason_code text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
<<dispose>>
declare actor uuid:=auth.uid(); role_at_action public.tipo_funcao; o public.payment_proof_outbox%rowtype;
 fingerprint text; prior private.payment_proof_outbox_maintenance_audit%rowtype; outcome text; audit_reason text;
 valid_target boolean;
begin
 select p.funcao into role_at_action from public.perfis p where p.id=actor and p.ativo and p.funcao in ('admin','supervisor') for update;
 if role_at_action is null then raise exception using errcode='42501',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_FORBIDDEN';end if;
 if p_idempotency_key is null then raise exception using errcode='22023',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_KEY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_object('operation','dispose','target_id',p_target_id,'reason_code',p_reason_code)::text,'sha256'),'hex');
 select * into prior from private.payment_proof_outbox_maintenance_audit where idempotency_key=p_idempotency_key for update;
 if found then if prior.target_fingerprint<>fingerprint then raise exception using errcode='23505',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_CONFLICT';end if; return jsonb_build_object('outcome',prior.decision);end if;
 valid_target:=coalesce(p_target_id~'^[1-9][0-9]*$' and (length(p_target_id)<19 or (length(p_target_id)=19 and p_target_id<='9223372036854775807')),false);
 if p_reason_code is distinct from 'historical_destination_unresolvable' or not valid_target then outcome:='invalid_request'; audit_reason:='invalid_request';
 else
  select * into o from public.payment_proof_outbox where id=p_target_id::bigint for update;
  outcome:=case when found and o.status='dead_letter' and o.claimed_until is null and o.lease_token is null then 'abandoned_unresolvable' else 'ineligible' end;
  audit_reason:=case when outcome='abandoned_unresolvable' then 'historical_destination_unresolvable' else 'ineligible' end;
  if outcome='abandoned_unresolvable' then update public.payment_proof_outbox set status='abandoned',claimed_until=null,lease_token=null,completed_at=null,last_error='historical_destination_unresolvable' where id=o.id;end if;
 end if;
 insert into private.payment_proof_outbox_maintenance_audit(idempotency_key,target_fingerprint,decision,reason_code,prior_status,actor_id,actor_role)
 values(p_idempotency_key,fingerprint,outcome,audit_reason,case when found then o.status else null end,actor,role_at_action);
 return jsonb_build_object('outcome',outcome);
end$$;

create function public.repair_payment_proof_outbox_destination(p_target_id text,p_conversation_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
<<repair>>
declare actor uuid:=auth.uid(); role_at_action public.tipo_funcao; o public.payment_proof_outbox%rowtype; proof public.payment_proofs%rowtype;
 authoritative_conversation uuid; authoritative_count integer; fingerprint text; prior private.payment_proof_outbox_maintenance_audit%rowtype; outcome text; audit_reason text; valid_target boolean;
begin
 select p.funcao into role_at_action from public.perfis p where p.id=actor and p.ativo and p.funcao in ('admin','supervisor') for update;
 if role_at_action is null then raise exception using errcode='42501',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_FORBIDDEN';end if;
 if p_idempotency_key is null then raise exception using errcode='22023',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_KEY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_object('operation','repair','target_id',p_target_id,'conversation_id',p_conversation_id,'reason_code','historical_destination_repaired')::text,'sha256'),'hex');
 select * into prior from private.payment_proof_outbox_maintenance_audit where idempotency_key=p_idempotency_key for update;
 if found then if prior.target_fingerprint<>fingerprint then raise exception using errcode='23505',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_CONFLICT';end if; return jsonb_build_object('outcome',prior.decision);end if;
 valid_target:=coalesce(p_target_id~'^[1-9][0-9]*$' and (length(p_target_id)<19 or (length(p_target_id)=19 and p_target_id<='9223372036854775807')),false);
 if p_conversation_id is null or not valid_target then outcome:='invalid_request';audit_reason:='invalid_request';
 else
  select * into o from public.payment_proof_outbox where id=p_target_id::bigint for update;
  if not found or o.status<>'dead_letter' or o.claimed_until is not null or o.lease_token is not null then outcome:='ineligible';audit_reason:='ineligible';
  else
   select * into proof from public.payment_proofs where id=o.proof_id for update;
   if not found then
    outcome:='ineligible';audit_reason:='ineligible';
   else
    perform i.pedido_id from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id where i.proof_id=proof.id order by p.id,i.pedido_id for update of i,p;
    perform c.id from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id join public.conversas c on c.id=p.conversa_id where i.proof_id=proof.id order by c.id for update of c;
    if exists(select 1 from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id where i.proof_id=proof.id and p.cliente_id is distinct from proof.customer_id) then
     raise exception using errcode='23514',message='PAYMENT_PROOF_OUTBOX_DESTINATION_CUSTOMER_MISMATCH';
    end if;
    select count(distinct p.conversa_id) into authoritative_count from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id where i.proof_id=proof.id and p.conversa_id is not null;
    if authoritative_count<>1 then raise exception using errcode='23514',message='PAYMENT_PROOF_OUTBOX_DESTINATION_UNRESOLVABLE';end if;
    select distinct p.conversa_id into authoritative_conversation from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id where i.proof_id=proof.id and p.conversa_id is not null;
    if p_conversation_id is distinct from authoritative_conversation or not exists(select 1 from public.conversas c where c.id=authoritative_conversation and c.cliente_id=proof.customer_id) then raise exception using errcode='23514',message='PAYMENT_PROOF_OUTBOX_DESTINATION_MISMATCH';end if;
    if proof.conversation_id is not null and proof.conversation_id is distinct from authoritative_conversation then raise exception using errcode='23514',message='PAYMENT_PROOF_OUTBOX_DESTINATION_CONFLICT';end if;
    if o.conversation_id is not null and o.conversation_id is distinct from authoritative_conversation then raise exception using errcode='23514',message='PAYMENT_PROOF_OUTBOX_DESTINATION_CONFLICT';end if;
    update public.payment_proofs set conversation_id=authoritative_conversation,updated_at=now() where id=proof.id and conversation_id is null;
    update public.payment_proof_outbox set conversation_id=authoritative_conversation,payload=jsonb_set(o.payload,'{conversation_id}',to_jsonb(authoritative_conversation::text),true) where id=o.id;
    outcome:='destination_repaired';audit_reason:='historical_destination_repaired';
   end if;
  end if;
 end if;
 insert into private.payment_proof_outbox_maintenance_audit(idempotency_key,target_fingerprint,decision,reason_code,prior_status,actor_id,actor_role)
 values(p_idempotency_key,fingerprint,outcome,audit_reason,case when found then o.status else null end,actor,role_at_action);
 return jsonb_build_object('outcome',outcome);
end$$;

-- The final metrics definition includes terminal, non-delivery abandonment while
-- preserving the established response object and JavaScript-safe numeric counts.
create or replace function public.get_payment_proof_operational_metrics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select jsonb_build_object(
  'lifecycle',jsonb_build_object('received',(count(*) filter(where p.status='received'))::integer,'identity_pending',(count(*) filter(where p.status='identity_pending'))::integer,'processing',(count(*) filter(where p.status='processing'))::integer,'review',(count(*) filter(where p.status='review'))::integer,'admitted',(count(*) filter(where p.status='admitted'))::integer,'quarantined',(count(*) filter(where p.status='quarantined'))::integer,'purging',(count(*) filter(where p.status='purging'))::integer,'duplicate',(count(*) filter(where p.status='duplicate'))::integer,'purged',(count(*) filter(where p.status='purged'))::integer),
  'quarantine',jsonb_build_object('total',(count(*) filter(where p.status='quarantined'))::integer,'expired',(count(*) filter(where p.status='quarantined' and p.purge_after<=now()))::integer)
 ) into result from public.payment_proofs p;
 result:=result||(with legacy_outbox as (select jsonb_build_object('pending',(count(*) filter(where status='pending'))::integer,'claimed',(count(*) filter(where status='claimed'))::integer,'completed',(count(*) filter(where status='completed'))::integer,'dead_letter',(count(*) filter(where status='dead_letter'))::integer,'abandoned',(count(*) filter(where status='abandoned'))::integer,'attempts',jsonb_build_object('zero',(count(*) filter(where attempts=0))::integer,'one',(count(*) filter(where attempts=1))::integer,'two',(count(*) filter(where attempts=2))::integer,'three_to_four',(count(*) filter(where attempts between 3 and 4))::integer,'five_plus',(count(*) filter(where attempts>=5))::integer),'dead_letter_last_60m',(count(*) filter(where dead_lettered_at>=now()-interval '60 minutes'))::integer) as metrics from public.payment_proof_outbox), unresolved_dead_letters as (select dead_lettered_at from public.payment_proof_outbox where status='dead_letter' union all select dead_lettered_at from private.payment_proof_processing_queue where status='dead_letter'), unresolved_summary as (select count(*)::integer as count,min(dead_lettered_at) as oldest_at from unresolved_dead_letters) select jsonb_build_object('outbox',l.metrics||jsonb_build_object('unresolved_dead_letter',u.count,'oldest_unresolved_dead_letter_at',u.oldest_at,'oldest_unresolved_dead_letter_age_seconds',case when u.oldest_at is null then null else greatest(0,floor(extract(epoch from(now()-u.oldest_at)))::integer) end)) from legacy_outbox l cross join unresolved_summary u);
 result:=result||(select jsonb_build_object('purge',jsonb_build_object('failures_last_60m',(count(*) filter(where e.event_type='purge_failed' and e.created_at>=now()-interval '60 minutes'))::integer)) from public.payment_proof_events e);
 result:=result||(select jsonb_build_object('failures',jsonb_build_object('render_last_60m',(count(*) filter(where f.stage='render' and f.created_at>=now()-interval '60 minutes'))::integer,'classifier_last_60m',(count(*) filter(where f.stage='classifier' and f.created_at>=now()-interval '60 minutes'))::integer)) from private.payment_proof_operational_failures f);
 result:=result||(select jsonb_build_object('maintenance',jsonb_build_object('running',h.running,'last_started_at',h.last_started_at,'last_finished_at',h.last_finished_at,'last_success_at',h.last_success_at,'age_seconds',case when h.last_success_at is null then null else greatest(0,floor(extract(epoch from(now()-h.last_success_at)))::integer) end,'consecutive_failures',h.consecutive_failures::integer)) from private.payment_proof_maintenance_health h where h.singleton);
 return result;
end$$;
revoke all on function public.get_payment_proof_operational_metrics() from public,anon,authenticated;
grant execute on function public.get_payment_proof_operational_metrics() to service_role;

alter function public.dispose_payment_proof_outbox_dead_letter(text,text,uuid) owner to supabase_admin;
alter function public.repair_payment_proof_outbox_destination(text,uuid,uuid) owner to supabase_admin;
revoke all on function public.dispose_payment_proof_outbox_dead_letter(text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.repair_payment_proof_outbox_destination(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.dispose_payment_proof_outbox_dead_letter(text,text,uuid) to authenticated;
grant execute on function public.repair_payment_proof_outbox_destination(text,uuid,uuid) to authenticated;
