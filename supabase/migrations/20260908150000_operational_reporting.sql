-- Aggregate operational KPIs only. This RPC is not accounting, a bank
-- reconciliation, or a source of customer, order, payment, or provider records.
create or replace function public.get_operational_reporting(
  p_start timestamptz,
  p_end timestamptz
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode='42501', message='OPERATIONAL_REPORTING_SERVICE_ROLE_REQUIRED';
  end if;
  if p_start is null or p_end is null or p_start >= p_end
     or p_end - p_start > interval '366 days' then
    raise exception using errcode='22023', message='OPERATIONAL_REPORTING_PERIOD_INVALID';
  end if;

  select jsonb_build_object(
    'period', jsonb_build_object('start_at', p_start, 'end_at', p_end),
    'orders', jsonb_build_object(
      'created', count(*),
      'novo', count(*) filter (where o.status='novo'),
      'confirmado', count(*) filter (where o.status='confirmado'),
      'entregue', count(*) filter (where o.status='entregue'),
      'cancelado', count(*) filter (where o.status='cancelado')
    )
  ) into v_result
  from public.pedidos o
  where o.data_criacao >= p_start and o.data_criacao < p_end;

  v_result := v_result || (
    select jsonb_build_object('payments', jsonb_build_object(
      'approved_events', count(*) filter (where e.result_status='aprovado'::public.status_pagamento),
      'refunded_events', count(*) filter (where e.result_status='reembolsado'::public.status_pagamento)
    ))
    from public.pedido_payment_events e
    where e.created_at >= p_start and e.created_at < p_end
  );

  v_result := v_result || (
    select jsonb_build_object('proof_funnel', jsonb_build_object(
      'received', count(*),
      'admitted', count(*) filter (where exists (
        select 1 from public.payment_proof_events e
        where e.proof_id=p.id and e.result_status='admitted'
      )),
      'reconciled', count(*) filter (where exists (
        select 1 from public.payment_proof_reconciliations r where r.proof_id=p.id
      )),
      'review', count(*) filter (where p.status='review'),
      'quarantined', count(*) filter (where p.status='quarantined'),
      'duplicate', count(*) filter (where p.status='duplicate'),
      'purged', count(*) filter (where p.status='purged')
    ))
    from public.payment_proofs p
    where p.created_at >= p_start and p.created_at < p_end
  );

  v_result := v_result || (
    select jsonb_build_object('proof_sla', jsonb_build_object(
      'admitted_within_60m', count(*) filter (where admitted_at <= p.created_at + interval '60 minutes'),
      'admitted_over_60m', count(*) filter (where admitted_at > p.created_at + interval '60 minutes'),
      'open_0_to_60m', count(*) filter (where p.status in ('received','identity_pending','processing','review') and p.created_at >= p_end - interval '60 minutes'),
      'open_61m_to_24h', count(*) filter (where p.status in ('received','identity_pending','processing','review') and p.created_at < p_end - interval '60 minutes' and p.created_at >= p_end - interval '24 hours'),
      'open_over_24h', count(*) filter (where p.status in ('received','identity_pending','processing','review') and p.created_at < p_end - interval '24 hours')
    ))
    from public.payment_proofs p
    left join lateral (
      select min(e.created_at) as admitted_at
      from public.payment_proof_events e
      where e.proof_id=p.id and e.result_status='admitted'
    ) admission on true
    where p.created_at >= p_start and p.created_at < p_end
  );

  v_result := v_result || (
    select jsonb_build_object('channel', jsonb_build_object(
      'web', count(*) filter (where p.channel='web'),
      'whatsapp', count(*) filter (where p.channel='whatsapp'),
      'telegram', count(*) filter (where p.channel='telegram')
    ))
    from public.payment_proofs p
    where p.created_at >= p_start and p.created_at < p_end
  );

  v_result := v_result || (
    select jsonb_build_object('operational_value_cents', jsonb_build_object(
      'gross_approved', coalesce(sum(o.total_pedido_centavos) filter (where e.result_status='aprovado'::public.status_pagamento),0),
      'refunds', coalesce(sum(o.total_pedido_centavos) filter (where e.result_status='reembolsado'::public.status_pagamento),0),
      'net', coalesce(sum(o.total_pedido_centavos) filter (where e.result_status='aprovado'::public.status_pagamento),0)
        - coalesce(sum(o.total_pedido_centavos) filter (where e.result_status='reembolsado'::public.status_pagamento),0)
    ))
    from public.pedido_payment_events e
    join public.pedidos o on o.id=e.pedido_id
    where e.created_at >= p_start and e.created_at < p_end
  );
  return v_result;
end $$;

revoke all on function public.get_operational_reporting(timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_operational_reporting(timestamptz,timestamptz) to service_role;
comment on function public.get_operational_reporting(timestamptz,timestamptz) is
  'Fixed aggregate operational KPIs for [start_at,end_at); not accounting, bank reconciliation, or a source of PII, identifiers, payment references, provider keys, or transaction records.';
