-- Permit a fresh customer payment route after a rejected attempt while retaining
-- cancellation/refund terminality and the active-payment-proof lock.
create or replace function public.assert_order_payment_available(p_pedido_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_order public.pedidos%rowtype;
begin
  select * into v_order from public.pedidos where id=p_pedido_id for update;
  if not found then
    raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO';
  end if;
  if v_order.status='cancelado'
    or v_order.status_pagamento not in ('pendente','rejeitado') then
    raise exception using errcode='23514',message='ORDER_PAYMENT_ROUTE_INELIGIBLE';
  end if;
  if public.is_order_payment_proof_locked(p_pedido_id) then
    raise exception using errcode='23514',message='ORDER_PAYMENT_PROOF_ALREADY_PENDING';
  end if;
  return true;
end $$;
revoke all on function public.assert_order_payment_available(uuid) from public,anon,authenticated;
grant execute on function public.assert_order_payment_available(uuid) to authenticated,service_role;
