-- Forward-only Web atomic admission. This remains inert until the explicit Web producer
-- gate (`SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED`) is enabled; no gate, scheduler, or
-- provider effect is turned on here.
--
-- The canonical admission RPC now accepts the `web` channel, so a Web customer message is
-- inserted into `mensagens` and attached to the pending `web` batch inside the same
-- database transaction. The direct browser insert followed by a separate attach RPC
-- crossed transactions and could leave an unattached message behind; the Web path no
-- longer needs that sequence.
--
-- The client-generated idempotency key is stored in the Web-specific namespace
-- `sofia-web:<chave>` on `mensagens.external_id` (unique index `mensagens_external_id_key`).
-- Telegram and WhatsApp/Evolution keep their existing `sofia-inbound:<canal>:<chave>`
-- namespace, so their behavior is unchanged. A retry with the same key returns the
-- original message id, the original batch id and the original `scheduled_process_at`
-- without touching `latest_message_at`, so the deadline is never extended.

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
     or p_canal not in ('telegram', 'whatsapp', 'web')
     or nullif(btrim(p_delivery_key), '') is null or length(p_delivery_key) > 500
     or (nullif(p_conteudo, '') is null and nullif(p_url_anexo, '') is null)
     or p_received_at is null or not pg_catalog.isfinite(p_received_at) then
    raise exception using errcode = '22023', message = 'SOFIA_BATCH_ADMISSION_INVALID';
  end if;

  v_external_id := case
    when p_canal = 'web' then 'sofia-web:' || btrim(p_delivery_key)
    else 'sofia-inbound:' || p_canal || ':' || btrim(p_delivery_key)
  end;
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

comment on function public.enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz) is
  'Admissão canônica e atômica de mensagem inbound: grava mensagens e o vínculo com o lote pendente na mesma transação. Aceita telegram, whatsapp e web; a chave de idempotência do canal Web usa o namespace sofia-web:<chave> em mensagens.external_id.';

revoke all on function public.enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz) to service_role;
