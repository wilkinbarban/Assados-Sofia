-- Standalone Core B durable pace deadline. No worker, runtime gate, or provider effect is enabled here.
alter table public.sofia_response_outbox add column pace_not_before timestamptz;
comment on column public.sofia_response_outbox.pace_not_before is
  'Nullable DB-time lower bound for final delivery; NULL preserves baseline behavior.';

create function public.sofia_response_pace_minimum_ms(p_response_text text)
returns integer language plpgsql immutable strict set search_path = '' as $$
declare
  v_trimmed text;
  v_units integer;
begin
  v_trimmed := pg_catalog.regexp_replace(
    p_response_text,
    U&'^[\0009\000A\000B\000C\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009\000A\000B\000C\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
    '', 'g'
  );
  select coalesce(sum(case when pg_catalog.octet_length(ch) = 4 then 2 else 1 end), 0)::integer
    into v_units
    from pg_catalog.regexp_split_to_table(v_trimmed, '') as ch;
  return least(6000, 2000 + least(v_units, 500) * 10);
end
$$;

create function public.complete_sofia_inbound_batch_paced(
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
      'remaining_ms', greatest(0, floor(extract(epoch from (v_outbox.pace_not_before - clock_timestamp())) * 1000))::integer
    );
  end if;
  v_remaining_ms := greatest(0, public.sofia_response_pace_minimum_ms(p_response_text) - p_generation_elapsed_ms);
  v_now := clock_timestamp();
  update public.sofia_response_outbox set pace_not_before = v_now + v_remaining_ms * interval '1 millisecond', updated_at = v_now
    where batch_id = p_batch_id and pace_not_before is null returning * into v_outbox;
  if not found then raise exception using errcode = '55000', message = 'SOFIA_BATCH_PACE_ANNOTATION_BREACH'; end if;
  return pg_catalog.to_jsonb(v_outbox) || pg_catalog.jsonb_build_object('remaining_ms', v_remaining_ms);
end
$$;

create or replace function public.begin_sofia_response_delivery(p_batch_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='SOFIA_BATCH_SERVICE_ROLE_REQUIRED';end if;
 update public.sofia_response_outbox set status='attempted',attempted_at=now(),lease_token=null,claimed_until=null,updated_at=now()
   where batch_id=p_batch_id and status='claimed' and lease_token=p_lease_token and claimed_until>now()
     and (pace_not_before is null or pace_not_before<=clock_timestamp());
 get diagnostics n=row_count;return n=1;
end$$;

revoke all on function public.sofia_response_pace_minimum_ms(text) from public, anon, authenticated, service_role;
revoke all on function public.complete_sofia_inbound_batch_paced(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.complete_sofia_inbound_batch_paced(uuid,uuid,text,integer) to service_role;
