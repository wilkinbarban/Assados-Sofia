-- Delivery requires an approved payment. A supervisor/admin may record a
-- deliberate exception, which atomically creates the receivable and alert.
create table public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos(id),
  amount_total_centavos integer not null check (amount_total_centavos >= 0),
  status text not null default 'open' check (status = 'open'),
  supervisor_alert_required boolean not null default true check (supervisor_alert_required),
  created_by uuid not null references auth.users(id),
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_at timestamptz not null default now()
);

create table public.accounts_receivable_events (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.accounts_receivable(id),
  pedido_id uuid not null references public.pedidos(id),
  idempotency_key uuid not null,
  event_type text not null default 'delivery_without_approved_payment' check (event_type = 'delivery_without_approved_payment'),
  actor_id uuid not null references auth.users(id),
  reason text not null check (nullif(btrim(reason), '') is not null),
  amount_total_centavos integer not null check (amount_total_centavos >= 0),
  created_at timestamptz not null default now(),
  unique (pedido_id, idempotency_key)
);

create function public.reject_accounts_receivable_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'ACCOUNTS_RECEIVABLE_IMMUTABLE';
end $$;

drop trigger if exists accounts_receivable_immutable on public.accounts_receivable;
create trigger accounts_receivable_immutable before update or delete on public.accounts_receivable
for each row execute function public.reject_accounts_receivable_mutation();
drop trigger if exists accounts_receivable_events_immutable on public.accounts_receivable_events;
create trigger accounts_receivable_events_immutable before update or delete on public.accounts_receivable_events
for each row execute function public.reject_accounts_receivable_mutation();

alter table public.accounts_receivable enable row level security;
alter table public.accounts_receivable_events enable row level security;
revoke all on public.accounts_receivable, public.accounts_receivable_events from public, anon, authenticated, service_role;
grant select on public.accounts_receivable, public.accounts_receivable_events to authenticated;
create policy accounts_receivable_manager_read on public.accounts_receivable for select to authenticated
using (public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));
create policy accounts_receivable_events_manager_read on public.accounts_receivable_events for select to authenticated
using (public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));


