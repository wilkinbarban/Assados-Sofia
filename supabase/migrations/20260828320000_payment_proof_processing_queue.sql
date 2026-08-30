-- Durable, payload-free queue for post-intake payment-proof processing.
create table private.payment_proof_processing_queue (
 proof_id uuid primary key references public.payment_proofs(id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','claimed','completed','dead_letter')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_attempt_at timestamptz not null default now(),claimed_until timestamptz,lease_token uuid,
 completed_at timestamptz,dead_lettered_at timestamptz,
 failure_stage text check(failure_stage in ('load','render','preview','classifier')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((status='claimed')=(claimed_until is not null)),check((status='claimed')=(lease_token is not null))
);
revoke all on private.payment_proof_processing_queue from public,anon,authenticated;
alter table public.payment_proof_outbox add column if not exists lease_token uuid;

create function public.enqueue_payment_proof_processing(p_proof_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.payment_proofs%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select * into p from public.payment_proofs where id=p_proof_id for update;
 if not found or p.status='duplicate' or p.original_storage_key is null or p.sha256 is null then raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_QUEUEABLE';end if;
 insert into private.payment_proof_processing_queue(proof_id) values(p_proof_id) on conflict(proof_id) do nothing;return true;
end$$;

-- Upload remains external; admission, exact-hash dedupe, and queue creation commit together.
create function public.admit_and_enqueue_payment_proof(
 p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,p_storage_key text,
 p_size_bytes bigint,p_mime_type text,p_order_id uuid,p_sha256 text
) returns table(proof_id uuid,status text,idempotent boolean,canonical_proof_id uuid,duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare a record;h record;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.admit_payment_proof_intake(p_channel,p_delivery_key,p_customer_id,p_sender_reference,p_storage_key,p_size_bytes,p_mime_type,p_order_id);
 select * into h from public.register_payment_proof_hash(a.proof_id,p_sha256);
 if not h.duplicate then perform public.enqueue_payment_proof_processing(a.proof_id);end if;
 return query select a.proof_id,(select p.status from public.payment_proofs p where p.id=a.proof_id),a.idempotent,h.canonical_proof_id,h.duplicate;
end$$;

-- Fast authenticated replay check. A fully persisted intake with no queue is repaired atomically.
-- The response is deliberately a fixed enum only; proof identity never crosses this boundary.
create function public.get_payment_proof_delivery_state(p_channel text,p_delivery_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payment_proofs%rowtype;q private.payment_proof_processing_queue%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_channel not in('web','telegram','whatsapp') or nullif(btrim(p_delivery_key),'') is null then raise exception using errcode='22023',message='PAYMENT_PROOF_DELIVERY_INVALID';end if;
 select * into p from public.payment_proofs where channel=p_channel and delivery_key=btrim(p_delivery_key) for update;
 if not found then return jsonb_build_object('state','missing');end if;
 select * into q from private.payment_proof_processing_queue where proof_id=p.id;
 if p.status='duplicate' or p.status in('review','quarantined','admitted','purging','purged') or q.status in('completed','dead_letter') then return jsonb_build_object('state','complete');end if;
 if found or q.proof_id is not null then return jsonb_build_object('state','queued');end if;
 if p.original_storage_key is not null and p.sha256 is not null then
  insert into private.payment_proof_processing_queue(proof_id) values(p.id) on conflict do nothing;
  return jsonb_build_object('state','queued');
 end if;
 return jsonb_build_object('state','repairable');
end$$;

insert into private.payment_proof_processing_queue(proof_id)
select p.id from public.payment_proofs p where p.status in('received','processing') and p.original_storage_key is not null and p.sha256 is not null
 and p.preview_storage_key is null and not exists(select 1 from private.payment_proof_processing_queue q where q.proof_id=p.id) on conflict do nothing;

-- Remove the legacy overloads so no caller can bypass lease ownership and
-- default arguments cannot make function resolution ambiguous.
drop function public.claim_payment_proof_maintenance(integer);
drop function public.complete_payment_proof_maintenance(text,text,boolean,text);

-- Callers select a kind using a bounded schedule, preventing a hot queue from starving another kind.
create function public.claim_payment_proof_maintenance(p_lease_seconds integer default 60,p_kind text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.payment_proof_processing_queue%rowtype;o public.payment_proof_outbox%rowtype;p public.payment_proofs%rowtype;v_token uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_kind is not null and p_kind not in('processing','outbox','purge') then raise exception using errcode='22023',message='PAYMENT_PROOF_MAINTENANCE_KIND_INVALID';end if;
 if p_kind is null or p_kind='processing' then
  loop
   select * into q from private.payment_proof_processing_queue where status in('pending','claimed') and next_attempt_at<=now() and(status='pending' or claimed_until<=now()) order by created_at,proof_id for update skip locked limit 1;
   exit when not found;
   if q.status='claimed' and q.attempts>=5 then update private.payment_proof_processing_queue set status='dead_letter',claimed_until=null,lease_token=null,dead_lettered_at=now(),updated_at=now() where proof_id=q.proof_id;update public.payment_proofs set status=case when status in('received','processing') then 'review' else status end,updated_at=now() where id=q.proof_id;
   else v_token:=gen_random_uuid();update private.payment_proof_processing_queue set status='claimed',attempts=attempts+1,claimed_until=now()+make_interval(secs=>greatest(10,least(p_lease_seconds,300))),lease_token=v_token,updated_at=now() where proof_id=q.proof_id returning * into q;update public.payment_proofs set status='processing',updated_at=now() where id=q.proof_id and status='received';return jsonb_build_object('kind','processing','id',q.proof_id,'attempt',q.attempts,'lease_token',q.lease_token);end if;
  end loop;
  if p_kind='processing' then return null;end if;
 end if;
 if p_kind is null or p_kind='outbox' then
  select * into o from public.payment_proof_outbox where status in('pending','claimed') and next_attempt_at<=now() and(status='pending' or claimed_until<=now()) order by id for update skip locked limit 1;
  if found then v_token:=gen_random_uuid();update public.payment_proof_outbox set status='claimed',claimed_until=now()+make_interval(secs=>greatest(10,least(p_lease_seconds,300))),attempts=attempts+1,lease_token=v_token where id=o.id returning * into o;return jsonb_build_object('kind','outbox','id',o.id,'channel',o.channel,'payload',o.payload,'delivery_key',o.delivery_key,'attempt',o.attempts,'lease_token',o.lease_token);end if;
  if p_kind='outbox' then return null;end if;
 end if;
 if p_kind is null or p_kind='purge' then select * into p from public.payment_proofs where status='quarantined' and purge_after<=now() order by purge_after,id for update skip locked limit 1;if found then update public.payment_proofs set status='purging',updated_at=now() where id=p.id;return jsonb_build_object('kind','purge','id',p.id,'original_key',p.original_storage_key,'preview_key',p.preview_storage_key);end if;end if;
 return null;
end$$;

create function public.complete_payment_proof_maintenance(p_kind text,p_id text,p_success boolean,p_error text default null,p_lease_token uuid default null,p_attempt integer default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;v_proof public.payment_proofs%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_kind='processing' then
  select * into v_proof from public.payment_proofs where id=p_id::uuid;if p_success and (v_proof.preview_storage_key is null or v_proof.status not in('review','quarantined')) then return false;end if;
  update private.payment_proof_processing_queue set status=case when p_success then 'completed' when attempts>=5 then 'dead_letter' else 'pending' end,completed_at=case when p_success then now() else null end,dead_lettered_at=case when not p_success and attempts>=5 then now() else dead_lettered_at end,claimed_until=null,lease_token=null,failure_stage=case when p_success then null when p_error in('load','render','preview','classifier') then p_error else 'load' end,next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^greatest(attempts-1,0)))),updated_at=now() where proof_id=p_id::uuid and status='claimed' and lease_token=p_lease_token and attempts=p_attempt;get diagnostics n=row_count;
  if n=1 and not p_success and (select attempts>=5 from private.payment_proof_processing_queue where proof_id=p_id::uuid) then update public.payment_proofs set status=case when status in('received','processing') then 'review' else status end,updated_at=now() where id=p_id::uuid;end if;return n=1;
 end if;
 if p_kind='outbox' then update public.payment_proof_outbox set status=case when p_success then 'completed' when attempts>=5 then 'dead_letter' else 'pending' end,completed_at=case when p_success then now() else null end,dead_lettered_at=case when not p_success and attempts>=5 then now() else dead_lettered_at end,claimed_until=null,lease_token=null,last_error=case when p_success then null else 'operation_failed' end,next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^greatest(attempts-1,0)))) where id=p_id::bigint and status='claimed' and lease_token=p_lease_token and attempts=p_attempt;get diagnostics n=row_count;return n=1;end if;
 if p_kind='purge' then select * into v_proof from public.payment_proofs where id=p_id::uuid and status='purging' for update;if not found then return false;end if;update public.payment_proofs set status=case when p_success then 'purged' else 'quarantined' end,preview_storage_key=case when p_success then null else preview_storage_key end,updated_at=now(),purge_after=case when p_success then purge_after else now()+interval '1 hour' end where id=p_id::uuid;insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason)values(p_id::uuid,case when p_success then 'purged' else 'purge_failed' end,'worker','quarantined',case when p_success then 'purged' else 'quarantined' end,case when p_success then null else 'storage_delete_failed' end);return true;end if;return false;
end$$;

revoke all on function public.enqueue_payment_proof_processing(uuid),public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,text),public.get_payment_proof_delivery_state(text,text),public.claim_payment_proof_maintenance(integer,text),public.complete_payment_proof_maintenance(text,text,boolean,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.enqueue_payment_proof_processing(uuid),public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,text),public.get_payment_proof_delivery_state(text,text),public.claim_payment_proof_maintenance(integer,text),public.complete_payment_proof_maintenance(text,text,boolean,text,uuid,integer) to service_role;
