-- Lifecycle mutations are database-authoritative. Payment state deliberately
-- remains outside this transition authority.
create table if not exists public.pedido_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  idempotency_key uuid not null,
  actor_id uuid,
  previous_status public.status_pedido not null,
  target_status public.status_pedido not null,
  reason text,
  result_status public.status_pedido not null,
  created_at timestamptz not null default now(),
  unique (pedido_id, idempotency_key)
);

alter table public.pedido_lifecycle_events enable row level security;
revoke all on table public.pedido_lifecycle_events from public, anon, authenticated;
revoke insert, update, delete on public.pedido_lifecycle_events from public, anon, authenticated;
grant select on table public.pedido_lifecycle_events to authenticated;

drop policy if exists order_lifecycle_events_operator_read on public.pedido_lifecycle_events;
create policy order_lifecycle_events_operator_read
on public.pedido_lifecycle_events for select to authenticated
using (public.tem_funcoes(array[
  'admin'::public.tipo_funcao,
  'supervisor'::public.tipo_funcao,
  'vendedor'::public.tipo_funcao
]));

create or replace view public.relatorio_classificacao_legado_pedidos
with (security_invoker = true) as
select
  p.id as pedido_id,
  p.status,
  p.status_pagamento,
  p.estoque_estado,
  case
    when p.status = 'entregue'::public.status_pedido
      and p.status_pagamento <> 'aprovado' then 'needs_review'
    when p.status = 'confirmado'::public.status_pedido
      and p.estoque_estado <> 'aplicado' then 'legacy_stock_inconsistent'
    when p.status = 'novo'::public.status_pedido
      and p.estoque_estado <> 'pendente' then 'legacy_stock_inconsistent'
    when p.status = 'cancelado'::public.status_pedido
      and p.estoque_estado = 'aplicado' then 'legacy_stock_inconsistent'
    when p.status in ('novo'::public.status_pedido, 'confirmado'::public.status_pedido)
      and p.status_pagamento = 'aprovado' then 'legacy_payment_coupled'
    else 'coherent'
  end as classification
from public.pedidos p;

grant select on public.relatorio_classificacao_legado_pedidos to authenticated;

create or replace function public.enforce_order_lifecycle_status_write_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  trusted_owner pg_catalog.regrole;
begin
  select proowner into trusted_owner
  from pg_catalog.pg_proc
  where oid = 'public.processar_pedido_estoque(uuid,uuid,boolean)'::pg_catalog.regprocedure;

  if new.status is distinct from old.status
    and current_user::pg_catalog.regrole <> trusted_owner then
    raise exception using
      errcode = '42501',
      message = 'PEDIDO_LIFECYCLE_STATUS_WRITE_FORBIDDEN';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_order_lifecycle_status_write_boundary()
from public, anon, authenticated, service_role;

drop trigger if exists enforce_order_lifecycle_status_write_boundary on public.pedidos;
create trigger enforce_order_lifecycle_status_write_boundary
before update on public.pedidos
for each row
execute function public.enforce_order_lifecycle_status_write_boundary();

create or replace function public.transicionar_pedido(
  p_pedido_id uuid,
  p_novo_status public.status_pedido,
  p_idempotency_key uuid,
  p_reason text default null
)
returns table(
  pedido_id uuid,
  status public.status_pedido,
  valid_next_actions jsonb,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.pedidos%rowtype;
  v_event public.pedido_lifecycle_events%rowtype;
  v_previous_status public.status_pedido;
begin
  if p_pedido_id is null or p_novo_status is null or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'DADOS_INVALIDOS';
  end if;

  if v_actor is null then
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
      raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTENTICADO';
    end if;
  elsif not public.tem_funcoes(array[
    'admin'::public.tipo_funcao,
    'supervisor'::public.tipo_funcao,
    'vendedor'::public.tipo_funcao
  ]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  select * into v_order
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PEDIDO_NAO_ENCONTRADO';
  end if;

  select * into v_event
  from public.pedido_lifecycle_events
  where pedido_id = p_pedido_id and idempotency_key = p_idempotency_key;

  if found then
    if v_event.target_status <> p_novo_status
      or v_event.reason is distinct from nullif(btrim(p_reason), '') then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select v_order.id, v_order.status,
      case v_order.status
        when 'novo'::public.status_pedido then jsonb_build_array('confirmado', 'cancelado')
        when 'confirmado'::public.status_pedido then jsonb_build_array('entregue', 'cancelado')
        else '[]'::jsonb
      end,
      true;
    return;
  end if;

  v_previous_status := v_order.status;

  if (v_order.status = 'novo'::public.status_pedido
      and p_novo_status = 'confirmado'::public.status_pedido) then
    perform * from public.confirmar_pedido_estoque(p_pedido_id, p_idempotency_key);
  elsif (v_order.status = 'novo'::public.status_pedido
      and p_novo_status = 'cancelado'::public.status_pedido) then
    update public.pedidos
    set status = 'cancelado'::public.status_pedido,
        data_atualizacao = now()
    where id = p_pedido_id;
  elsif (v_order.status = 'confirmado'::public.status_pedido
      and p_novo_status = 'cancelado'::public.status_pedido) then
    perform * from public.cancelar_pedido_estoque(p_pedido_id, p_idempotency_key);
  elsif (v_order.status = 'confirmado'::public.status_pedido
      and p_novo_status = 'entregue'::public.status_pedido) then
    update public.pedidos
    set status = 'entregue'::public.status_pedido,
        data_atualizacao = now()
    where id = p_pedido_id;
  else
    raise exception using errcode = '23514', message = 'TRANSICAO_PEDIDO_INVALIDA';
  end if;

  select * into v_order from public.pedidos where id = p_pedido_id;
  insert into public.pedido_lifecycle_events(
    pedido_id, idempotency_key, actor_id, previous_status, target_status, reason, result_status
  ) values (
    p_pedido_id, p_idempotency_key, v_actor, v_previous_status,
    p_novo_status, nullif(btrim(p_reason), ''), v_order.status
  );

  return query
  select v_order.id, v_order.status,
    case v_order.status
      when 'novo'::public.status_pedido then jsonb_build_array('confirmado', 'cancelado')
      when 'confirmado'::public.status_pedido then jsonb_build_array('entregue', 'cancelado')
      else '[]'::jsonb
    end,
    false;
end
$$;

revoke all on function public.transicionar_pedido(uuid, public.status_pedido, uuid, text)
from public, anon;
grant execute on function public.transicionar_pedido(uuid, public.status_pedido, uuid, text)
to authenticated, service_role;

-- API callers must now use transicionar_pedido; the lifecycle function owner
-- and stock authority retain their required writes inside one transaction.
revoke update(status) on public.pedidos from anon, authenticated;
