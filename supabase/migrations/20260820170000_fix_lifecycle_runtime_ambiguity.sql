-- Fix runtime PL/pgSQL name resolution for the lifecycle idempotency lookup.
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
  from public.pedido_lifecycle_events e
  where e.pedido_id = p_pedido_id and e.idempotency_key = p_idempotency_key;

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

