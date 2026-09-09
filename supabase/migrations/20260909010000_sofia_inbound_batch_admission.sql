-- Inert storage contract: no producer invokes this admission RPC in this slice.
create table public.sofia_inbound_batches (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  canal text not null check (canal in ('telegram', 'whatsapp')),
  first_message_at timestamptz not null,
  latest_message_at timestamptz not null,
  scheduled_process_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  attempt integer not null default 0 check (attempt >= 0),
  lease_token uuid,
  claimed_until timestamptz,
  cancelled_reason text,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_message_at <= latest_message_at),
  check (scheduled_process_at <= first_message_at + interval '20 seconds'),
  check ((status = 'processing' and lease_token is not null and claimed_until is not null)
      or (status <> 'processing' and lease_token is null and claimed_until is null)),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'cancelled') = (cancelled_reason is not null)),
  check ((status = 'failed') = (failed_at is not null and last_error is not null)),
  check (status = 'completed' or completed_at is null),
  check (status = 'cancelled' or cancelled_reason is null),
  check (status = 'failed' or (failed_at is null and last_error is null))
);

create table public.sofia_inbound_batch_messages (
  batch_id uuid not null references public.sofia_inbound_batches(id) on delete cascade,
  message_id uuid not null references public.mensagens(id) on delete cascade,
  message_created_at timestamptz not null,
  primary key (batch_id, message_id),
  unique (message_id)
);

create unique index sofia_inbound_batches_one_pending
  on public.sofia_inbound_batches(conversa_id) where status = 'pending';
create index sofia_inbound_batches_due
  on public.sofia_inbound_batches(scheduled_process_at, id)
  where status in ('pending', 'processing');
create index sofia_inbound_batch_messages_chronology
  on public.sofia_inbound_batch_messages(batch_id, message_created_at, message_id);

alter table public.sofia_inbound_batches enable row level security;
alter table public.sofia_inbound_batch_messages enable row level security;
revoke all on table public.sofia_inbound_batches from public, anon, authenticated, service_role;
revoke all on table public.sofia_inbound_batch_messages from public, anon, authenticated, service_role;

comment on table public.sofia_inbound_batches is
  'Inaccessible durable Sofia inbound scheduling state; mutated only by narrow service-role RPCs.';
comment on table public.sofia_inbound_batch_messages is
  'Immutable membership ordered by the persisted message key (message_created_at, message_id).';

create function public.reject_sofia_batch_membership_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'SOFIA_BATCH_MEMBERSHIP_IMMUTABLE';
end
$$;

create trigger sofia_batch_membership_immutable
before update or delete on public.sofia_inbound_batch_messages
for each row when (pg_catalog.pg_trigger_depth() = 0)
execute function public.reject_sofia_batch_membership_mutation();

revoke all on function public.reject_sofia_batch_membership_mutation() from public, anon, authenticated, service_role;

create function public.enqueue_sofia_inbound_message(
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
      v_admitted_at + interval '5 seconds'
    ) returning * into v_batch;
  elsif v_batch.cliente_id <> p_cliente_id or v_batch.canal <> p_canal then
    raise exception using errcode = '23505', message = 'SOFIA_BATCH_BINDING_CONFLICT';
  else
    update public.sofia_inbound_batches b set
      latest_message_at = v_admitted_at,
      scheduled_process_at = least(v_admitted_at + interval '5 seconds', b.first_message_at + interval '20 seconds'),
      updated_at = v_admitted_at
    where b.id = v_batch.id returning * into v_batch;
  end if;

  insert into public.sofia_inbound_batch_messages(batch_id, message_id, message_created_at)
    values (v_batch.id, v_message_id, p_received_at);
  return query select v_message_id, v_batch.id, false, v_batch.scheduled_process_at;
end
$$;

revoke all on function public.enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz)
  to service_role;
