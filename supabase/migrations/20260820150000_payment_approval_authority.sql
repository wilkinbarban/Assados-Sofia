-- Payment mutations are independently authoritative and append auditable
-- provenance. This authority intentionally never writes pedidos.status.
create table if not exists public.pedido_payment_events (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  source text not null check (source in ('manual', 'mercado_pago')),
  actor_id uuid,
  external_reference text,
  reason text,
  previous_status public.status_pagamento not null,
  target_status public.status_pagamento not null,
  result_status public.status_pagamento not null,
  created_at timestamptz not null default now(),
  check (
    (source = 'manual' and actor_id is not null and nullif(btrim(reason), '') is not null and external_reference is null)
    or
    (source = 'mercado_pago' and actor_id is null and nullif(btrim(external_reference), '') is not null and reason is null)
  )
);

create unique index if not exists pedido_payment_events_mercado_pago_reference_key
  on public.pedido_payment_events (external_reference)
  where source = 'mercado_pago';

alter table public.pedido_payment_events enable row level security;
revoke all on table public.pedido_payment_events from public, anon, authenticated;
revoke insert, update, delete on public.pedido_payment_events from public, anon, authenticated;
grant select on table public.pedido_payment_events to authenticated;

drop policy if exists pedido_payment_events_operator_read on public.pedido_payment_events;
create policy pedido_payment_events_operator_read
on public.pedido_payment_events for select to authenticated
using (public.tem_funcoes(array[
  'admin'::public.tipo_funcao,
  'supervisor'::public.tipo_funcao,
  'vendedor'::public.tipo_funcao
]));

create or replace function public.registrar_status_pagamento(
  p_pedido_id uuid,
  p_novo_status public.status_pagamento,
  p_source text,
  p_external_reference text default null,
  p_reason text default null
)
returns table(
  pedido_id uuid,
  status_pagamento public.status_pagamento,
  idempotent boolean,
  google_event_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.pedidos%rowtype;
  v_event public.pedido_payment_events%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_external_reference text := nullif(btrim(p_external_reference), '');
begin
  if p_pedido_id is null or p_novo_status is null or p_source not in ('manual', 'mercado_pago') then
    raise exception using errcode = '22023', message = 'DADOS_PAGAMENTO_INVALIDOS';
  end if;

  if p_source = 'manual' then
    if v_actor is null then
      raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTENTICADO';
    end if;
    if not public.tem_funcoes(array[
      'admin'::public.tipo_funcao,
      'supervisor'::public.tipo_funcao,
      'vendedor'::public.tipo_funcao
    ]) then
      raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
    end if;
    if v_reason is null then
      raise exception using errcode = '22023', message = 'MANUAL_PAYMENT_REASON_REQUIRED';
    end if;
    if v_external_reference is not null then
      raise exception using errcode = '22023', message = 'MANUAL_PAYMENT_EXTERNAL_REFERENCE_FORBIDDEN';
    end if;
  else
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
      raise exception using errcode = '42501', message = 'MERCADO_PAGO_SERVICE_ROLE_REQUIRED';
    end if;
    if v_actor is not null then
      raise exception using errcode = '42501', message = 'MERCADO_PAGO_ACTOR_FORBIDDEN';
    end if;
    if v_external_reference is null then
      raise exception using errcode = '22023', message = 'MERCADO_PAGO_EXTERNAL_REFERENCE_REQUIRED';
    end if;
    if v_reason is not null then
      raise exception using errcode = '22023', message = 'MERCADO_PAGO_REASON_FORBIDDEN';
    end if;
  end if;

  select * into v_order from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PEDIDO_NAO_ENCONTRADO';
  end if;

  if p_source = 'mercado_pago' then
    select * into v_event
    from public.pedido_payment_events
    where source = 'mercado_pago' and external_reference = v_external_reference;

    if found then
      if v_event.pedido_id <> p_pedido_id or v_event.target_status <> p_novo_status then
        raise exception using errcode = '23505', message = 'MERCADO_PAGO_EXTERNAL_REFERENCE_CONFLICT';
      end if;

      return query select v_order.id, v_order.status_pagamento, true, v_order.google_event_id;
      return;
    end if;
  end if;

  update public.pedidos
  set status_pagamento = p_novo_status,
      mercado_pago_pagamento_id = case when p_source = 'mercado_pago' then v_external_reference else mercado_pago_pagamento_id end,
      data_atualizacao = now()
  where id = p_pedido_id;

  insert into public.pedido_payment_events(
    pedido_id, source, actor_id, external_reference, reason, previous_status, target_status, result_status
  ) values (
    p_pedido_id, p_source, v_actor, v_external_reference, v_reason,
    v_order.status_pagamento, p_novo_status, p_novo_status
  );

  select * into v_order from public.pedidos where id = p_pedido_id;
  return query select v_order.id, v_order.status_pagamento, false, v_order.google_event_id;
end
$$;

revoke all on function public.registrar_status_pagamento(
  uuid, public.status_pagamento, text, text, text
) from public, anon;
grant execute on function public.registrar_status_pagamento(
  uuid, public.status_pagamento, text, text, text
) to authenticated, service_role;

revoke update(status_pagamento) on public.pedidos from anon, authenticated;
