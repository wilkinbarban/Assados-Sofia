-- Permanently disposition load dead letters whose recorded original no longer
-- exists. Review proofs enter normal quarantine; already-purged proofs remain
-- untouched. The queue disposition and immutable audit are atomic.
alter table private.payment_proof_processing_maintenance_audit
 drop constraint payment_proof_processing_maintenance_audit_decision_check,
 add constraint payment_proof_processing_maintenance_audit_decision_check
  check(decision in (
   'abandoned_missing_original','quarantined_and_abandoned',
   'abandoned_purged','invalid_request','ineligible'
  )),
 drop constraint payment_proof_processing_maintenance_audit_reason_code_check,
 add constraint payment_proof_processing_maintenance_audit_reason_code_check
  check(reason_code in (
   'historical_original_missing','historical_dead_letter_missing_original',
   'invalid_request','ineligible'
  ));

create function public.dispose_payment_proof_processing_dead_letter_missing_original(
 p_target_id text,p_reason_code text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
<<dispose_dead_letter>>
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
 fingerprint:=encode(extensions.digest(jsonb_build_object(
  'operation','dispose_dead_letter_missing_original','target_id',p_target_id,
  'reason_code',p_reason_code
 )::text,'sha256'),'hex');
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
 if p_reason_code is distinct from 'historical_dead_letter_missing_original'
  or canonical_target is null then
  outcome:='invalid_request';audit_reason:='invalid_request';
 else
  select * into proof from public.payment_proofs where id=canonical_target for update;
  if found then
   select * into q from private.payment_proof_processing_queue
    where proof_id=canonical_target for update;
  end if;
  if proof.id is not null and q.proof_id is not null
   and proof.status in ('review','purged')
   and proof.original_storage_key is not null
   and q.status='dead_letter' and q.attempts>=5 and q.failure_stage='load'
   and q.claimed_until is null and q.lease_token is null
   and q.completed_at is null and q.dead_lettered_at is not null
   and not exists(
    select 1 from storage.objects o
    where o.bucket_id='payment-proofs' and o.name=proof.original_storage_key
   ) then
   if proof.status='review' then
    update public.payment_proofs
     set status='quarantined',quarantined_at=now(),
         purge_after=now()+interval '10 days',updated_at=now()
     where id=canonical_target;
    insert into public.payment_proof_events(
     proof_id,event_type,actor_id,actor_role,source,
     previous_status,result_status,reason
    ) values(
     canonical_target,'processing_dead_letter_disposed',actor,role_at_action,
     'operator','review','quarantined','historical_original_missing'
    );
    insert into public.payment_proof_outbox(
     proof_id,conversation_id,event_type,channel,payload
    ) values(
     canonical_target,proof.conversation_id,'payment_proof_rejected',proof.channel,
     jsonb_build_object('message_key','payment_proof_under_review')
    ) on conflict do nothing;
    outcome:='quarantined_and_abandoned';
   else
    outcome:='abandoned_purged';
   end if;
   update private.payment_proof_processing_queue
    set status='abandoned',completed_at=null,dead_lettered_at=null,
        claimed_until=null,lease_token=null,failure_stage=null,updated_at=now()
    where proof_id=canonical_target;
   audit_reason:='historical_dead_letter_missing_original';
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

alter function public.dispose_payment_proof_processing_dead_letter_missing_original(text,text,uuid)
 owner to supabase_admin;
revoke all on function public.dispose_payment_proof_processing_dead_letter_missing_original(text,text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.dispose_payment_proof_processing_dead_letter_missing_original(text,text,uuid)
 to authenticated;
