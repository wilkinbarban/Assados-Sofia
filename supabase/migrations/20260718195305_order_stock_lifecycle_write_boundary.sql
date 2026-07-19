-- Keep lifecycle state writable only through the trusted order-stock function owner.
create function public.enforce_order_stock_lifecycle_write_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  forbidden boolean := false;
begin
  if current_user::pg_catalog.regrole <> (
      select proowner
      from pg_catalog.pg_proc
      where oid = 'public.processar_pedido_estoque(uuid,uuid,boolean)'::pg_catalog.regprocedure
    )
  then
    if tg_op = 'INSERT' then
      forbidden := new.estoque_estado <> 'pendente'
        or new.estoque_confirmacao_correlation is not null
        or new.estoque_cancelamento_correlation is not null;
    else
      forbidden := (
      new.estoque_estado is distinct from old.estoque_estado
      or new.estoque_confirmacao_correlation is distinct from old.estoque_confirmacao_correlation
      or new.estoque_cancelamento_correlation is distinct from old.estoque_cancelamento_correlation
      );
    end if;
  end if;

  if forbidden then
    raise exception using
      errcode = '42501',
      message = 'PEDIDO_ESTOQUE_LIFECYCLE_WRITE_FORBIDDEN';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_order_stock_lifecycle_write_boundary()
from public, anon, authenticated, service_role;

create trigger enforce_order_stock_lifecycle_write_boundary
before insert or update on public.pedidos
for each row
execute function public.enforce_order_stock_lifecycle_write_boundary();
