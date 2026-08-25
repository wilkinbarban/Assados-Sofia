-- `next_attempt_at` is intentionally NOT NULL. A terminal delivery retains the
-- timestamp of its final scheduling decision; terminal status, not NULL, stops
-- future claims and preserves the attempt timeline for audit.
create or replace function public.reivindicar_webhook_mercado_pago(
  p_request_id text,
  p_payment_id text,
  p_lease_seconds integer default 60
)
returns table(claimed boolean, delivery_status text, payment_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.mercado_pago_webhook_admissions%rowtype;
begin
  if p_request_id is null or p_payment_id is null or p_lease_seconds < 1 or p_lease_seconds > 300 then
    raise exception using errcode = '22023', message = 'DADOS_INVALIDOS';
  end if;

  select * into v_delivery
  from public.mercado_pago_webhook_admissions
  where request_id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'WEBHOOK_NAO_ADMITIDO';
  end if;
  if v_delivery.payment_id <> p_payment_id then
    raise exception using errcode = '23505', message = 'WEBHOOK_PAYMENT_ID_CONFLICT';
  end if;
  if v_delivery.delivery_status in ('completed', 'dead_letter') then
    return query select false, v_delivery.delivery_status, v_delivery.payment_id;
    return;
  end if;
  if v_delivery.delivery_status = 'processing' and v_delivery.claimed_until > now() then
    return query select false, v_delivery.delivery_status, v_delivery.payment_id;
    return;
  end if;

  update public.mercado_pago_webhook_admissions
  set delivery_status = 'processing',
      claimed_until = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_error = null
  where request_id = p_request_id;

  return query select true, 'processing'::text, p_payment_id;
end;
$$;

create or replace function public.falhar_webhook_mercado_pago(
  p_request_id text,
  p_payment_id text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean := false;
begin
  update public.mercado_pago_webhook_admissions
  set delivery_status = case when attempt_count >= 5 then 'dead_letter' else 'pending' end,
      claimed_until = null,
      next_attempt_at = case
        -- Keep an auditable, non-null terminal timestamp. Claim predicates
        -- exclude dead_letter rows, so it can never schedule more work.
        when attempt_count >= 5 then now()
        else now() + make_interval(secs => least(900, 15 * power(2, greatest(attempt_count - 1, 0))::integer))
      end,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'PROCESSAMENTO_FALHOU'), 500)
  where request_id = p_request_id
    and payment_id = p_payment_id
    and delivery_status = 'processing'
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke all on function public.reivindicar_webhook_mercado_pago(text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.falhar_webhook_mercado_pago(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.reivindicar_webhook_mercado_pago(text, text, integer) to service_role;
grant execute on function public.falhar_webhook_mercado_pago(text, text, text) to service_role;
