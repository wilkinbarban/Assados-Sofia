-- JD3 final forward correction: append-only provider reversals and retry-safe Auth deletion.
-- Provider delivery identity is distinct from the payment reference: a refund can be
-- audited without changing the approval row that established the original payment.
alter table public.pedido_payment_events
  add column if not exists idempotency_key uuid;

alter table public.pedido_payment_events
  add column if not exists provider_delivery_id text;

update public.pedido_payment_events
set provider_delivery_id = external_reference
where source = 'mercado_pago' and provider_delivery_id is null;


drop index if exists public.pedido_payment_events_mercado_pago_reference_key;
create unique index if not exists pedido_payment_events_mercado_pago_delivery_key
  on public.pedido_payment_events (provider_delivery_id)
  where source = 'mercado_pago';

alter table public.perfis
  add column if not exists auth_delete_completed_at timestamptz;

drop function if exists public.registrar_status_pagamento(uuid,public.status_pagamento,text,text,text,uuid);

create or replace function public.registrar_status_pagamento(
  p_pedido_id uuid, p_novo_status public.status_pagamento, p_source text,
  p_external_reference text default null, p_reason text default null,
  p_idempotency_key uuid default null, p_provider_delivery_id text default null
) returns table(pedido_id uuid,status_pagamento public.status_pagamento,idempotent boolean,google_event_id text)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_order public.pedidos%rowtype;
  v_delivery public.pedido_payment_events%rowtype;
  v_approval public.pedido_payment_events%rowtype;
  v_reversal public.pedido_payment_events%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_external_reference text := nullif(btrim(p_external_reference), '');
  v_provider_delivery_id text := nullif(btrim(p_provider_delivery_id), '');
begin
  if p_pedido_id is null or p_novo_status is null or p_source not in ('manual', 'mercado_pago') then
    raise exception using errcode='22023', message='DADOS_PAGAMENTO_INVALIDOS';
  end if;
  if p_source = 'mercado_pago' then
    if coalesce(auth.jwt()->>'role', '') <> 'service_role' or v_actor is not null then raise exception using errcode='42501', message='MERCADO_PAGO_SERVICE_ROLE_REQUIRED'; end if;
    if v_external_reference is null or v_provider_delivery_id is null then raise exception using errcode='22023', message='MERCADO_PAGO_DELIVERY_ID_REQUIRED'; end if;
    if v_reason is not null then raise exception using errcode='22023', message='MERCADO_PAGO_REASON_FORBIDDEN'; end if;
  else
    if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]) then raise exception using errcode='42501', message='USUARIO_NAO_AUTORIZADO'; end if;
    if v_reason is null or p_idempotency_key is null then raise exception using errcode='22023', message='MANUAL_PAYMENT_INPUT_INVALID'; end if;
    if v_external_reference is not null or v_provider_delivery_id is not null then raise exception using errcode='22023', message='MANUAL_PAYMENT_EXTERNAL_REFERENCE_FORBIDDEN'; end if;
  end if;

  select * into v_order from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception using errcode='P0002', message='PEDIDO_NAO_ENCONTRADO'; end if;

  if p_source = 'manual' then
    select e.* into v_delivery from public.pedido_payment_events e where e.source='manual' and e.pedido_id=p_pedido_id and e.idempotency_key=p_idempotency_key;
    if found then
      if v_delivery.target_status <> p_novo_status or v_delivery.reason is distinct from v_reason or v_delivery.actor_id is distinct from v_actor then raise exception using errcode='23505', message='MANUAL_PAYMENT_IDEMPOTENCY_CONFLICT'; end if;
      return query select v_order.id, v_delivery.result_status, true, v_order.google_event_id::text; return;
    end if;
  else
    select e.* into v_delivery from public.pedido_payment_events e where e.source='mercado_pago' and e.provider_delivery_id=v_provider_delivery_id;
    if found then
      if v_delivery.pedido_id <> p_pedido_id or v_delivery.external_reference <> v_external_reference or v_delivery.target_status <> p_novo_status then raise exception using errcode='23505', message='MERCADO_PAGO_DELIVERY_CONFLICT'; end if;
      return query select v_order.id, v_delivery.result_status, true, v_order.google_event_id::text; return;
    end if;

    select e.* into v_approval from public.pedido_payment_events e
      where e.source='mercado_pago' and e.pedido_id=p_pedido_id and e.external_reference=v_external_reference and e.target_status='aprovado'::public.status_pagamento
      order by e.created_at, e.id limit 1;
    select e.* into v_reversal from public.pedido_payment_events e
      where e.source='mercado_pago' and e.pedido_id=p_pedido_id and e.external_reference=v_external_reference and e.target_status='reembolsado'::public.status_pagamento
      order by e.created_at, e.id limit 1;

    if p_novo_status='reembolsado'::public.status_pagamento then
      if v_approval.id is null then raise exception using errcode='23505', message='MERCADO_PAGO_REFUND_BEFORE_APPROVAL'; end if;
      if v_reversal.id is not null then return query select v_order.id, 'reembolsado'::public.status_pagamento, true, v_order.google_event_id::text; return; end if;
      update public.pedidos set status_pagamento='reembolsado', data_atualizacao=now() where id=p_pedido_id;
      insert into public.pedido_payment_events(pedido_id,source,actor_id,external_reference,provider_delivery_id,idempotency_key,reason,previous_status,target_status,result_status)
      values(p_pedido_id,'mercado_pago',null,v_external_reference,v_provider_delivery_id,null,null,'aprovado'::public.status_pagamento,'reembolsado'::public.status_pagamento,'reembolsado'::public.status_pagamento);
      return query select v_order.id, 'reembolsado'::public.status_pagamento, false, v_order.google_event_id::text; return;
    end if;
    if p_novo_status='aprovado'::public.status_pagamento and v_reversal.id is not null then
      -- MERCADO_PAGO_LATE_APPROVAL_IGNORED: retain neither a new event nor state resurrection.
      return query select v_order.id, 'reembolsado'::public.status_pagamento, true, v_order.google_event_id::text; return;
    end if;
    if v_approval.id is not null then
      return query select v_order.id, v_approval.result_status, true, v_order.google_event_id::text; return;
    end if;
  end if;

  update public.pedidos set status_pagamento=p_novo_status, mercado_pago_pagamento_id=case when p_source='mercado_pago' then v_external_reference else mercado_pago_pagamento_id end, data_atualizacao=now() where id=p_pedido_id;
  insert into public.pedido_payment_events(pedido_id,source,actor_id,external_reference,provider_delivery_id,idempotency_key,reason,previous_status,target_status,result_status)
  values(p_pedido_id,p_source,v_actor,v_external_reference,v_provider_delivery_id,p_idempotency_key,v_reason,v_order.status_pagamento,p_novo_status,p_novo_status);
  return query select v_order.id,p_novo_status,false,v_order.google_event_id::text;
