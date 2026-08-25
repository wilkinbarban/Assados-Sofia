-- Acknowledged Mercado Pago notifications must remain recoverable when the
-- application process or the provider lookup fails after admission.
alter table public.mercado_pago_webhook_admissions
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists claimed_until timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists completed_at timestamptz;

alter table public.mercado_pago_webhook_admissions
  drop constraint if exists mercado_pago_webhook_admissions_delivery_status_check;

alter table public.mercado_pago_webhook_admissions
  add constraint mercado_pago_webhook_admissions_delivery_status_check
    check (delivery_status in ('pending', 'processing', 'completed', 'dead_letter')) not valid;

alter table public.mercado_pago_webhook_admissions
  validate constraint mercado_pago_webhook_admissions_delivery_status_check;

alter table public.mercado_pago_webhook_admissions
  add column if not exists next_attempt_at timestamptz not null default now();

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

  if v_delivery.delivery_status = 'completed' then
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

create or replace function public.concluir_webhook_mercado_pago(
  p_request_id text,
  p_payment_id text
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
  set delivery_status = 'completed',
      claimed_until = null,
      completed_at = coalesce(completed_at, now()),
      last_error = null
  where request_id = p_request_id
    and payment_id = p_payment_id
    and delivery_status = 'processing'
  returning true into v_updated;

  return coalesce(v_updated, false);
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
        when attempt_count >= 5 then null
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

create or replace function public.reivindicar_proximo_webhook_mercado_pago(
  p_lease_seconds integer default 60
)
returns table(request_id text, payment_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.mercado_pago_webhook_admissions%rowtype;
begin
  if p_lease_seconds < 1 or p_lease_seconds > 300 then
    raise exception using errcode = '22023', message = 'DADOS_INVALIDOS';
  end if;

  select * into v_delivery
  from public.mercado_pago_webhook_admissions
  where (delivery_status = 'pending' and next_attempt_at <= now())
     or (delivery_status = 'processing' and claimed_until <= now())
  order by coalesce(next_attempt_at, claimed_until), request_id
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.mercado_pago_webhook_admissions
  set delivery_status = 'processing',
      claimed_until = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_error = null
  where public.mercado_pago_webhook_admissions.request_id = v_delivery.request_id;

  return query select v_delivery.request_id, v_delivery.payment_id;
end;
$$;

revoke all on function public.reivindicar_webhook_mercado_pago(text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.concluir_webhook_mercado_pago(text, text) from public, anon, authenticated, service_role;
revoke all on function public.falhar_webhook_mercado_pago(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reivindicar_proximo_webhook_mercado_pago(integer) from public, anon, authenticated, service_role;
grant execute on function public.reivindicar_webhook_mercado_pago(text, text, integer) to service_role;
grant execute on function public.concluir_webhook_mercado_pago(text, text) to service_role;
grant execute on function public.falhar_webhook_mercado_pago(text, text, text) to service_role;
grant execute on function public.reivindicar_proximo_webhook_mercado_pago(integer) to service_role;
