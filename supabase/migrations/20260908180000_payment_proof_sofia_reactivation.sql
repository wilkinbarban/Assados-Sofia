-- Terminal payment-proof outcomes may return the customer to Sofía, but never
-- replace an explicit human handoff or an active operator cooldown.
create function public.reactivate_sofia_after_terminal_payment_proof(p_proof_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_reactivated boolean := false;
begin
  select customer_id into v_customer_id
  from public.payment_proofs
  where id = p_proof_id;

  if v_customer_id is null then
    return;
  end if;

  update public.whatsapp_sofia_states
  set sofia_dormindo = false,
      motivo = null,
      origem = 'operator',
      silenciada_ate = null,
      data_atualizacao = now()
  where cliente_id = v_customer_id
    and canal = 'whatsapp'
    and sofia_dormindo
    and motivo is distinct from 'manual'
    and motivo is distinct from 'opt_out'
    and (silenciada_ate is null or silenciada_ate <= now())
  returning true into v_reactivated;

  -- Conversation-level handoffs are independent authority. Reactivating the
  -- WhatsApp state must not fan out into Web/Telegram or another open thread.
  -- The channel router may resume only when both its own conversation flag and
  -- this WhatsApp state permit automation.
end
$$;

create function public.payment_proof_reconciliation_reactivates_sofia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.reactivate_sofia_after_terminal_payment_proof(new.proof_id);
  return new;
end
$$;

create function public.payment_proof_rejection_reactivates_sofia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.reactivate_sofia_after_terminal_payment_proof(new.proof_id);
  return new;
end
$$;

create trigger payment_proof_reconciliation_reactivates_sofia
  after insert on public.payment_proof_reconciliations
  for each row execute function public.payment_proof_reconciliation_reactivates_sofia();

create trigger payment_proof_rejection_reactivates_sofia
  after insert on public.payment_proof_events
  for each row
  when (
    new.event_type = 'operator_reviewed'
    and new.result_status = 'quarantined'
    and new.reason = 'reject'
  )
  execute function public.payment_proof_rejection_reactivates_sofia();

revoke all on function public.reactivate_sofia_after_terminal_payment_proof(uuid) from public, anon, authenticated;
revoke all on function public.payment_proof_reconciliation_reactivates_sofia() from public, anon, authenticated;
revoke all on function public.payment_proof_rejection_reactivates_sofia() from public, anon, authenticated;
