-- Forward-only timing and pacing correction. No gate, scheduler, or provider effect is enabled here.
--
-- Both inbound admission paths regain the sliding silence window after every admitted message
-- (25 seconds) under a hard starvation cap measured from the first message of the batch
-- (60 seconds). The visible delivery delay is derived only from the response text, so model
-- latency no longer shortens it, and a claimed paced delivery exposes its durable residual wait.
-- The exposed residual wait is always rounded up to the next millisecond: a worker that sleeps
-- exactly the reported remainder must arrive at the strict pace deadline, and a truncated
-- remainder would make the final delivery fence reject the attempt and leave the intent claimed
-- for the remainder of its 60 second lease.

-- 1. Widen the batch schedule bound so the 60 second starvation cap is representable.
do $$
declare
  v_constraint text;
  v_count integer;
begin
  select pg_catalog.count(*) into v_count
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.sofia_inbound_batches'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%scheduled_process_at <=%'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%first_message_at%';
  if v_count <> 1 then
    raise exception using errcode = '55000', message = 'SOFIA_BATCH_SCHEDULE_BOUND_MISMATCH';
  end if;
  select c.conname into v_constraint
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.sofia_inbound_batches'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%scheduled_process_at <=%'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%first_message_at%';
  execute pg_catalog.format('alter table public.sofia_inbound_batches drop constraint %I', v_constraint);
  execute pg_catalog.format(
    'alter table public.sofia_inbound_batches add constraint %I check (scheduled_process_at <= first_message_at + interval ''60 seconds'')',
    v_constraint
  );
end
$$;

-- 2. Legacy enqueue path keeps its guards and grants, only the window and the cap change.
create or replace function public.enqueue_sofia_inbound_message(
  p_conversa_id uuid,
  p_cliente_id uuid,
  p_canal text,
  p_delivery_key text,
  p_conteudo text,
  p_url_anexo text,
  p_received_at timestamptz default now()
) returns table(message_id uuid, batch_id uuid, duplicate boolean, scheduled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_external_id text;
  v_message_id uuid;
  v_batch public.sofia_inbound_batches%rowtype;
  v_admitted_at timestamptz;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'SOFIA_BATCH_SERVICE_ROLE_REQUIRED';
  end if;
  if p_conversa_id is null or p_cliente_id is null
     or p_canal not in ('telegram', 'whatsapp')
     or nullif(btrim(p_delivery_key), '') is null or length(p_delivery_key) > 500
     or (nullif(p_conteudo, '') is null and nullif(p_url_anexo, '') is null)
     or p_received_at is null or not pg_catalog.isfinite(p_received_at) then
    raise exception using errcode = '22023', message = 'SOFIA_BATCH_ADMISSION_INVALID';
  end if;

  v_external_id := 'sofia-inbound:' || p_canal || ':' || btrim(p_delivery_key);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_external_id, 91021));
  perform 1 from public.conversas c
    where c.id = p_conversa_id and c.cliente_id = p_cliente_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'SOFIA_BATCH_BINDING_INVALID';
  end if;
  v_admitted_at := pg_catalog.clock_timestamp();

  select m.id into v_message_id from public.mensagens m where m.external_id = v_external_id;
  if found then
    select b.* into v_batch
      from public.sofia_inbound_batch_messages bm
      join public.sofia_inbound_batches b on b.id = bm.batch_id
      where bm.message_id = v_message_id;
    if not found or v_batch.conversa_id <> p_conversa_id or v_batch.cliente_id <> p_cliente_id or v_batch.canal <> p_canal then
      raise exception using errcode = '23505', message = 'SOFIA_BATCH_DELIVERY_CONFLICT';
    end if;
    return query select v_message_id, v_batch.id, true, v_batch.scheduled_process_at;
    return;
  end if;

  insert into public.mensagens(conversa_id, remetente, conteudo, url_anexo, data_criacao, external_id)
  values (p_conversa_id, 'cliente'::public.tipo_remetente, nullif(p_conteudo, ''),
          nullif(p_url_anexo, ''), p_received_at, v_external_id)
  returning id into v_message_id;

  select b.* into v_batch from public.sofia_inbound_batches b
    where b.conversa_id = p_conversa_id and b.status = 'pending' for update;
  if not found then
    insert into public.sofia_inbound_batches(
      conversa_id, cliente_id, canal, first_message_at, latest_message_at, scheduled_process_at
    ) values (
      p_conversa_id, p_cliente_id, p_canal, v_admitted_at, v_admitted_at,
      v_admitted_at + interval '25 seconds'
    ) returning * into v_batch;
  elsif v_batch.cliente_id <> p_cliente_id or v_batch.canal <> p_canal then
    raise exception using errcode = '23505', message = 'SOFIA_BATCH_BINDING_CONFLICT';
  else
    update public.sofia_inbound_batches b set
      latest_message_at = v_admitted_at,
      scheduled_process_at = least(v_admitted_at + interval '25 seconds', b.first_message_at + interval '60 seconds'),
      updated_at = v_admitted_at
    where b.id = v_batch.id returning * into v_batch;
  end if;

  insert into public.sofia_inbound_batch_messages(batch_id, message_id, message_created_at)
    values (v_batch.id, v_message_id, p_received_at);
  return query select v_message_id, v_batch.id, false, v_batch.scheduled_process_at;
