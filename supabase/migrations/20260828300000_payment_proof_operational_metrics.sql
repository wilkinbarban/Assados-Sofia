-- Fixed, aggregate-only operational telemetry for the private payment-proof pipeline.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.payment_proof_outbox
  add column if not exists dead_lettered_at timestamptz;

create table private.payment_proof_maintenance_health (
  singleton boolean primary key default true check (singleton),
  running boolean not null default false,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0)
);
revoke all on private.payment_proof_maintenance_health from public, anon, authenticated;
insert into private.payment_proof_maintenance_health(singleton) values(true) on conflict do nothing;

create table private.payment_proof_operational_failures (
  id bigint generated always as identity primary key,
  proof_id uuid not null references public.payment_proofs(id) on delete restrict,
  stage text not null check(stage in ('render','classifier')),
  created_at timestamptz not null default now()
);
create index payment_proof_operational_failures_stage_created_idx
  on private.payment_proof_operational_failures(stage,created_at);
revoke all on private.payment_proof_operational_failures from public, anon, authenticated;

create or replace function public.record_payment_proof_operational_failure(p_proof_id uuid,p_stage text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';
 end if;
 if p_stage not in ('render','classifier') then
  raise exception using errcode='22023',message='PAYMENT_PROOF_OPERATIONAL_STAGE_INVALID';
 end if;
 insert into private.payment_proof_operational_failures(proof_id,stage) values(p_proof_id,p_stage);
 return true;
end$$;

create or replace function public.begin_payment_proof_maintenance()
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';
 end if;
 update private.payment_proof_maintenance_health set running=true,last_started_at=now() where singleton;
 return true;
end$$;

create or replace function public.finish_payment_proof_maintenance(p_success boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';
 end if;
 update private.payment_proof_maintenance_health set
  running=false,last_finished_at=now(),
  last_success_at=case when p_success then now() else last_success_at end,
  consecutive_failures=case when p_success then 0 else consecutive_failures+1 end
 where singleton;
 return true;
end$$;

create or replace function public.complete_payment_proof_maintenance(p_kind text,p_id text,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;v_proof public.payment_proofs%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_kind='outbox' then
  update public.payment_proof_outbox set
   status=case when p_success then 'completed' when attempts>=5 then 'dead_letter' else 'pending' end,
   completed_at=case when p_success then now() else null end,
   dead_lettered_at=case when not p_success and attempts>=5 then now() else dead_lettered_at end,
   claimed_until=null,last_error=case when p_success then null else 'operation_failed' end,
   next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^greatest(attempts-1,0))))
  where id=p_id::bigint and status='claimed';
  get diagnostics n=row_count;return n=1;
 end if;
 if p_kind='purge' then
  select * into v_proof from public.payment_proofs where id=p_id::uuid and status='purging' for update;
  if not found then return false;end if;
  update public.payment_proofs set status=case when p_success then 'purged' else 'quarantined' end,
   preview_storage_key=case when p_success then null else preview_storage_key end,updated_at=now(),
   purge_after=case when p_success then purge_after else now()+interval '1 hour' end where id=p_id::uuid;
  insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason)
   values(p_id::uuid,case when p_success then 'purged' else 'purge_failed' end,'worker','quarantined',case when p_success then 'purged' else 'quarantined' end,
    case when p_success then null else 'storage_delete_failed' end);
  return true;
 end if;
 return false;
end$$;

create or replace function public.dead_letter_payment_proof_outbox(p_id bigint,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 update public.payment_proof_outbox set status='dead_letter',claimed_until=null,last_error='operation_failed',dead_lettered_at=now()
 where id=p_id and status='claimed';get diagnostics n=row_count;return n=1;
end$$;

create or replace function public.get_payment_proof_operational_metrics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select jsonb_build_object(
  'lifecycle',jsonb_build_object(
   'received',count(*)filter(where p.status='received'),'identity_pending',count(*)filter(where p.status='identity_pending'),
   'processing',count(*)filter(where p.status='processing'),'review',count(*)filter(where p.status='review'),
   'admitted',count(*)filter(where p.status='admitted'),'quarantined',count(*)filter(where p.status='quarantined'),
   'purging',count(*)filter(where p.status='purging'),'duplicate',count(*)filter(where p.status='duplicate'),'purged',count(*)filter(where p.status='purged')),
  'quarantine',jsonb_build_object('total',count(*)filter(where p.status='quarantined'),'expired',count(*)filter(where p.status='quarantined' and p.purge_after<=now()))
 ) into result from public.payment_proofs p;
 result:=result||(
  select jsonb_build_object('outbox',jsonb_build_object(
   'pending',count(*)filter(where o.status='pending'),'claimed',count(*)filter(where o.status='claimed'),
   'completed',count(*)filter(where o.status='completed'),'dead_letter',count(*)filter(where o.status='dead_letter'),
   'attempts',jsonb_build_object('zero',count(*)filter(where o.attempts=0),'one',count(*)filter(where o.attempts=1),
    'two',count(*)filter(where o.attempts=2),'three_to_four',count(*)filter(where o.attempts between 3 and 4),'five_plus',count(*)filter(where o.attempts>=5)),
   'dead_letter_last_60m',count(*)filter(where o.dead_lettered_at>=now()-interval '60 minutes'))) from public.payment_proof_outbox o);
 result:=result||(
  select jsonb_build_object('purge',jsonb_build_object('failures_last_60m',count(*)filter(where e.event_type='purge_failed' and e.created_at>=now()-interval '60 minutes')))
  from public.payment_proof_events e);
 result:=result||(
  select jsonb_build_object('failures',jsonb_build_object(
   'render_last_60m',count(*)filter(where f.stage='render' and f.created_at>=now()-interval '60 minutes'),
   'classifier_last_60m',count(*)filter(where f.stage='classifier' and f.created_at>=now()-interval '60 minutes')))
  from private.payment_proof_operational_failures f);
 result:=result||(
  select jsonb_build_object('maintenance',jsonb_build_object('running',h.running,'last_started_at',h.last_started_at,
   'last_finished_at',h.last_finished_at,'last_success_at',h.last_success_at,
   'age_seconds',case when h.last_success_at is null then null else greatest(0,floor(extract(epoch from(now()-h.last_success_at)))::bigint) end,
   'consecutive_failures',h.consecutive_failures)) from private.payment_proof_maintenance_health h where h.singleton);
 return result;
end$$;

revoke all on function public.record_payment_proof_operational_failure(uuid,text),public.begin_payment_proof_maintenance(),
 public.finish_payment_proof_maintenance(boolean),public.complete_payment_proof_maintenance(text,text,boolean,text),
 public.dead_letter_payment_proof_outbox(bigint,text),public.get_payment_proof_operational_metrics() from public,anon,authenticated;
grant execute on function public.record_payment_proof_operational_failure(uuid,text),public.begin_payment_proof_maintenance(),
 public.finish_payment_proof_maintenance(boolean),public.complete_payment_proof_maintenance(text,text,boolean,text),
 public.dead_letter_payment_proof_outbox(bigint,text),public.get_payment_proof_operational_metrics() to service_role;
