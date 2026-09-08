-- Canonical inserts enqueue symbolic, transaction-bound notification deliveries.
-- No historical rows are replayed: all triggers are AFTER INSERT only.
create or replace function public.enqueue_notification_outbox_internal(
  p_aggregate_type text,p_aggregate_id uuid,p_event_type text,p_event_id uuid,p_payload jsonb
) returns void
language plpgsql security definer set search_path='' as $$
declare v_customer_id uuid; v_conversation_id uuid; v_phone text; v_telegram text;
  v_channel text; v_id bigint; v_key text;
begin
  select p.cliente_id,p.conversa_id,c.telefone,c.telegram_chat_id
  into v_customer_id,v_conversation_id,v_phone,v_telegram
  from public.pedidos p join public.clientes c on c.id=p.cliente_id
  where p.id=p_aggregate_id;
  if not found then raise exception using errcode='P0002',message='NOTIFICATION_ORDER_NOT_FOUND'; end if;
  if v_conversation_id is null then return; end if;

  foreach v_channel in array array['web','whatsapp','telegram'] loop
    v_id:=null;
    if (v_channel='whatsapp' and nullif(btrim(v_phone),'') is null)
       or (v_channel='telegram' and nullif(btrim(v_telegram),'') is null) then continue; end if;
    v_key:=p_event_id::text||':'||v_channel;
    insert into public.notification_outbox(aggregate_type,aggregate_id,event_type,event_id,customer_id,conversation_id,channel,payload,delivery_key)
    values(p_aggregate_type,p_aggregate_id,p_event_type,p_event_id,v_customer_id,v_conversation_id,v_channel,p_payload,v_key)
    on conflict(delivery_key) do nothing returning id into v_id;
    if v_id is null and not exists(
      select 1 from public.notification_outbox where delivery_key=v_key
        and aggregate_type=p_aggregate_type and aggregate_id=p_aggregate_id
        and event_type=p_event_type and event_id=p_event_id
        and customer_id is not distinct from v_customer_id
        and conversation_id is not distinct from v_conversation_id and payload=p_payload
    ) then raise exception using errcode='23505',message='NOTIFICATION_OUTBOX_DELIVERY_CONFLICT'; end if;
  end loop;
end $$;
revoke all on function public.enqueue_notification_outbox_internal(text,uuid,text,uuid,jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.notification_outbox_pedido_created()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.enqueue_notification_outbox_internal('order',new.id,'order_created',new.id,jsonb_build_object('message_key','order_created')); return new; end $$;

create or replace function public.notification_outbox_lifecycle_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.enqueue_notification_outbox_internal('order',new.pedido_id,'order_status_changed',new.id,jsonb_build_object('message_key','order_status_changed','status',new.result_status::text)); return new; end $$;

create or replace function public.notification_outbox_payment_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_refund_event_id uuid; v_hex text;
begin
  -- Observation-only provider events can preserve the current status; notify
  -- only a canonical state transition, never a duplicate observation.
  if new.previous_status is not distinct from new.result_status then return new; end if;
  perform public.enqueue_notification_outbox_internal('payment',new.pedido_id,'payment_status_changed',new.id,jsonb_build_object('message_key','payment_status_changed','status',new.result_status::text));
  if new.result_status='reembolsado'::public.status_pagamento then
    -- SHA-256 input is domain-separated; the formatted first 128 bits are a
    -- deterministic RFC 4122 v4-shaped UUID, distinct from payment event id.
    v_hex:=encode(extensions.digest('notification_outbox:refund_completed:'||new.id::text,'sha256'),'hex');
    v_refund_event_id:=(substr(v_hex,1,8)||'-'||substr(v_hex,9,4)||'-4'||substr(v_hex,14,3)||'-8'||substr(v_hex,18,3)||'-'||substr(v_hex,21,12))::uuid;
    perform public.enqueue_notification_outbox_internal('refund',new.pedido_id,'refund_completed',v_refund_event_id,jsonb_build_object('message_key','refund_completed','status','concluido'));
  end if;
  return new;
end $$;

create or replace function public.notification_outbox_receipt_issued()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.enqueue_notification_outbox_internal('receipt',new.pedido_id,'receipt_issued',new.id,jsonb_build_object('message_key','receipt_issued')); return new; end $$;

revoke all on function public.notification_outbox_pedido_created(),public.notification_outbox_lifecycle_event(),public.notification_outbox_payment_event(),public.notification_outbox_receipt_issued() from public,anon,authenticated,service_role;
drop trigger if exists notification_outbox_pedido_created on public.pedidos;
create trigger notification_outbox_pedido_created after insert on public.pedidos for each row execute function public.notification_outbox_pedido_created();
drop trigger if exists notification_outbox_lifecycle_event on public.pedido_lifecycle_events;
create trigger notification_outbox_lifecycle_event after insert on public.pedido_lifecycle_events for each row execute function public.notification_outbox_lifecycle_event();
drop trigger if exists notification_outbox_payment_event on public.pedido_payment_events;
create trigger notification_outbox_payment_event after insert on public.pedido_payment_events for each row execute function public.notification_outbox_payment_event();
drop trigger if exists notification_outbox_receipt_issued on public.comprovantes_venda;
create trigger notification_outbox_receipt_issued after insert on public.comprovantes_venda for each row execute function public.notification_outbox_receipt_issued();
