-- Forward-only replay audit hardening: every authorized request with a usable key
-- receives one opaque, durable outcome record. Proof-linked rows retain their FK.
alter table private.payment_proof_dead_letter_replay_requests
  alter column proof_id drop not null;

alter table private.payment_proof_dead_letter_replay_requests
  drop constraint if exists payment_proof_dead_letter_replay_requests_outcome_check,
  add constraint payment_proof_dead_letter_replay_requests_outcome_check
    check (outcome in ('replayed','ineligible','invalid_request')),
  drop constraint if exists payment_proof_dead_letter_replay_requests_source_check,
  add constraint payment_proof_dead_letter_replay_requests_source_check
    check (source in ('processing_queue','outbox','invalid_request'));

-- Historical rows predate the opaque audit DTO. Keep their request fingerprint and
-- replace retained target values before installing the hardened RPC.
update private.payment_proof_dead_letter_replay_requests
set target_id = request_fingerprint
where target_id <> request_fingerprint;

create or replace function public.replay_payment_proof_dead_letter(p_source text,p_target_id text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 role_at_action public.tipo_funcao; actor uuid:=auth.uid(); q private.payment_proof_processing_queue%rowtype;
 o public.payment_proof_outbox%rowtype; prior private.payment_proof_dead_letter_replay_requests%rowtype;
 target_proof uuid; canonical_target text; fingerprint text; outcome text; audit_source text; prior_status text;
begin
 -- Authorization remains the first lock: profile changes cannot race any write.
 select p.funcao into role_at_action from public.perfis p where p.id=actor and p.ativo
  and p.funcao in ('admin','supervisor') for update;
 if role_at_action is null then raise exception using errcode='42501',message='PAYMENT_PROOF_REPLAY_FORBIDDEN'; end if;
 if p_idempotency_key is null then return jsonb_build_object('outcome','invalid_request'); end if;
 audit_source:=case when p_source in ('processing_queue','outbox') then p_source else 'invalid_request' end;
 if audit_source='invalid_request' or nullif(btrim(p_target_id),'') is null then
  fingerprint:=encode(extensions.digest(jsonb_build_object('source',audit_source,'target_id',coalesce(p_target_id,''))::text,'sha256'),'hex');
  outcome:='invalid_request';
 else
  begin
   if audit_source='processing_queue' then canonical_target:=p_target_id::uuid::text;
   else
    if p_target_id !~ '^[1-9][0-9]*$' then raise exception using errcode='22P02'; end if;
    canonical_target:=p_target_id::bigint::text;
   end if;
   fingerprint:=encode(extensions.digest(jsonb_build_object('source',audit_source,'target_id',canonical_target)::text,'sha256'),'hex');
  exception when invalid_text_representation then
   audit_source:='invalid_request'; outcome:='invalid_request';
   fingerprint:=encode(extensions.digest(jsonb_build_object('source',audit_source,'target_id',coalesce(p_target_id,''))::text,'sha256'),'hex');
  end;
 end if;
 select * into prior from private.payment_proof_dead_letter_replay_requests where idempotency_key=p_idempotency_key;
 if found then
  if prior.request_fingerprint<>fingerprint then return jsonb_build_object('outcome','idempotency_conflict'); end if;
  if prior.proof_id is not null then
   insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,metadata)
   values(prior.proof_id,'dead_letter_replay',actor,role_at_action,'operator',null,prior.outcome,jsonb_build_object('idempotency_key',p_idempotency_key,'outcome',prior.outcome));
  end if;
  return jsonb_build_object('outcome',prior.outcome);
 end if;
 if outcome='invalid_request' then
  insert into private.payment_proof_dead_letter_replay_requests(idempotency_key,request_fingerprint,source,target_id,proof_id,actor_id,actor_role,outcome)
  values(p_idempotency_key,fingerprint,audit_source,fingerprint,null,actor,role_at_action,outcome);
  return jsonb_build_object('outcome',outcome);
 end if;
 if audit_source='processing_queue' then
  select * into q from private.payment_proof_processing_queue where proof_id=canonical_target::uuid for update;
  if found then target_proof:=q.proof_id; prior_status:=q.status; outcome:=case when q.status='dead_letter' and q.claimed_until is null and q.lease_token is null then 'replayed' else 'ineligible' end;
   if outcome='replayed' then update private.payment_proof_processing_queue set status='pending',attempts=0,next_attempt_at=now(),claimed_until=null,lease_token=null,completed_at=null,dead_lettered_at=null,failure_stage=null,updated_at=now() where proof_id=q.proof_id; end if;
  else outcome:='ineligible'; end if;
 else
  select * into o from public.payment_proof_outbox where id=canonical_target::bigint for update;
  if found then target_proof:=o.proof_id; prior_status:=o.status; outcome:=case when o.status='dead_letter' and o.claimed_until is null and o.lease_token is null then 'replayed' else 'ineligible' end;
   if outcome='replayed' then update public.payment_proof_outbox set status='pending',attempts=0,next_attempt_at=now(),claimed_until=null,lease_token=null,completed_at=null,dead_lettered_at=null,last_error=null where id=o.id; end if;
  else outcome:='ineligible'; end if;
 end if;
 insert into private.payment_proof_dead_letter_replay_requests(idempotency_key,request_fingerprint,source,target_id,proof_id,actor_id,actor_role,outcome)
 values(p_idempotency_key,fingerprint,audit_source,fingerprint,target_proof,actor,role_at_action,outcome);
 if target_proof is not null then
  insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,metadata)
  values(target_proof,'dead_letter_replay',actor,role_at_action,'operator',prior_status,outcome,jsonb_build_object('idempotency_key',p_idempotency_key,'outcome',outcome));
 end if;
 return jsonb_build_object('outcome',outcome);
end$$;

-- Migration 39 purge deletes proof-linked rows. Nullable missing/invalid records
-- are intentionally retained as non-dependent audit rows and cannot block purge.
alter function public.replay_payment_proof_dead_letter(text,text,uuid) owner to supabase_admin;
revoke all on function public.replay_payment_proof_dead_letter(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.replay_payment_proof_dead_letter(text,text,uuid) to authenticated;
