-- Standalone Core A private activity authority. No worker, producer, delivery attempt, or pacing behavior is enabled here.
create table public.sofia_conversation_presence (
  conversa_id uuid primary key references public.conversas(id) on delete cascade,
  status text not null check (status in ('idle','composing')),
  owner_kind text check (owner_kind in ('generation','delivery')),
  owner_token uuid,
  attempt_id uuid,
  source_batch_id uuid references public.sofia_inbound_batches(id) on delete set null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status = 'idle' and owner_kind is null and owner_token is null
     and attempt_id is null and source_batch_id is null and expires_at is null)
    or
    (status = 'composing' and owner_kind is not null and owner_token is not null
     and attempt_id is not null and source_batch_id is not null and expires_at is not null)
  )
);
alter table public.sofia_conversation_presence enable row level security;
revoke all on table public.sofia_conversation_presence from public, anon, authenticated, service_role;
comment on table public.sofia_conversation_presence is 'Private Sofia activity projection; mutated only by fenced service RPCs.';

create function public.sofia_activity_service_only()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'SOFIA_ACTIVITY_SERVICE_ROLE_REQUIRED';
  end if;
  return true;
end
$$;

create function public.begin_sofia_batch_activity(
  p_batch_id uuid, p_batch_lease_token uuid, p_ttl_seconds integer default 30
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.sofia_inbound_batches%rowtype;
  p public.sofia_conversation_presence%rowtype;
  v_conversa_id uuid;
  v_now timestamptz;
  v_attempt uuid;
  v_expires_at timestamptz;
begin
  perform public.sofia_activity_service_only();
  if p_ttl_seconds is null or p_ttl_seconds not between 10 and 300 then
    raise exception using errcode = '22023', message = 'SOFIA_ACTIVITY_TTL_INVALID';
  end if;
  select conversa_id into v_conversa_id from public.sofia_inbound_batches where id = p_batch_id;
  if not found then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sofia-activity:' || v_conversa_id::text, 91022));
  v_now := pg_catalog.clock_timestamp();
  select * into b from public.sofia_inbound_batches where id = p_batch_id for update;
  if b.status <> 'processing' or b.lease_token is distinct from p_batch_lease_token or b.claimed_until <= v_now then return null; end if;
  select * into p from public.sofia_conversation_presence where conversa_id = b.conversa_id for update;
  if found and p.status = 'composing' and p.expires_at > v_now then
    if p.source_batch_id = b.id and p.owner_kind = 'generation' and p.owner_token = p_batch_lease_token then
      return pg_catalog.jsonb_build_object('attempt_id', p.attempt_id, 'expires_at', p.expires_at);
    end if;
    return null;
  end if;
  v_attempt := gen_random_uuid();
  v_expires_at := v_now + p_ttl_seconds * interval '1 second';
  insert into public.sofia_conversation_presence(conversa_id,status,owner_kind,owner_token,attempt_id,source_batch_id,expires_at,updated_at)
  values (b.conversa_id,'composing','generation',p_batch_lease_token,v_attempt,b.id,v_expires_at,v_now)
  on conflict (conversa_id) do update set
    status = excluded.status, owner_kind = excluded.owner_kind, owner_token = excluded.owner_token,
    attempt_id = excluded.attempt_id, source_batch_id = excluded.source_batch_id,
    expires_at = excluded.expires_at, updated_at = excluded.updated_at;
  return pg_catalog.jsonb_build_object('attempt_id', v_attempt, 'expires_at', v_expires_at);
end
$$;

create function public.renew_sofia_owner_activity(
  p_batch_id uuid, p_owner_kind text, p_owner_token uuid, p_attempt_id uuid,
  p_owner_ttl_seconds integer default 60, p_activity_ttl_seconds integer default 30
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.sofia_inbound_batches%rowtype;
  o public.sofia_response_outbox%rowtype;
  p public.sofia_conversation_presence%rowtype;
  v_conversa_id uuid;
  v_now timestamptz;
  v_owner_expires_at timestamptz;
  v_activity_expires_at timestamptz;
begin
  perform public.sofia_activity_service_only();
  if p_owner_kind not in ('generation','delivery') or p_owner_token is null or p_attempt_id is null
     or p_owner_ttl_seconds is null or p_activity_ttl_seconds is null
     or p_owner_ttl_seconds not between 10 and 300 or p_activity_ttl_seconds not between 10 and 300 then
    raise exception using errcode = '22023', message = 'SOFIA_ACTIVITY_RENEWAL_INVALID';
  end if;
  select conversa_id into v_conversa_id from public.sofia_inbound_batches where id = p_batch_id;
  if not found then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sofia-activity:' || v_conversa_id::text, 91022));
  v_now := pg_catalog.clock_timestamp();
  select * into b from public.sofia_inbound_batches where id = p_batch_id for update;
  select * into p from public.sofia_conversation_presence where conversa_id = b.conversa_id for update;
  if not found or p.status <> 'composing' or p.source_batch_id <> b.id or p.owner_kind <> p_owner_kind
     or p.owner_token <> p_owner_token or p.attempt_id <> p_attempt_id or p.expires_at <= v_now then return null; end if;
  v_owner_expires_at := v_now + p_owner_ttl_seconds * interval '1 second';
  v_activity_expires_at := v_now + p_activity_ttl_seconds * interval '1 second';
  if p_owner_kind = 'generation' then
    if b.status <> 'processing' or b.lease_token is distinct from p_owner_token or b.claimed_until <= v_now then return null; end if;
    update public.sofia_inbound_batches set claimed_until = v_owner_expires_at, updated_at = v_now
      where id = b.id and status = 'processing' and lease_token = p_owner_token and claimed_until > v_now;
  else
    select * into o from public.sofia_response_outbox where batch_id = b.id for update;
    if not found or o.status <> 'claimed' or o.lease_token is distinct from p_owner_token or o.claimed_until <= v_now then return null; end if;
    update public.sofia_response_outbox set claimed_until = v_owner_expires_at, updated_at = v_now
      where batch_id = b.id and status = 'claimed' and lease_token = p_owner_token and claimed_until > v_now;
  end if;
  if not found then return null; end if;
  update public.sofia_conversation_presence set expires_at = v_activity_expires_at, updated_at = v_now
    where conversa_id = b.conversa_id and status = 'composing' and source_batch_id = b.id
      and owner_kind = p_owner_kind and owner_token = p_owner_token and attempt_id = p_attempt_id and expires_at > v_now;
  if not found then raise exception using errcode = '55000', message = 'SOFIA_ACTIVITY_RENEWAL_ATOMICITY_BREACH'; end if;
  return pg_catalog.jsonb_build_object('attempt_id', p_attempt_id, 'owner_expires_at', v_owner_expires_at, 'activity_expires_at', v_activity_expires_at);
end
$$;

create function public.adopt_sofia_response_activity(
  p_batch_id uuid, p_delivery_lease_token uuid, p_ttl_seconds integer default 30
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.sofia_inbound_batches%rowtype;
  o public.sofia_response_outbox%rowtype;
  p public.sofia_conversation_presence%rowtype;
  v_conversa_id uuid;
  v_now timestamptz;
  v_attempt uuid;
  v_expires_at timestamptz;
begin
  perform public.sofia_activity_service_only();
  if p_ttl_seconds is null or p_ttl_seconds not between 10 and 300 then
    raise exception using errcode = '22023', message = 'SOFIA_ACTIVITY_TTL_INVALID';
  end if;
  select conversa_id into v_conversa_id from public.sofia_inbound_batches where id = p_batch_id;
  if not found then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sofia-activity:' || v_conversa_id::text, 91022));
  v_now := pg_catalog.clock_timestamp();
  select * into b from public.sofia_inbound_batches where id = p_batch_id for update;
  select * into o from public.sofia_response_outbox where batch_id = b.id for update;
  if not found or b.status <> 'completed' or o.conversa_id <> b.conversa_id or o.canal <> b.canal
     or o.status <> 'claimed' or o.lease_token is distinct from p_delivery_lease_token or o.claimed_until <= v_now then return null; end if;
  select * into p from public.sofia_conversation_presence where conversa_id = b.conversa_id for update;
  if not found or p.source_batch_id <> b.id then return null; end if;
  if p.status = 'composing' and p.expires_at > v_now and p.owner_kind = 'delivery' and p.owner_token = p_delivery_lease_token then
    return pg_catalog.jsonb_build_object('attempt_id', p.attempt_id, 'expires_at', p.expires_at);
  end if;
  v_attempt := gen_random_uuid();
  v_expires_at := v_now + p_ttl_seconds * interval '1 second';
  update public.sofia_conversation_presence set status = 'composing', owner_kind = 'delivery', owner_token = p_delivery_lease_token,
    attempt_id = v_attempt, source_batch_id = b.id, expires_at = v_expires_at, updated_at = v_now where conversa_id = b.conversa_id;
  return pg_catalog.jsonb_build_object('attempt_id', v_attempt, 'expires_at', v_expires_at);
end
$$;

create function public.clear_sofia_batch_activity(p_batch_id uuid, p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare b public.sofia_inbound_batches%rowtype; v_conversa_id uuid; v_now timestamptz;
begin
  perform public.sofia_activity_service_only();
  if p_attempt_id is null then return false; end if;
  select conversa_id into v_conversa_id from public.sofia_inbound_batches where id = p_batch_id;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sofia-activity:' || v_conversa_id::text, 91022));
  v_now := pg_catalog.clock_timestamp();
  select * into b from public.sofia_inbound_batches where id = p_batch_id for update;
  update public.sofia_conversation_presence set status = 'idle', owner_kind = null, owner_token = null, attempt_id = null,
    source_batch_id = null, expires_at = null, updated_at = v_now
    where conversa_id = b.conversa_id and status = 'composing' and source_batch_id = b.id and attempt_id = p_attempt_id;
  return found;
end
$$;

revoke all on function public.sofia_activity_service_only() from public, anon, authenticated, service_role;
revoke all on function public.begin_sofia_batch_activity(uuid,uuid,integer),
  public.renew_sofia_owner_activity(uuid,text,uuid,uuid,integer,integer),
  public.adopt_sofia_response_activity(uuid,uuid,integer), public.clear_sofia_batch_activity(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.begin_sofia_batch_activity(uuid,uuid,integer),
  public.renew_sofia_owner_activity(uuid,text,uuid,uuid,integer,integer),
  public.adopt_sofia_response_activity(uuid,uuid,integer), public.clear_sofia_batch_activity(uuid,uuid)
  to service_role;