end
$$;

revoke all on function public.enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz) to service_role;

-- 3. Web-capable attach path keeps the Web channel guard, only the window and the cap change.
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
    values(p_conversa_id,p_cliente_id,p_canal,v_admitted_at,v_admitted_at,v_admitted_at+interval '25 seconds') returning * into v_batch;
  elsif v_batch.cliente_id<>p_cliente_id or v_batch.canal<>p_canal then
    raise exception using errcode='23505',message='SOFIA_BATCH_ATTACH_CONFLICT';
  else
    update public.sofia_inbound_batches b set latest_message_at=v_admitted_at,
      scheduled_process_at=least(v_admitted_at+interval '25 seconds',b.first_message_at+interval '60 seconds'),updated_at=v_admitted_at
    where b.id=v_batch.id returning * into v_batch;
  end if;
  insert into public.sofia_inbound_batch_messages(batch_id,message_id,message_created_at)
  values(v_batch.id,p_message_id,v_message.data_criacao);
  return query select v_batch.id,false,v_batch.scheduled_process_at;
end
$$;

revoke all on function public.attach_sofia_inbound_message(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.attach_sofia_inbound_message(uuid,uuid,uuid,text) to service_role;

-- 4. Paced completion keeps its signature and argument validation, and derives the visible delay
--    only from the response text so model latency never shortens the paused delivery.
create or replace function public.complete_sofia_inbound_batch_paced(
  p_batch_id uuid, p_lease_token uuid, p_response_text text, p_generation_elapsed_ms integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_existing boolean;
  v_result jsonb;
  v_outbox public.sofia_response_outbox%rowtype;
  v_remaining_ms integer;
  v_now timestamptz;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'SOFIA_BATCH_SERVICE_ROLE_REQUIRED';
  end if;
  if p_generation_elapsed_ms is null or p_generation_elapsed_ms < 0 or p_generation_elapsed_ms > 2147483647 then
    raise exception using errcode = '22023', message = 'SOFIA_BATCH_ELAPSED_INVALID';
  end if;
  perform 1 from public.sofia_inbound_batches where id = p_batch_id for update;
  if not found then return null; end if;
  select exists(select 1 from public.sofia_response_outbox where batch_id = p_batch_id) into v_existing;
  v_result := public.complete_sofia_inbound_batch(p_batch_id, p_lease_token, p_response_text);
  if v_result is null then return null; end if;
  select * into v_outbox from public.sofia_response_outbox where batch_id = p_batch_id for update;
  if v_existing then
    return pg_catalog.to_jsonb(v_outbox) || pg_catalog.jsonb_build_object(
      'remaining_ms', greatest(0, ceil(extract(epoch from (v_outbox.pace_not_before - clock_timestamp())) * 1000))::integer
    );
  end if;
  v_remaining_ms := greatest(0, public.sofia_response_pace_minimum_ms(p_response_text));
  v_now := clock_timestamp();
  update public.sofia_response_outbox set pace_not_before = v_now + v_remaining_ms * interval '1 millisecond', updated_at = v_now
    where batch_id = p_batch_id and pace_not_before is null returning * into v_outbox;
  if not found then raise exception using errcode = '55000', message = 'SOFIA_BATCH_PACE_ANNOTATION_BREACH'; end if;
  return pg_catalog.to_jsonb(v_outbox) || pg_catalog.jsonb_build_object('remaining_ms', v_remaining_ms);
end
$$;

revoke all on function public.complete_sofia_inbound_batch_paced(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.complete_sofia_inbound_batch_paced(uuid,uuid,text,integer) to service_role;

-- 5. A claim now carries the durable residual wait so pacing survives worker invocations.
create or replace function public.claim_sofia_response_delivery(p_lease_seconds integer default 60)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.sofia_response_outbox%rowtype;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';end if;
  if p_lease_seconds not between 10 and 300 then raise exception using errcode='22023',message='SOFIA_BATCH_LEASE_INVALID';end if;
  select * into o from public.sofia_response_outbox where status='pending' or(status='claimed' and claimed_until<=now()) order by created_at,batch_id for update skip locked limit 1;
  if not found then return null;end if;
  update public.sofia_response_outbox set status='claimed',lease_token=gen_random_uuid(),claimed_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now() where batch_id=o.batch_id returning * into o;
  return pg_catalog.to_jsonb(o) || pg_catalog.jsonb_build_object(
    'remaining_ms', case when o.pace_not_before is null then null
      else greatest(0, ceil(extract(epoch from (o.pace_not_before - clock_timestamp())) * 1000))::integer end
  );
end
$$;

revoke all on function public.claim_sofia_response_delivery(integer) from public, anon, authenticated;
grant execute on function public.claim_sofia_response_delivery(integer) to service_role;