create or replace function public.transicionar_pedido(
  p_pedido_id uuid, p_novo_status public.status_pedido, p_idempotency_key uuid, p_reason text default null
) returns table(pedido_id uuid, status public.status_pedido, valid_next_actions jsonb, idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_order public.pedidos%rowtype; v_event public.pedido_lifecycle_events%rowtype; v_previous public.status_pedido; v_reason text := nullif(btrim(p_reason), '');
begin
  if p_pedido_id is null or p_novo_status is null or p_idempotency_key is null then raise exception using errcode='22023',message='DADOS_INVALIDOS'; end if;
  if v_actor is null then if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception using errcode='42501',message='USUARIO_NAO_AUTENTICADO'; end if;
  elsif not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
  select * into v_order from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO'; end if;
  select e.* into v_event from public.pedido_lifecycle_events e where e.pedido_id=p_pedido_id and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.target_status<>p_novo_status or v_event.reason is distinct from v_reason then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    return query select v_order.id,v_order.status,case v_order.status when 'novo'::public.status_pedido then jsonb_build_array('confirmado','cancelado') when 'confirmado'::public.status_pedido then jsonb_build_array('entregue','cancelado') else '[]'::jsonb end,true; return;
  end if;
  v_previous:=v_order.status;
  if v_order.status='novo'::public.status_pedido and p_novo_status='confirmado'::public.status_pedido then perform * from public.confirmar_pedido_estoque(p_pedido_id,p_idempotency_key);
  elsif v_order.status='novo'::public.status_pedido and p_novo_status='cancelado'::public.status_pedido then update public.pedidos set status='cancelado'::public.status_pedido,data_atualizacao=now() where id=p_pedido_id;
  elsif v_order.status='confirmado'::public.status_pedido and p_novo_status='cancelado'::public.status_pedido then perform * from public.cancelar_pedido_estoque(p_pedido_id,p_idempotency_key);
  elsif v_order.status='confirmado'::public.status_pedido and p_novo_status='entregue'::public.status_pedido then
    if v_order.status_pagamento <> 'aprovado'::public.status_pagamento then raise exception using errcode='23514',message='DELIVERY_PAYMENT_APPROVAL_REQUIRED'; end if;
    update public.pedidos set status='entregue'::public.status_pedido,data_atualizacao=now() where id=p_pedido_id;
  else raise exception using errcode='23514',message='TRANSICAO_PEDIDO_INVALIDA'; end if;
  select * into v_order from public.pedidos where id=p_pedido_id;
  insert into public.pedido_lifecycle_events(pedido_id,idempotency_key,actor_id,previous_status,target_status,reason,result_status) values(p_pedido_id,p_idempotency_key,v_actor,v_previous,p_novo_status,v_reason,v_order.status);
  return query select v_order.id,v_order.status,case v_order.status when 'novo'::public.status_pedido then jsonb_build_array('confirmado','cancelado') when 'confirmado'::public.status_pedido then jsonb_build_array('entregue','cancelado') else '[]'::jsonb end,false;
end $$;

create function public.entregar_pedido_sem_pagamento_aprovado(p_pedido_id uuid, p_idempotency_key uuid, p_reason text)
returns table(pedido_id uuid, receivable_id uuid, status public.status_pedido, idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_order public.pedidos%rowtype; v_event public.accounts_receivable_events%rowtype; v_receivable public.accounts_receivable%rowtype; v_reason text:=nullif(btrim(p_reason),'');
begin
  if p_pedido_id is null or p_idempotency_key is null or v_reason is null then raise exception using errcode='22023',message='DELIVERY_EXCEPTION_REASON_REQUIRED'; end if;
  if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]) then raise exception using errcode='42501',message='DELIVERY_EXCEPTION_SUPERVISOR_REQUIRED'; end if;
  select * into v_order from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO'; end if;
  select e.* into v_event from public.accounts_receivable_events e where e.pedido_id=p_pedido_id and e.idempotency_key=p_idempotency_key;
  if found then
    if v_event.reason<>v_reason or v_event.actor_id<>v_actor then raise exception using errcode='23505',message='DELIVERY_EXCEPTION_IDEMPOTENCY_CONFLICT'; end if;
    select * into v_receivable from public.accounts_receivable where id=v_event.receivable_id;
    return query select p_pedido_id,v_receivable.id,v_order.status,true; return;
  end if;
  if v_order.status<>'confirmado'::public.status_pedido then raise exception using errcode='23514',message='TRANSICAO_PEDIDO_INVALIDA'; end if;
  if v_order.status_pagamento='aprovado'::public.status_pagamento then raise exception using errcode='23514',message='DELIVERY_EXCEPTION_PAYMENT_ALREADY_APPROVED'; end if;
  insert into public.accounts_receivable(pedido_id,amount_total_centavos,created_by,reason) values(p_pedido_id,v_order.total_pedido_centavos,v_actor,v_reason) returning * into v_receivable;
  update public.pedidos set status='entregue'::public.status_pedido,data_atualizacao=now() where id=p_pedido_id;
  insert into public.accounts_receivable_events(receivable_id,pedido_id,idempotency_key,actor_id,reason,amount_total_centavos) values(v_receivable.id,p_pedido_id,p_idempotency_key,v_actor,v_reason,v_order.total_pedido_centavos) returning * into v_event;
  insert into public.pedido_lifecycle_events(pedido_id,idempotency_key,actor_id,previous_status,target_status,reason,result_status) values(p_pedido_id,p_idempotency_key,v_actor,'confirmado','entregue',v_reason,'entregue');
  return query select p_pedido_id,v_receivable.id,'entregue'::public.status_pedido,false;
end $$;
revoke all on function public.entregar_pedido_sem_pagamento_aprovado(uuid,uuid,text) from public, anon;
grant execute on function public.entregar_pedido_sem_pagamento_aprovado(uuid,uuid,text) to authenticated;
