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
  v_admitted boolean;
begin
  insert into public.mercado_pago_webhook_admissions (request_id, payment_id)
  values (p_request_id, p_payment_id)
  on conflict (request_id) do nothing
  returning true into v_admitted;

  return coalesce(v_admitted, false);
end;
$$;
