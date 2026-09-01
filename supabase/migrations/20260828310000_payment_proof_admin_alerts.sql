-- Private, aggregate-only administrative alert state and transactional notification outbox.
create schema if not exists private;
create table private.payment_proof_admin_alert_state (
 family text primary key check(family in ('dead_letter_growth','expired_quarantines','repeated_processing_failures','maintenance_unhealthy')),
 active boolean not null default false, generation bigint not null default 0 check(generation>=0), opened_at timestamptz,
 initialized_at timestamptz not null default now(), last_count bigint not null default 0 check(last_count>=0), last_severity bigint not null default 0 check(last_severity>=0)
);
create table private.payment_proof_admin_alert_outbox (
 id bigint generated always as identity primary key,
 family text not null check(family in ('dead_letter_growth','expired_quarantines','repeated_processing_failures','maintenance_unhealthy')),
 kind text not null check(kind in ('initial','escalation_30m','escalation_60m','recovery')),
 generation bigint not null check(generation>0), count bigint not null default 0 check(count>=0), severity bigint not null default 0 check(severity>=0),
 status text not null default 'pending' check(status in ('pending','claimed','completed','dead_letter')),
 attempts integer not null default 0 check(attempts between 0 and 5), next_attempt_at timestamptz not null default now(), claimed_until timestamptz, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(family,generation,kind)
);
create index payment_proof_admin_alert_claim_idx on private.payment_proof_admin_alert_outbox(status,next_attempt_at,claimed_until);
revoke all on private.payment_proof_admin_alert_state,private.payment_proof_admin_alert_outbox from public,anon,authenticated,service_role;
insert into private.payment_proof_admin_alert_state(family) values ('dead_letter_growth'),('expired_quarantines'),('repeated_processing_failures'),('maintenance_unhealthy') on conflict do nothing;

create or replace function public.reconcile_payment_proof_admin_alerts(p_conditions jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; fam text; is_active boolean; cnt bigint; sev bigint; state private.payment_proof_admin_alert_state%rowtype; changed integer:=0; now_at timestamptz:=now();
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED'; end if;
 if jsonb_typeof(p_conditions)<>'array' or jsonb_array_length(p_conditions)<>4 then raise exception using errcode='22023',message='PAYMENT_PROOF_ALERT_CONDITIONS_INVALID'; end if;
 for item in select value from jsonb_array_elements(p_conditions) loop
  if (select count(*) from jsonb_object_keys(item))<>4 or not(item ?& array['family','active','count','severity']) then raise exception using errcode='22023',message='PAYMENT_PROOF_ALERT_CONDITIONS_INVALID'; end if;
  fam:=item->>'family'; if fam not in ('dead_letter_growth','expired_quarantines','repeated_processing_failures','maintenance_unhealthy') then raise exception using errcode='22023',message='PAYMENT_PROOF_ALERT_FAMILY_INVALID'; end if;
  is_active:=(item->>'active')::boolean; cnt:=(item->>'count')::bigint; sev:=(item->>'severity')::bigint; if cnt<0 or sev<0 then raise exception using errcode='22023',message='PAYMENT_PROOF_ALERT_AGGREGATE_INVALID'; end if;
  select * into state from private.payment_proof_admin_alert_state where family=fam for update;
  -- Missing maintenance success is suppressed only during the durable initialization grace.
  if fam='maintenance_unhealthy' and is_active and cnt=0 and now_at < state.initialized_at+interval '300 seconds' then is_active:=false; end if;
  if is_active and not state.active then
   update private.payment_proof_admin_alert_state set active=true,generation=generation+1,opened_at=now_at,last_count=cnt,last_severity=sev where family=fam returning * into state;
   insert into private.payment_proof_admin_alert_outbox(family,kind,generation,count,severity) values(fam,'initial',state.generation,cnt,sev) on conflict do nothing; changed:=changed+1;
  elsif is_active and state.active then
   update private.payment_proof_admin_alert_state set last_count=cnt,last_severity=sev where family=fam;
   if now_at>=state.opened_at+interval '30 minutes' then insert into private.payment_proof_admin_alert_outbox(family,kind,generation,count,severity) values(fam,'escalation_30m',state.generation,cnt,sev) on conflict do nothing; end if;
   if now_at>=state.opened_at+interval '60 minutes' then insert into private.payment_proof_admin_alert_outbox(family,kind,generation,count,severity) values(fam,'escalation_60m',state.generation,cnt,sev) on conflict do nothing; end if;
  elsif not is_active and state.active then
   insert into private.payment_proof_admin_alert_outbox(family,kind,generation,count,severity) values(fam,'recovery',state.generation,cnt,sev) on conflict do nothing;
   update private.payment_proof_admin_alert_state set active=false,opened_at=null,last_count=cnt,last_severity=sev where family=fam; changed:=changed+1;
  end if;
 end loop;
 if (select count(distinct value->>'family') from jsonb_array_elements(p_conditions))<>4 then raise exception using errcode='22023',message='PAYMENT_PROOF_ALERT_CONDITIONS_INVALID'; end if;
 return changed;
end$$;

create or replace function public.claim_payment_proof_admin_alerts(p_limit integer default 8)
returns table(id bigint,family text,kind text,count bigint,severity bigint) language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED'; end if;
 if p_limit<1 or p_limit>8 then raise exception using errcode='22023',message='PAYMENT_PROOF_ALERT_LIMIT_INVALID'; end if;
 -- A worker may crash after taking the fifth claim. Recover final expired leases
 -- before selecting work so they cannot remain permanently claimed.
 update private.payment_proof_admin_alert_outbox
 set status='dead_letter',claimed_until=null,next_attempt_at=now()
 where status='claimed' and claimed_until<=now() and attempts>=5;
 return query with candidates as (select o.id from private.payment_proof_admin_alert_outbox o where ((o.status='pending' and o.next_attempt_at<=now()) or (o.status='claimed' and o.claimed_until<=now())) and o.attempts<5 order by o.id for update skip locked limit p_limit), updated as (update private.payment_proof_admin_alert_outbox o set status='claimed',attempts=o.attempts+1,claimed_until=now()+interval '2 minutes' from candidates c where o.id=c.id returning o.*) select u.id,u.family,u.kind,u.count,u.severity from updated u order by u.id;
end$$;

create or replace function public.complete_payment_proof_admin_alert(p_id bigint,p_success boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED'; end if;
 update private.payment_proof_admin_alert_outbox set status=case when p_success then 'completed' when attempts>=5 then 'dead_letter' else 'pending' end,completed_at=case when p_success then now() else null end,claimed_until=null,next_attempt_at=case when p_success then next_attempt_at else now()+make_interval(secs=>least(300,15*(2^greatest(attempts-1,0)))) end where id=p_id and status='claimed'; get diagnostics n=row_count; return n=1;
end$$;
revoke all on function public.reconcile_payment_proof_admin_alerts(jsonb),public.claim_payment_proof_admin_alerts(integer),public.complete_payment_proof_admin_alert(bigint,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_payment_proof_admin_alerts(jsonb),public.claim_payment_proof_admin_alerts(integer),public.complete_payment_proof_admin_alert(bigint,boolean) to service_role;
