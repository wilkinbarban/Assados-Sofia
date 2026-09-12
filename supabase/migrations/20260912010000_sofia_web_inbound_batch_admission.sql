-- Forward-only Web admission. This remains inert until the explicit Web producer gate is enabled.
alter table public.sofia_inbound_batches
  drop constraint sofia_inbound_batches_canal_check,
  add constraint sofia_inbound_batches_canal_check check (canal in ('telegram', 'whatsapp', 'web'));

alter table public.sofia_response_outbox
  drop constraint sofia_response_outbox_canal_check,
  add constraint sofia_response_outbox_canal_check check (canal in ('telegram', 'whatsapp', 'web'));

create or replace function public.attach_sofia_inbound_message(
  p_message_id uuid,
  p_conversa_id uuid,
  p_cliente_id uuid,
  p_canal text
) returns table(batch_id uuid, duplicate boolean, scheduled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_message public.mensagens%rowtype;
  v_batch public.sofia_inbound_batches%rowtype;
  v_existing_batch_id uuid;
  v_admitted_at timestamptz;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';
  end if;
  if p_message_id is null or p_conversa_id is null or p_cliente_id is null
     or p_canal not in ('telegram','whatsapp','web') then
    raise exception using errcode='22023',message='SOFIA_BATCH_ATTACH_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_message_id::text,91022));
  select m.* into v_message from public.mensagens m where m.id=p_message_id for share;
  if not found or v_message.conversa_id<>p_conversa_id or v_message.remetente<>'cliente'::public.tipo_remetente
     or not exists(select 1 from public.conversas c where c.id=p_conversa_id and c.cliente_id=p_cliente_id) then
    raise exception using errcode='22023',message='SOFIA_BATCH_ATTACH_BINDING_INVALID';
  end if;
  if (p_canal='telegram' and v_message.telegram_mensagem_id is null)
     or (p_canal='whatsapp' and v_message.whatsapp_mensagem_id is null)
     or (p_canal='web' and (v_message.telegram_mensagem_id is not null or v_message.whatsapp_mensagem_id is not null)) then
    raise exception using errcode='22023',message='SOFIA_BATCH_ATTACH_CHANNEL_INVALID';
  end if;

  select bm.batch_id into v_existing_batch_id from public.sofia_inbound_batch_messages bm where bm.message_id=p_message_id;
  if found then
    select b.* into v_batch from public.sofia_inbound_batches b where b.id=v_existing_batch_id;
    if v_batch.conversa_id<>p_conversa_id or v_batch.cliente_id<>p_cliente_id or v_batch.canal<>p_canal then
      raise exception using errcode='23505',message='SOFIA_BATCH_ATTACH_CONFLICT';
    end if;
    return query select v_batch.id,true,v_batch.scheduled_process_at;
    return;
  end if;

  perform 1 from public.conversas c where c.id=p_conversa_id and c.cliente_id=p_cliente_id for update;
  v_admitted_at:=pg_catalog.clock_timestamp();
  select b.* into v_batch from public.sofia_inbound_batches b where b.conversa_id=p_conversa_id and b.status='pending' for update;
  if not found then
    insert into public.sofia_inbound_batches(conversa_id,cliente_id,canal,first_message_at,latest_message_at,scheduled_process_at)
    values(p_conversa_id,p_cliente_id,p_canal,v_admitted_at,v_admitted_at,v_admitted_at+interval '5 seconds') returning * into v_batch;
  elsif v_batch.cliente_id<>p_cliente_id or v_batch.canal<>p_canal then
    raise exception using errcode='23505',message='SOFIA_BATCH_ATTACH_CONFLICT';
  else
    update public.sofia_inbound_batches b set latest_message_at=v_admitted_at,
      scheduled_process_at=least(v_admitted_at+interval '5 seconds',b.first_message_at+interval '20 seconds'),updated_at=v_admitted_at
    where b.id=v_batch.id returning * into v_batch;
  end if;
  insert into public.sofia_inbound_batch_messages(batch_id,message_id,message_created_at)
  values(v_batch.id,p_message_id,v_message.data_criacao);
  return query select v_batch.id,false,v_batch.scheduled_process_at;
end
$$;

revoke all on function public.attach_sofia_inbound_message(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.attach_sofia_inbound_message(uuid,uuid,uuid,text) to service_role;
