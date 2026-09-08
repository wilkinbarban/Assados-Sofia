-- Generic durable notification deliveries are intentionally separate from the
-- payment-proof queue: one event produces one independently fenced destination.
create table public.notification_outbox(
 id bigint generated always as identity primary key,
 aggregate_type text not null check(aggregate_type in('order','payment','refund','receipt')),
 aggregate_id uuid not null,
 event_type text not null check(
  (aggregate_type='order' and event_type in('order_created','order_status_changed')) or
  (aggregate_type='payment' and event_type in('payment_received','payment_status_changed')) or
  (aggregate_type='refund' and event_type in('refund_requested','refund_completed')) or
  (aggregate_type='receipt' and event_type='receipt_issued')
 ),
 event_id uuid not null,
 customer_id uuid references public.clientes(id) on delete restrict,
 conversation_id uuid references public.conversas(id) on delete restrict,
 channel text not null check(channel in('web','whatsapp','telegram')),
 payload jsonb not null check(
  jsonb_typeof(payload)='object' and payload ? 'message_key' and
  payload - array['message_key','status','reason_code']='{}'::jsonb and
  not jsonb_path_exists(payload,'$.* ? (@.type() != "string")')
 ),
 delivery_key text not null unique check(delivery_key~'^[0-9a-f-]{36}:(web|whatsapp|telegram)$'),
 status text not null default 'pending' check(status in('pending','claimed','completed','dead_letter','abandoned')),
 attempts integer not null default 0 check(attempts>=0),
 max_attempts integer not null default 5 check(max_attempts between 1 and 10),
 lease_token uuid,
 claimed_until timestamptz,
 next_attempt_at timestamptz not null default now(),
 last_error text,
 completed_at timestamptz,
 dead_lettered_at timestamptz,
 abandoned_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((status='claimed')=(lease_token is not null and claimed_until is not null)),
 check((status='completed')=(completed_at is not null)),
 check((status='dead_letter')=(dead_lettered_at is not null)),
 check((status='abandoned')=(abandoned_at is not null))
);
create index notification_outbox_claim_idx on public.notification_outbox(next_attempt_at,id) where status in('pending','claimed');
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public,anon,authenticated,service_role;
grant select on public.notification_outbox to authenticated;
create policy notification_outbox_staff_read on public.notification_outbox for select to authenticated using(exists(select 1 from public.perfis p where p.id=auth.uid() and p.ativo and p.funcao in('admin','supervisor','vendedor')));

create function public.enqueue_notification_outbox(p_aggregate_type text,p_aggregate_id uuid,p_event_type text,p_event_id uuid,p_customer_id uuid,p_conversation_id uuid,p_channel text,p_payload jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_id bigint;v_key text:=p_event_id::text||':'||p_channel;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='NOTIFICATION_OUTBOX_SERVICE_ROLE_REQUIRED';end if;
 insert into public.notification_outbox(aggregate_type,aggregate_id,event_type,event_id,customer_id,conversation_id,channel,payload,delivery_key)
 values(p_aggregate_type,p_aggregate_id,p_event_type,p_event_id,p_customer_id,p_conversation_id,p_channel,p_payload,v_key)
 on conflict(delivery_key) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from public.notification_outbox where delivery_key=v_key;
  if not exists(select 1 from public.notification_outbox where id=v_id and aggregate_type=p_aggregate_type and aggregate_id=p_aggregate_id and event_type=p_event_type and event_id=p_event_id and customer_id is not distinct from p_customer_id and conversation_id is not distinct from p_conversation_id and payload=p_payload) then raise exception using errcode='23505',message='NOTIFICATION_OUTBOX_DELIVERY_CONFLICT';end if;
 end if;return v_id;
end $$;

create function public.claim_notification_outbox(p_lease_seconds integer default 60) returns table(id bigint,aggregate_type text,aggregate_id uuid,event_type text,event_id uuid,customer_id uuid,conversation_id uuid,channel text,payload jsonb,delivery_key text,attempt integer,lease_token uuid)
language plpgsql security definer set search_path='' as $$
declare v public.notification_outbox%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='NOTIFICATION_OUTBOX_SERVICE_ROLE_REQUIRED';end if;
 if p_lease_seconds not between 10 and 300 then raise exception using errcode='22023',message='NOTIFICATION_OUTBOX_LEASE_INVALID';end if;
 select * into v from public.notification_outbox where status in('pending','claimed') and next_attempt_at<=now() and (status='pending' or claimed_until<=now()) order by notification_outbox.next_attempt_at,notification_outbox.id for update skip locked limit 1;
 if not found then return;end if;
 if v.status='claimed' and v.attempts>=v.max_attempts then update public.notification_outbox set status='dead_letter',lease_token=null,claimed_until=null,dead_lettered_at=now(),updated_at=now() where notification_outbox.id=v.id;return;end if;
 update public.notification_outbox set status='claimed',attempts=attempts+1,lease_token=gen_random_uuid(),claimed_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now() where notification_outbox.id=v.id returning * into v;
 return query select v.id,v.aggregate_type,v.aggregate_id,v.event_type,v.event_id,v.customer_id,v.conversation_id,v.channel,v.payload,v.delivery_key,v.attempts,v.lease_token;
end $$;

create function public.complete_notification_outbox(p_id bigint,p_disposition text,p_error text,p_lease_token uuid,p_attempt integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;v_error text:=case when p_error in('delivery_failed','whatsapp_window_closed','invalid_destination','delivery_conflict','provider_unavailable') then p_error else 'operation_failed' end;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='NOTIFICATION_OUTBOX_SERVICE_ROLE_REQUIRED';end if;
 if p_disposition not in('success','retryable','permanent') then raise exception using errcode='22023',message='NOTIFICATION_OUTBOX_DISPOSITION_INVALID';end if;
 update public.notification_outbox set status=case when p_disposition='success' then 'completed' when p_disposition='permanent' or attempts>=max_attempts then 'dead_letter' else 'pending' end,completed_at=case when p_disposition='success' then now() else null end,dead_lettered_at=case when p_disposition='permanent' or (p_disposition='retryable' and attempts>=max_attempts) then now() else null end,lease_token=null,claimed_until=null,last_error=case when p_disposition='success' then null else v_error end,next_attempt_at=case when p_disposition='retryable' and attempts<max_attempts then now()+make_interval(secs=>least(3600,30*(2^greatest(attempts-1,0)))) else next_attempt_at end,updated_at=now() where notification_outbox.id=p_id and status='claimed' and lease_token=p_lease_token and attempts=p_attempt;
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.enqueue_notification_outbox(text,uuid,text,uuid,uuid,uuid,text,jsonb),public.claim_notification_outbox(integer),public.complete_notification_outbox(bigint,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.enqueue_notification_outbox(text,uuid,text,uuid,uuid,uuid,text,jsonb),public.claim_notification_outbox(integer),public.complete_notification_outbox(bigint,text,text,uuid,integer) to service_role;
