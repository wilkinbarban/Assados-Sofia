-- Sanitized, backend-only customer payment-proof status for Sofia.
create function public.get_customer_payment_proof_public_status(
  p_customer_id uuid,
  p_pedido_id uuid default null
) returns table(proof_status text, payment_status text)
language plpgsql security definer set search_path='' as $$
declare
  v_pedido public.pedidos%rowtype;
  v_proof_status text;
  v_has_event boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode='42501', message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';
  end if;
  if p_customer_id is null then
    raise exception using errcode='22023', message='PAYMENT_PROOF_CUSTOMER_REQUIRED';
  end if;

  if p_pedido_id is not null then
    select * into v_pedido from public.pedidos
    where id=p_pedido_id and cliente_id=p_customer_id;
    if not found then
      return query select 'indisponivel'::text, 'indisponivel'::text;
      return;
    end if;

    select p.status, exists(
      select 1 from public.payment_proof_events e where e.proof_id=p.id
    ) into v_proof_status, v_has_event
    from public.payment_proofs p
    where p.customer_id=p_customer_id and (
      exists(select 1 from public.payment_proof_order_intents i where i.proof_id=p.id and i.pedido_id=p_pedido_id)
      or exists(select 1 from public.payment_proof_order_links l where l.proof_id=p.id and l.pedido_id=p_pedido_id)
    )
    order by p.created_at desc
    limit 1;
  else
    select p.status, exists(
      select 1 from public.payment_proof_events e where e.proof_id=p.id
    ) into v_proof_status, v_has_event
    from public.payment_proofs p
    where p.customer_id=p_customer_id
    order by p.created_at desc
    limit 1;

    select * into v_pedido from public.pedidos
    where cliente_id=p_customer_id
    order by data_criacao desc, id desc
    limit 1;
  end if;

  return query select
    case
      when v_proof_status in ('received','identity_pending','processing','review','admitted') and v_has_event then 'em_analise'
      when v_proof_status in ('duplicate','quarantined','purging','purged') then 'indisponivel'
      else 'indisponivel'
    end,
    case v_pedido.status_pagamento
      when 'pendente'::public.status_pagamento then 'em_analise'
      when 'aprovado'::public.status_pagamento then 'atualizado'
      when 'rejeitado'::public.status_pagamento then 'indisponivel'
      when 'reembolsado'::public.status_pagamento then 'indisponivel'
      else 'indisponivel'
    end;
end $$;

revoke all on function public.get_customer_payment_proof_public_status(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_customer_payment_proof_public_status(uuid,uuid) to service_role;
