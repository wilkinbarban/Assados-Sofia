-- Leased operator confirmation is the sole boundary that admits an amount-verified proof.
reset role;
create function public.confirm_payment_proof_amount_authorized(
 p_proof_id uuid,p_confirmed_cents integer,p_actor_role public.tipo_funcao
) returns boolean language plpgsql security definer set search_path='' as $$
declare proof public.payment_proofs%rowtype;
begin
 if p_confirmed_cents is null or p_confirmed_cents<=0 then
  raise exception using errcode='22023',message='PAYMENT_PROOF_AMOUNT_REQUIRED';
 end if;
 select * into proof from public.payment_proofs where id=p_proof_id for update;
 if not found then raise exception using errcode='P0002',message='PAYMENT_PROOF_NOT_FOUND';end if;
 if proof.customer_id is null then raise exception using errcode='23514',message='PAYMENT_PROOF_CUSTOMER_REQUIRED';end if;
 if proof.status='admitted' then
  if proof.confirmed_cents=p_confirmed_cents then return false;end if;
  raise exception using errcode='23505',message='PAYMENT_PROOF_AMOUNT_CONFLICT';
 end if;
 if proof.status<>'review' then
  raise exception using errcode='23514',message='PAYMENT_PROOF_CONFIRMATION_INVALID_STATE';
 end if;
 update public.payment_proofs
 set status='admitted',confirmed_cents=p_confirmed_cents,updated_at=now()
 where id=p_proof_id;
 insert into public.payment_proof_events(
  proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,metadata
 ) values(
  p_proof_id,'amount_confirmed',auth.uid(),p_actor_role,'operator',proof.status,'admitted',
  jsonb_build_object('confirmed_cents',p_confirmed_cents)
 );
 return true;
end$$;

create function public.confirm_payment_proof_amount(
 p_proof_id uuid,p_confirmed_cents integer,p_lease_token text
) returns boolean language plpgsql security definer set search_path='' as $$
declare role_at_action public.tipo_funcao;
begin
 role_at_action:=public.require_active_payment_proof_actor_role();
 perform public.assert_payment_proof_lease(p_proof_id,p_lease_token);
 return public.confirm_payment_proof_amount_authorized(p_proof_id,p_confirmed_cents,role_at_action);
end$$;

revoke all on function public.confirm_payment_proof_amount_authorized(uuid,integer,public.tipo_funcao) from public,anon,authenticated;
revoke all on function public.confirm_payment_proof_amount(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.confirm_payment_proof_amount(uuid,integer,text) to authenticated;
