-- Restore unresolved dead-letter diagnostics while keeping JSON metrics JavaScript-number safe.
create or replace function public.get_payment_proof_operational_metrics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';
 end if;

 select jsonb_build_object(
  'lifecycle',jsonb_build_object(
   'received',(count(*) filter(where p.status='received'))::integer,
   'identity_pending',(count(*) filter(where p.status='identity_pending'))::integer,
   'processing',(count(*) filter(where p.status='processing'))::integer,
   'review',(count(*) filter(where p.status='review'))::integer,
   'admitted',(count(*) filter(where p.status='admitted'))::integer,
   'quarantined',(count(*) filter(where p.status='quarantined'))::integer,
   'purging',(count(*) filter(where p.status='purging'))::integer,
   'duplicate',(count(*) filter(where p.status='duplicate'))::integer,
   'purged',(count(*) filter(where p.status='purged'))::integer),
  'quarantine',jsonb_build_object(
   'total',(count(*) filter(where p.status='quarantined'))::integer,
   'expired',(count(*) filter(where p.status='quarantined' and p.purge_after<=now()))::integer)
 ) into result from public.payment_proofs p;

 result:=result||(with legacy_outbox as (
  select jsonb_build_object(
   'pending',(count(*) filter(where status='pending'))::integer,
   'claimed',(count(*) filter(where status='claimed'))::integer,
   'completed',(count(*) filter(where status='completed'))::integer,
   'dead_letter',(count(*) filter(where status='dead_letter'))::integer,
   'attempts',jsonb_build_object(
    'zero',(count(*) filter(where attempts=0))::integer,
    'one',(count(*) filter(where attempts=1))::integer,
    'two',(count(*) filter(where attempts=2))::integer,
    'three_to_four',(count(*) filter(where attempts between 3 and 4))::integer,
    'five_plus',(count(*) filter(where attempts>=5))::integer),
   'dead_letter_last_60m',(count(*) filter(where dead_lettered_at>=now()-interval '60 minutes'))::integer
  ) as metrics from public.payment_proof_outbox
 ), unresolved_dead_letters as (
  select dead_lettered_at from public.payment_proof_outbox where status='dead_letter'
  union all
  select dead_lettered_at from private.payment_proof_processing_queue where status='dead_letter'
 ), unresolved_summary as (
  select count(*)::integer as count, min(dead_lettered_at) as oldest_at from unresolved_dead_letters
 ) select jsonb_build_object('outbox',l.metrics||jsonb_build_object(
  'unresolved_dead_letter',u.count,
  'oldest_unresolved_dead_letter_at',u.oldest_at,
  'oldest_unresolved_dead_letter_age_seconds',case when u.oldest_at is null then null else greatest(0,floor(extract(epoch from(now()-u.oldest_at)))::integer) end
 )) from legacy_outbox l cross join unresolved_summary u);

 result:=result||(select jsonb_build_object('purge',jsonb_build_object(
  'failures_last_60m',(count(*) filter(where e.event_type='purge_failed' and e.created_at>=now()-interval '60 minutes'))::integer
 )) from public.payment_proof_events e);

 result:=result||(select jsonb_build_object('failures',jsonb_build_object(
  'render_last_60m',(count(*) filter(where f.stage='render' and f.created_at>=now()-interval '60 minutes'))::integer,
  'classifier_last_60m',(count(*) filter(where f.stage='classifier' and f.created_at>=now()-interval '60 minutes'))::integer
 )) from private.payment_proof_operational_failures f);

 result:=result||(select jsonb_build_object('maintenance',jsonb_build_object(
  'running',h.running,
  'last_started_at',h.last_started_at,
  'last_finished_at',h.last_finished_at,
  'last_success_at',h.last_success_at,
  'age_seconds',case when h.last_success_at is null then null else greatest(0,floor(extract(epoch from(now()-h.last_success_at)))::integer) end,
  'consecutive_failures',h.consecutive_failures::integer
 )) from private.payment_proof_maintenance_health h where h.singleton);

 return result;
end$$;

revoke all on function public.get_payment_proof_operational_metrics() from public,anon,authenticated;
grant execute on function public.get_payment_proof_operational_metrics() to service_role;
