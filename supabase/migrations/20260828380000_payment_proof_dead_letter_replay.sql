-- Explicit, operator-authorized replay of durable payment-proof dead letters only.
create table private.payment_proof_dead_letter_replay_requests (
 idempotency_key uuid primary key,
 request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
 source text not null check(source in ('processing_queue','outbox')),
 target_id text not null,
 proof_id uuid not null references public.payment_proofs(id) on delete restrict,
 actor_id uuid not null,
 actor_role public.tipo_funcao not null check(actor_role in ('admin','supervisor')),
 outcome text not null check(outcome in ('replayed','ineligible')),
 created_at timestamptz not null default now()
);
revoke all on private.payment_proof_dead_letter_replay_requests from public,anon,authenticated,service_role;

create function public.replay_payment_proof_dead_letter(p_source text,p_target_id text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 role_at_action public.tipo_funcao; actor uuid:=auth.uid(); q private.payment_proof_processing_queue%rowtype;
 o public.payment_proof_outbox%rowtype; prior private.payment_proof_dead_letter_replay_requests%rowtype;
 target_proof uuid; canonical_target text; fingerprint text; outcome text;
begin
 -- This is deliberately the first lock: profile changes cannot race the replay.
 select p.funcao into role_at_action from public.perfis p where p.id=actor and p.ativo
  and p.funcao in ('admin','supervisor') for update;
 if role_at_action is null then raise exception using errcode='42501',message='PAYMENT_PROOF_REPLAY_FORBIDDEN'; end if;
 if p_idempotency_key is null or p_source not in ('processing_queue','outbox') or nullif(btrim(p_target_id),'') is null then
  return jsonb_build_object('outcome','invalid_request');
 end if;
 if p_source='processing_queue' then
  begin canonical_target:=p_target_id::uuid::text; exception when invalid_text_representation then return jsonb_build_object('outcome','invalid_request'); end;
 else
  if p_target_id !~ '^[1-9][0-9]*$' then return jsonb_build_object('outcome','invalid_request'); end if;
  canonical_target:=p_target_id::bigint::text;
 end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('source',p_source,'target_id',canonical_target)::text,'sha256'),'hex');
 select * into prior from private.payment_proof_dead_letter_replay_requests where idempotency_key=p_idempotency_key;
 if found and prior.request_fingerprint<>fingerprint then
  if p_source='processing_queue' then select proof_id into target_proof from private.payment_proof_processing_queue where proof_id=canonical_target::uuid for update;
  else select proof_id into target_proof from public.payment_proof_outbox where id=canonical_target::bigint for update; end if;
  if target_proof is not null then insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,metadata)
   values(target_proof,'dead_letter_replay',actor,role_at_action,'operator',null,'idempotency_conflict',jsonb_build_object('source',p_source,'target_id',canonical_target,'idempotency_key',p_idempotency_key,'outcome','idempotency_conflict')); end if;
  return jsonb_build_object('outcome','idempotency_conflict');
 end if;
 if found then
  insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,metadata)
   values(prior.proof_id,'dead_letter_replay',actor,role_at_action,'operator',null,prior.outcome,jsonb_build_object('source',prior.source,'target_id',prior.target_id,'idempotency_key',p_idempotency_key,'outcome',prior.outcome));
  return jsonb_build_object('outcome',prior.outcome);
 end if;
 if p_source='processing_queue' then
  select * into q from private.payment_proof_processing_queue where proof_id=canonical_target::uuid for update;
  if found then target_proof:=q.proof_id; outcome:=case when q.status='dead_letter' and q.claimed_until is null and q.lease_token is null then 'replayed' else 'ineligible' end;
   if outcome='replayed' then update private.payment_proof_processing_queue set status='pending',attempts=0,next_attempt_at=now(),claimed_until=null,lease_token=null,completed_at=null,dead_lettered_at=null,failure_stage=null,updated_at=now() where proof_id=q.proof_id; end if;
  else outcome:='ineligible'; end if;
 else
  select * into o from public.payment_proof_outbox where id=canonical_target::bigint for update;
  if found then target_proof:=o.proof_id; outcome:=case when o.status='dead_letter' and o.claimed_until is null and o.lease_token is null then 'replayed' else 'ineligible' end;
   if outcome='replayed' then update public.payment_proof_outbox set status='pending',attempts=0,next_attempt_at=now(),claimed_until=null,lease_token=null,completed_at=null,dead_lettered_at=null,last_error=null where id=o.id; end if;
  else outcome:='ineligible'; end if;
 end if;
 if target_proof is null then return jsonb_build_object('outcome','ineligible'); end if;
 insert into private.payment_proof_dead_letter_replay_requests(idempotency_key,request_fingerprint,source,target_id,proof_id,actor_id,actor_role,outcome)
 values(p_idempotency_key,fingerprint,p_source,canonical_target,target_proof,actor,role_at_action,outcome);
 insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,metadata)
 values(target_proof,'dead_letter_replay',actor,role_at_action,'operator',case when p_source='processing_queue' then q.status else o.status end,outcome,jsonb_build_object('source',p_source,'target_id',canonical_target,'idempotency_key',p_idempotency_key,'outcome',outcome));
 return jsonb_build_object('outcome',outcome);
end$$;
revoke all on function public.replay_payment_proof_dead_letter(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.replay_payment_proof_dead_letter(text,text,uuid) to authenticated;
