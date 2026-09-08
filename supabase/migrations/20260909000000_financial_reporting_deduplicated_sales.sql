-- Forward-only correction: sales aggregates are distinct orders, never payment-event totals.
create or replace function public.get_financial_operational_reporting(
  p_start timestamptz,
  p_end timestamptz
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode='42501', message='FINANCIAL_REPORTING_SERVICE_ROLE_REQUIRED';
  end if;
  if p_start is null or p_end is null or p_start >= p_end or p_end - p_start > interval '366 days' then
    raise exception using errcode='22023', message='FINANCIAL_REPORTING_PERIOD_INVALID';
  end if;

  select jsonb_build_object('period', jsonb_build_object('start_at', p_start, 'end_at', p_end), 'receivables', jsonb_build_object(
    'opened_count', count(*), 'opened_centavos', coalesce(sum(r.amount_total_centavos), 0), 'settled_count', count(s.id), 'settled_centavos', coalesce(sum(s.amount_centavos), 0),
    'open_count', count(*) filter (where s.id is null), 'open_centavos', coalesce(sum(r.amount_total_centavos) filter (where s.id is null), 0))) into v
  from public.accounts_receivable r left join public.accounts_receivable_settlements s on s.receivable_id = r.id
  where r.created_at >= p_start and r.created_at < p_end;

  v := v || (select jsonb_build_object('cash', jsonb_build_object('sessions_opened', count(*), 'sessions_closed', count(c.id), 'opening_float_centavos', coalesce(sum(s.opening_float_centavos), 0), 'closing_difference_centavos', coalesce(sum(c.difference_centavos), 0))) from public.cash_sessions s left join public.cash_session_closures c on c.session_id = s.id where s.opened_at >= p_start and s.opened_at < p_end);
  v := v || (select jsonb_build_object('provider_settlements', jsonb_build_object('count', count(*), 'gross_centavos', coalesce(sum(gross_centavos), 0), 'fees_centavos', coalesce(sum(fee_centavos), 0), 'net_centavos', coalesce(sum(net_centavos), 0), 'bank_reconciled_count', count(r.id), 'bank_reconciled_centavos', coalesce(sum(s.net_centavos) filter (where r.id is not null), 0), 'bank_unreconciled_count', count(*) filter (where r.id is null), 'bank_unreconciled_centavos', coalesce(sum(s.net_centavos) filter (where r.id is null), 0))) from public.financial_settlements s left join public.bank_reconciliations r on r.settlement_id = s.id where s.created_at >= p_start and s.created_at < p_end);

  v := v || (
    with approved as (
      select distinct e.pedido_id from public.pedido_payment_events e
      where e.result_status = 'aprovado'::public.status_pagamento and e.created_at >= p_start and e.created_at < p_end
    ), refunded as (
      select distinct e.pedido_id from public.pedido_payment_events e
      where e.result_status = 'reembolsado'::public.status_pagamento and e.created_at >= p_start and e.created_at < p_end
    )
    select jsonb_build_object(
      'refunds', jsonb_build_object('events', (select count(*) from refunded), 'centavos', coalesce((select sum(o.total_pedido_centavos) from refunded x join public.pedidos o on o.id = x.pedido_id), 0)),
      'sales', jsonb_build_object(
        'approved_order_count', (select count(*) from approved),
        'gross_approved_centavos', coalesce((select sum(o.total_pedido_centavos) from approved x join public.pedidos o on o.id = x.pedido_id), 0),
        'refunded_order_count', (select count(*) from refunded),
        'refunds_centavos', coalesce((select sum(o.total_pedido_centavos) from refunded x join public.pedidos o on o.id = x.pedido_id), 0),
        'net_operational_centavos', coalesce((select sum(o.total_pedido_centavos) from approved x join public.pedidos o on o.id = x.pedido_id), 0) - coalesce((select sum(o.total_pedido_centavos) from refunded x join public.pedidos o on o.id = x.pedido_id), 0)
      )
    )
  );
  v := v || jsonb_build_object('scope', jsonb_build_object('operational_only', true, 'fiscal_accounting', false, 'double_entry', false, 'partial_or_combined_payments', false));
  return v;
end $$;

revoke all on function public.get_financial_operational_reporting(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_financial_operational_reporting(timestamptz, timestamptz) to service_role;
comment on function public.get_financial_operational_reporting(timestamptz, timestamptz) is 'Aggregate operational CxC, cash, provider fees, and distinct-order sales/refunds for [start,end); no PII/identifiers/references; not fiscal or double-entry accounting.';
