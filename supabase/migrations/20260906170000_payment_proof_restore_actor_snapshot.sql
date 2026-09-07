-- Restore is an admin-only, forward-only transition.  Snapshot the locked
-- authority row before mutating the proof so deactivation cannot race the audit.
create or replace function public.restore_payment_proof(p_proof_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  actor_role public.tipo_funcao;
  proof public.payment_proofs%rowtype;
  destination public.conversas%rowtype;
begin
  select p.funcao into actor_role
    from public.perfis p
   where p.id=actor and p.ativo and p.funcao='admin'
   for update;
  if actor_role is null then
    raise exception using errcode='42501',message='PAYMENT_PROOF_ADMIN_REQUIRED';
  end if;

  select * into proof from public.payment_proofs where id=p_proof_id for update;
  if not found or proof.status<>'quarantined' or proof.purge_after is null or proof.purge_after<=now() then
    raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_RESTORABLE';
  end if;

  select * into destination
    from public.conversas
   where id=proof.conversation_id
   for update;
  if not found or destination.cliente_id is distinct from proof.customer_id then
    raise exception using errcode='23514',message='PAYMENT_PROOF_RESTORE_DESTINATION_INVALID';
  end if;

  update public.payment_proofs
     set status='review',quarantined_at=null,purge_after=null,updated_at=now()
   where id=p_proof_id;

  insert into public.payment_proof_events(
    proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,reason
  ) values (
    p_proof_id,'restored',actor,actor_role,'operator','quarantined','review',p_reason
  );

  insert into public.payment_proof_outbox(
    proof_id,conversation_id,event_type,channel,payload
  ) values (
    p_proof_id,proof.conversation_id,'payment_proof_restored',proof.channel,
    jsonb_build_object('message_key','payment_proof_restored_under_review')
  ) on conflict (proof_id,event_type) do nothing;

  return true;
end $$;

revoke all on function public.restore_payment_proof(uuid,text) from public,anon,authenticated;
grant execute on function public.restore_payment_proof(uuid,text) to authenticated;
