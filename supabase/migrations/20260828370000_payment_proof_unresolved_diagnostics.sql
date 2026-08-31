-- Forward-only aggregate diagnostics for unresolved payment-proof dead letters.
drop policy if exists payment_proof_outbox_staff_read on public.payment_proof_outbox;
create policy payment_proof_outbox_staff_read on public.payment_proof_outbox for select to authenticated using(exists(select 1 from public.perfis p where p.id=auth.uid() and p.ativo and p.funcao in('admin','supervisor')));

create table private.payment_proof_alert_delivery_failures (
 alert_id bigint primary key references private.payment_proof_admin_alert_outbox(id) on delete restrict,
 recorded_at timestamptz not null default now()
);
revoke all on private.payment_proof_alert_delivery_failures from public,anon,authenticated,service_role;

create or replace function public.record_payment_proof_alert_delivery_failure(p_alert_id bigint)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';
 end if;
 -- Retention bounds the sanitized ledger; its rows are never alert candidates.
 delete from private.payment_proof_alert_delivery_failures where recorded_at<now()-interval '24 hours';
 insert into private.payment_proof_alert_delivery_failures(alert_id)
 select id from private.payment_proof_admin_alert_outbox where id=p_alert_id
 on conflict(alert_id) do nothing;
 return true;
end$$;

create or replace function public.get_payment_proof_operational_metrics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select jsonb_build_object('lifecycle',jsonb_build_object(
  'received',count(*)filter(where p.status='received'),'identity_pending',count(*)filter(where p.status='identity_pending'),'processing',count(*)filter(where p.status='processing'),'review',count(*)filter(where p.status='review'),'admitted',count(*)filter(where p.status='admitted'),'quarantined',count(*)filter(where p.status='quarantined'),'purging',count(*)filter(where p.status='purging'),'duplicate',count(*)filter(where p.status='duplicate'),'purged',count(*)filter(where p.status='purged')),
  'quarantine',jsonb_build_object('total',count(*)filter(where p.status='quarantined'),'expired',count(*)filter(where p.status='quarantined' and p.purge_after<=now()))) into result from public.payment_proofs p;
 result:=result||(with legacy_outbox as (
  select jsonb_build_object('pending',count(*)filter(where status='pending'),'claimed',count(*)filter(where status='claimed'),'completed',count(*)filter(where status='completed'),'dead_letter',count(*)filter(where status='dead_letter'),'attempts',jsonb_build_object('zero',count(*)filter(where attempts=0),'one',count(*)filter(where attempts=1),'two',count(*)filter(where attempts=2),'three_to_four',count(*)filter(where attempts between 3 and 4),'five_plus',count(*)filter(where attempts>=5)),'dead_letter_last_60m',count(*)filter(where dead_lettered_at>=now()-interval '60 minutes')) as metrics
  from public.payment_proof_outbox
 ), unresolved_dead_letters as (
  select dead_lettered_at from public.payment_proof_outbox where status='dead_letter'
  union all
  select dead_lettered_at from private.payment_proof_processing_queue where status='dead_letter'
 ), unresolved_summary as (
  select count(*) as count, min(dead_lettered_at) as oldest_at from unresolved_dead_letters
 ) select jsonb_build_object('outbox',l.metrics||jsonb_build_object('unresolved_dead_letter',u.count,'oldest_unresolved_dead_letter_at',u.oldest_at,'oldest_unresolved_dead_letter_age_seconds',case when u.oldest_at is null then null else greatest(0,floor(extract(epoch from(now()-u.oldest_at)))::bigint) end))
  from legacy_outbox l cross join unresolved_summary u);
 result:=result||(select jsonb_build_object('purge',jsonb_build_object('failures_last_60m',count(*)filter(where e.event_type='purge_failed' and e.created_at>=now()-interval '60 minutes'))) from public.payment_proof_events e);
 result:=result||(select jsonb_build_object('failures',jsonb_build_object('render_last_60m',count(*)filter(where f.stage='render' and f.created_at>=now()-interval '60 minutes'),'classifier_last_60m',count(*)filter(where f.stage='classifier' and f.created_at>=now()-interval '60 minutes'))) from private.payment_proof_operational_failures f);
 result:=result||(select jsonb_build_object('maintenance',jsonb_build_object('running',h.running,'last_started_at',h.last_started_at,'last_finished_at',h.last_finished_at,'last_success_at',h.last_success_at,'age_seconds',case when h.last_success_at is null then null else greatest(0,floor(extract(epoch from(now()-h.last_success_at)))::bigint) end,'consecutive_failures',h.consecutive_failures)) from private.payment_proof_maintenance_health h where h.singleton);
 return result;
end$$;

create or replace function public.get_payment_proof_unresolved_diagnostics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.perfis p where p.id=auth.uid() and p.ativo and p.funcao in('admin','supervisor')) then
  raise exception using errcode='42501',message='PAYMENT_PROOF_DIAGNOSTICS_FORBIDDEN';
 end if;
 return (select jsonb_build_object('processing_queue_dead_letter',count(*)filter(where source='processing_queue'),'outbox_dead_letter',count(*)filter(where source='outbox'),'unresolved_dead_letter',count(*),'oldest_unresolved_dead_letter_at',min(dead_lettered_at),'oldest_unresolved_dead_letter_age_seconds',case when min(dead_lettered_at) is null then null else greatest(0,floor(extract(epoch from(now()-min(dead_lettered_at))))::bigint) end) from (
  select 'processing_queue'::text source,dead_lettered_at from private.payment_proof_processing_queue where status='dead_letter' union all
  select 'outbox'::text,dead_lettered_at from public.payment_proof_outbox where status='dead_letter'
 ) dead_letters);
end$$;

revoke all on function public.record_payment_proof_alert_delivery_failure(bigint),public.get_payment_proof_unresolved_diagnostics() from public,anon,authenticated;
grant execute on function public.record_payment_proof_alert_delivery_failure(bigint) to service_role;
grant execute on function public.get_payment_proof_unresolved_diagnostics() to authenticated;
