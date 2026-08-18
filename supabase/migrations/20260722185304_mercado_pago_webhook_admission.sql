create table public.mercado_pago_webhook_admissions (
  request_id text primary key,
  payment_id text not null,
  admitted_at timestamptz not null default now()
);

alter table public.mercado_pago_webhook_admissions enable row level security;
revoke all on table public.mercado_pago_webhook_admissions from public, anon, authenticated, service_role;

create or replace function public.admitir_webhook_mercado_pago(
  p_request_id text,
  p_payment_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admitted boolean := false;
begin
  insert into public.mercado_pago_webhook_admissions (request_id, payment_id)
  values (p_request_id, p_payment_id)
  on conflict (request_id) do nothing
  returning true into v_admitted;

  return v_admitted;
end;
$$;

revoke all on function public.admitir_webhook_mercado_pago(text, text) from public, anon, authenticated, service_role;
grant execute on function public.admitir_webhook_mercado_pago(text, text) to service_role;
