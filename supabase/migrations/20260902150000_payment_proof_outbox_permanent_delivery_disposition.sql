-- A bound historical dead letter whose delivery is permanently blocked may be
-- terminally disposed only after its single authoritative destination is proven.
alter table private.payment_proof_outbox_maintenance_audit
 drop constraint payment_proof_outbox_maintenance_audit_decision_check,
 add constraint payment_proof_outbox_maintenance_audit_decision_check
  check(decision in ('destination_repaired','abandoned_unresolvable','abandoned_permanent_delivery','invalid_request','ineligible')),
 drop constraint payment_proof_outbox_maintenance_audit_reason_code_check,
 add constraint payment_proof_outbox_maintenance_audit_reason_code_check
  check(reason_code in ('historical_destination_unresolvable','historical_destination_repaired','historical_delivery_permanently_blocked','invalid_request','ineligible'));

create function public.dispose_payment_proof_outbox_permanent_delivery(p_target_id text,p_reason_code text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
<<dispose_permanent_delivery>>
declare
 actor uuid:=auth.uid(); role_at_action public.tipo_funcao; o public.payment_proof_outbox%rowtype;
 proof public.payment_proofs%rowtype; authoritative_conversation uuid; authoritative_count integer;
 fingerprint text; prior private.payment_proof_outbox_maintenance_audit%rowtype;
 outcome text; audit_reason text; valid_target boolean;
begin
 select p.funcao into role_at_action from public.perfis p where p.id=actor and p.ativo
  and p.funcao in ('admin','supervisor') for update;
 if role_at_action is null then raise exception using errcode='42501',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_FORBIDDEN';end if;
 if p_idempotency_key is null then raise exception using errcode='22023',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_KEY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_object('operation','dispose_permanent_delivery','target_id',p_target_id,'reason_code',p_reason_code)::text,'sha256'),'hex');
 select * into prior from private.payment_proof_outbox_maintenance_audit where idempotency_key=p_idempotency_key for update;
 if found then
  if prior.target_fingerprint<>fingerprint then raise exception using errcode='23505',message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('outcome',prior.decision);
 end if;
 valid_target:=coalesce(p_target_id~'^[1-9][0-9]*$' and (length(p_target_id)<19 or (length(p_target_id)=19 and p_target_id<='9223372036854775807')),false);
 if p_reason_code is distinct from 'historical_delivery_permanently_blocked' or not valid_target then
  outcome:='invalid_request';audit_reason:='invalid_request';
 else
  select * into o from public.payment_proof_outbox where id=p_target_id::bigint for update;
  if found and o.status='dead_letter' and o.claimed_until is null and o.lease_token is null and o.conversation_id is not null then
   select * into proof from public.payment_proofs where id=o.proof_id for update;
   if found then
    perform i.pedido_id from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id where i.proof_id=proof.id order by p.id,i.pedido_id for update of i,p;
    if exists(select 1 from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id where i.proof_id=proof.id and p.cliente_id is distinct from proof.customer_id) then
     raise exception using errcode='23514',message='PAYMENT_PROOF_OUTBOX_DESTINATION_CUSTOMER_MISMATCH';
    end if;
    select count(distinct p.conversa_id) into authoritative_count from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id where i.proof_id=proof.id and p.conversa_id is not null;
    if authoritative_count<>1 then raise exception using errcode='23514',message='PAYMENT_PROOF_OUTBOX_DESTINATION_UNRESOLVABLE';end if;
    select distinct p.conversa_id into authoritative_conversation from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id where i.proof_id=proof.id and p.conversa_id is not null;
     perform c.id from public.conversas c where c.id=authoritative_conversation for update;
    if o.conversation_id is distinct from authoritative_conversation or not exists(select 1 from public.conversas c where c.id=authoritative_conversation and c.cliente_id=proof.customer_id) then
     raise exception using errcode='23514',message='PAYMENT_PROOF_OUTBOX_DESTINATION_MISMATCH';
    end if;
    update public.payment_proof_outbox set status='abandoned',claimed_until=null,lease_token=null,completed_at=null,last_error='historical_delivery_permanently_blocked' where id=o.id;
    outcome:='abandoned_permanent_delivery';audit_reason:='historical_delivery_permanently_blocked';
   else outcome:='ineligible';audit_reason:='ineligible';
   end if;
  else outcome:='ineligible';audit_reason:='ineligible';
  end if;
 end if;
 insert into private.payment_proof_outbox_maintenance_audit(idempotency_key,target_fingerprint,decision,reason_code,prior_status,actor_id,actor_role)
 values(p_idempotency_key,fingerprint,outcome,audit_reason,case when found then o.status else null end,actor,role_at_action);
 return jsonb_build_object('outcome',outcome);
end$$;

alter function public.dispose_payment_proof_outbox_permanent_delivery(text,text,uuid) owner to supabase_admin;
revoke all on function public.dispose_payment_proof_outbox_permanent_delivery(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.dispose_payment_proof_outbox_permanent_delivery(text,text,uuid) to authenticated;
