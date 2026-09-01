create or replace function public.manage_payment_proof_review(
  p_proof_id uuid,
  p_operation text,
  p_value text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.payment_proofs%rowtype;
  v_customer uuid;
  v_amount integer;
  v_status text;
  v_purge_after timestamptz;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.perfis
    where id = auth.uid()
      and ativo
      and funcao in ('admin', 'supervisor')
  ) then
    raise exception using errcode = '42501', message = 'PAYMENT_PROOF_REVIEWER_REQUIRED';
  end if;

  select *
  into v
  from public.payment_proofs
  where id = p_proof_id
  for update;

  if not found then
    raise exception using message = 'PAYMENT_PROOF_NOT_FOUND';
  end if;

  if p_operation = 'identify' then
    v_customer := p_value::uuid;
    v_status := 'review';
  elsif p_operation = 'confirm_amount' then
    v_amount := p_value::integer;
    if v_amount < 0 then
      raise exception using message = 'PAYMENT_PROOF_AMOUNT_INVALID';
    end if;
    v_status := 'review';
  elsif p_operation = 'admit' then
    if v.customer_id is null or v.confirmed_cents is null then
      raise exception using message = 'PAYMENT_PROOF_REVIEW_INCOMPLETE';
    end if;
    v_status := 'admitted';
  elsif p_operation = 'reject' then
    v_purge_after := now() + interval '10 days';

    update public.payment_proofs
    set status = 'quarantined',
        quarantined_at = now(),
        purge_after = v_purge_after,
        updated_at = now()
    where id = p_proof_id;

    insert into public.payment_proof_events(
      proof_id,
      event_type,
      actor_id,
      source,
      previous_status,
      result_status,
      reason
    ) values (
      p_proof_id,
      'operator_reviewed',
      auth.uid(),
      'operator',
      v.status,
      'quarantined',
      'reject'
    );

    insert into public.payment_proof_outbox(proof_id, event_type, channel, payload)
    values (
      p_proof_id,
      'payment_proof_rejected',
      v.channel,
      jsonb_build_object('message_key', 'payment_proof_under_review')
    )
    on conflict do nothing;

    return true;
  elsif p_operation = 'purge' then
    if auth.jwt()->>'role' <> 'service_role' then
      raise exception using errcode = '42501', message = 'PAYMENT_PROOF_PURGE_SERVICE_REQUIRED';
    end if;
    v_status := 'purged';
  else
    raise exception using errcode = '22023', message = 'PAYMENT_PROOF_OPERATION_INVALID';
  end if;

  update public.payment_proofs
  set customer_id = coalesce(v_customer, customer_id),
      confirmed_cents = coalesce(v_amount, confirmed_cents),
      status = v_status,
      updated_at = now()
  where id = p_proof_id;

  insert into public.payment_proof_events(
    proof_id,
    event_type,
    actor_id,
    source,
    previous_status,
    result_status,
    reason
  ) values (
    p_proof_id,
    'operator_reviewed',
    auth.uid(),
    'operator',
    v.status,
    v_status,
    p_operation
  );

  return true;
end
$$;

revoke all on function public.manage_payment_proof_review(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.manage_payment_proof_review(uuid, text, text)
to authenticated;
