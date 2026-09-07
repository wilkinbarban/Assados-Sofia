-- Financial dispositions require a database-authoritative active supervisor/admin snapshot.
create function public.require_active_payment_proof_financial_authority()
returns public.tipo_funcao language plpgsql security definer set search_path='' as $$
declare role_at_action public.tipo_funcao;
begin
 role_at_action:=public.require_active_payment_proof_actor_role();
 if role_at_action not in ('admin','supervisor') then
  raise exception using errcode='42501',message='PAYMENT_PROOF_FINANCIAL_AUTHORITY_REQUIRED';
 end if;
 return role_at_action;
end$$;
revoke all on function public.require_active_payment_proof_financial_authority() from public,anon,authenticated;

create or replace function public.confirm_payment_proof_amount(
 p_proof_id uuid,p_confirmed_cents integer,p_lease_token text
) returns boolean language plpgsql security definer set search_path='' as $$
declare role_at_action public.tipo_funcao;
begin
 role_at_action:=public.require_active_payment_proof_financial_authority();
 perform public.assert_payment_proof_lease(p_proof_id,p_lease_token);
 return public.confirm_payment_proof_amount_authorized(p_proof_id,p_confirmed_cents,role_at_action);
end$$;

create or replace function public.reconcile_payment_proof(
 p_proof_id uuid,p_order_ids uuid[],p_idempotency_key uuid,p_lease_token text
) returns bigint language plpgsql security definer set search_path='' as $$
declare role_at_action public.tipo_funcao;
begin
 role_at_action:=public.require_active_payment_proof_financial_authority();
 perform public.assert_payment_proof_lease(p_proof_id,p_lease_token);
 return public.reconcile_payment_proof_authorized(p_proof_id,p_order_ids,p_idempotency_key,role_at_action);
end$$;

create or replace function public.manage_payment_proof_review(
 p_proof_id uuid,p_operation text,p_value text,p_lease_token text
) returns boolean language plpgsql security definer set search_path='' as $$
declare proof public.payment_proofs%rowtype;role_at_action public.tipo_funcao;
begin
 role_at_action:=public.require_active_payment_proof_financial_authority();
 perform public.assert_payment_proof_lease(p_proof_id,p_lease_token);
 if p_operation<>'reject' then raise exception using errcode='22023',message='PAYMENT_PROOF_OPERATION_INVALID';end if;
 select * into proof from public.payment_proofs where id=p_proof_id for update;
 if proof.status not in('received','identity_pending','processing','review','admitted') then raise exception using errcode='23514',message='PAYMENT_PROOF_REJECTION_INVALID_STATE';end if;
 update public.payment_proofs set status='quarantined',quarantined_at=now(),purge_after=now()+interval '10 days',updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,reason) values(p_proof_id,'operator_reviewed',auth.uid(),role_at_action,'operator',proof.status,'quarantined','reject');
 insert into public.payment_proof_outbox(proof_id,conversation_id,event_type,channel,payload) values(p_proof_id,proof.conversation_id,'payment_proof_rejected',proof.channel,jsonb_build_object('message_key','payment_proof_under_review')) on conflict do nothing;
 delete from public.payment_proof_leases where proof_id=p_proof_id;
 return true;
end$$;

revoke all on function public.confirm_payment_proof_amount(uuid,integer,text),public.reconcile_payment_proof(uuid,uuid[],uuid,text),public.manage_payment_proof_review(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.confirm_payment_proof_amount(uuid,integer,text),public.reconcile_payment_proof(uuid,uuid[],uuid,text),public.manage_payment_proof_review(uuid,text,text,text) to authenticated;
