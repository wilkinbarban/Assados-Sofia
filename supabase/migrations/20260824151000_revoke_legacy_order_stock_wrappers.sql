-- Stock wrappers are implementation details of transicionar_pedido. Allowing
-- API roles to call them bypasses lifecycle events and audit idempotency.
revoke all on function public.confirmar_pedido_estoque(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancelar_pedido_estoque(uuid, uuid) from public, anon, authenticated, service_role;