end $$;
revoke all on function public.registrar_status_pagamento(uuid,public.status_pagamento,text,text,text,uuid,text) from public, anon;
grant execute on function public.registrar_status_pagamento(uuid,public.status_pagamento,text,text,text,uuid,text) to authenticated, service_role;

create or replace function public.anonymizar_usuario_admin(p_usuario_alvo_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_target public.perfis%rowtype; v_remaining_admins integer; v_anonymized_phone varchar(20); v_attempt integer:=0;
begin
  if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
  if v_actor=p_usuario_alvo_id then raise exception using errcode='42501',message='ANTI_LOCKOUT_AUTO_EXCLUSAO'; end if;
  select * into v_target from public.perfis where id=p_usuario_alvo_id for update;
  if not found then raise exception using errcode='P0002',message='PERFIL_ALVO_NAO_ENCONTRADO'; end if;
  if v_target.deletion_requested_at is not null then return; end if;
  if v_target.funcao='admin' and v_target.ativo then select count(*) into v_remaining_admins from public.perfis where funcao='admin' and ativo and id<>p_usuario_alvo_id for update; if v_remaining_admins<1 then raise exception using errcode='42501',message='MINIMO_UM_ADMIN_ATIVO'; end if; end if;
  loop
    v_attempt:=v_attempt+1; if v_attempt>100 then raise exception using errcode='54000',message='ANONYMIZED_PHONE_NAMESPACE_EXHAUSTED'; end if;
    v_anonymized_phone:='55419'||lpad(nextval('public.deleted_customer_phone_sequence')::text,8,'0');
    exit when not exists(select 1 from public.clientes where telefone=v_anonymized_phone);
  end loop;
  update public.clientes set usuario_id=null,nome='Deleted customer',telefone=v_anonymized_phone,email=null,telegram_chat_id=null where usuario_id=p_usuario_alvo_id;
  update public.perfis set ativo=false,deletion_requested_at=now(),auth_delete_completed_at=null where id=p_usuario_alvo_id;
  insert into public.logs_auditoria(usuario_id,acao,detalhes) values(v_actor,'anonymizar_usuario',jsonb_build_object('usuario_alvo_id',p_usuario_alvo_id,'auth_delete_pending',true));
end $$;

create or replace function public.concluir_anonymizacao_usuario_admin(p_usuario_alvo_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_target public.perfis%rowtype;
begin
  if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
  select * into v_target from public.perfis where id=p_usuario_alvo_id for update;
  if not found or v_target.deletion_requested_at is null then raise exception using errcode='P0002',message='ANONIMIZACAO_PENDENTE_NAO_ENCONTRADA'; end if;
  if v_target.auth_delete_completed_at is not null then return; end if;
  update public.perfis set auth_delete_completed_at=now() where id=p_usuario_alvo_id;
  insert into public.logs_auditoria(usuario_id,acao,detalhes) values(v_actor,'anonymizar_usuario_auth_concluido',jsonb_build_object('usuario_alvo_id',p_usuario_alvo_id,'auth_delete_pending',false));
end $$;
revoke all on function public.anonymizar_usuario_admin(uuid), public.concluir_anonymizacao_usuario_admin(uuid) from public, anon;
grant execute on function public.anonymizar_usuario_admin(uuid), public.concluir_anonymizacao_usuario_admin(uuid) to authenticated;

-- Compatibility signature for existing approved-payment callers. New provider
-- deliveries must use the seven-argument authority above.
create or replace function public.registrar_status_pagamento(
  p_pedido_id uuid, p_novo_status public.status_pagamento, p_source text,
  p_external_reference text default null, p_reason text default null, p_idempotency_key uuid default null
) returns table(pedido_id uuid,status_pagamento public.status_pagamento,idempotent boolean,google_event_id text)
language sql security definer set search_path = '' as $$
  select * from public.registrar_status_pagamento(
    p_pedido_id, p_novo_status, p_source, p_external_reference, p_reason,
    p_idempotency_key, case when p_source='mercado_pago' then p_external_reference else null end
  );
$$;
revoke all on function public.registrar_status_pagamento(uuid,public.status_pagamento,text,text,text,uuid) from public, anon;
grant execute on function public.registrar_status_pagamento(uuid,public.status_pagamento,text,text,text,uuid) to authenticated, service_role;
