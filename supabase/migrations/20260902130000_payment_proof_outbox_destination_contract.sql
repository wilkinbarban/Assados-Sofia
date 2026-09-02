-- Bind every newly-produced payment-proof notification to the conversation that
-- was authoritative at intake. Historical rows remain nullable for a later repair unit.
alter table public.payment_proofs
  add column if not exists conversation_id uuid references public.conversas(id) on delete restrict;
alter table public.payment_proof_outbox
  add column if not exists conversation_id uuid references public.conversas(id) on delete restrict;

-- Intake has one callable signature. It validates the optional authoritative
-- destination under lock and refuses an idempotent delivery with a changed binding.
drop function if exists public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text);
drop function if exists public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid);
create function public.admit_payment_proof_intake(
 p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,p_storage_key text,
 p_size_bytes bigint,p_mime_type text,p_order_id uuid,p_conversation_id uuid
) returns table(proof_id uuid,status text,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;v_order public.pedidos%rowtype;v_conversation public.conversas%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_channel not in('web','telegram','whatsapp') or nullif(btrim(p_delivery_key),'') is null or nullif(btrim(p_storage_key),'') is null or p_mime_type<>'application/pdf' or p_size_bytes<5 or p_size_bytes>5242880 then raise exception using errcode='22023',message='PAYMENT_PROOF_INTAKE_INVALID';end if;
 if p_channel='web' and p_order_id is null then raise exception using errcode='22023',message='PAYMENT_PROOF_ORDER_REQUIRED';end if;
 if p_conversation_id is null then raise exception using errcode='22023',message='PAYMENT_PROOF_CONVERSATION_REQUIRED';end if;
 if p_order_id is not null then
  select * into v_order from public.pedidos where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO';end if;
  if p_customer_id is null or v_order.cliente_id<>p_customer_id then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH';end if;
  if v_order.status='cancelado' or v_order.status_pagamento<>'pendente' then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_INELIGIBLE';end if;
 end if;
 if p_conversation_id is not null then
  select * into v_conversation from public.conversas where id=p_conversation_id for update;
  if not found or p_customer_id is null or v_conversation.cliente_id<>p_customer_id then raise exception using errcode='23514',message='PAYMENT_PROOF_CONVERSATION_CUSTOMER_MISMATCH';end if;
 end if;
 select * into v from public.payment_proofs where channel=p_channel and delivery_key=btrim(p_delivery_key) for update;
 if found then
  if v.customer_id is distinct from p_customer_id or v.original_storage_key<>btrim(p_storage_key) or v.size_bytes<>p_size_bytes then raise exception using errcode='23505',message='PAYMENT_PROOF_DELIVERY_CONFLICT';end if;
  if v.conversation_id is null then
   update public.payment_proofs set conversation_id=p_conversation_id,updated_at=now() where id=v.id;
   v.conversation_id:=p_conversation_id;
  elsif v.conversation_id is distinct from p_conversation_id then
   raise exception using errcode='23505',message='PAYMENT_PROOF_DELIVERY_CONFLICT';
  end if;
  if p_order_id is not null and not exists(select 1 from public.payment_proof_order_intents where proof_id=v.id and pedido_id=p_order_id) then raise exception using errcode='23505',message='PAYMENT_PROOF_DELIVERY_ORDER_CONFLICT';end if;
  return query select v.id,v.status,true;return;
 end if;
 if p_order_id is not null and public.is_order_payment_proof_locked(p_order_id) then raise exception using errcode='23514',message='ORDER_PAYMENT_PROOF_ALREADY_PENDING';end if;
 insert into public.payment_proofs(customer_id,conversation_id,channel,delivery_key,sender_reference,status,original_storage_key,mime_type,size_bytes)
 values(p_customer_id,p_conversation_id,p_channel,btrim(p_delivery_key),nullif(btrim(p_sender_reference),''),case when p_customer_id is null then 'identity_pending' else 'received' end,btrim(p_storage_key),p_mime_type,p_size_bytes) returning * into v;
 if p_order_id is not null then insert into public.payment_proof_order_intents(proof_id,pedido_id) values(v.id,p_order_id);end if;
 insert into public.payment_proof_events(proof_id,event_type,source,result_status,metadata) values(v.id,'intake_received',p_channel,v.status,jsonb_build_object('identity_resolved',p_customer_id is not null,'requested_order_id',p_order_id));
 return query select v.id,v.status,false;
end $$;

-- Upload remains external; admission, exact-hash dedupe, and queue creation commit together.
drop function if exists public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,text);
create function public.admit_and_enqueue_payment_proof(
 p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,p_storage_key text,
 p_size_bytes bigint,p_mime_type text,p_order_id uuid,p_conversation_id uuid,p_sha256 text
) returns table(proof_id uuid,status text,idempotent boolean,canonical_proof_id uuid,duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare a record;h record;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.admit_payment_proof_intake(p_channel,p_delivery_key,p_customer_id,p_sender_reference,p_storage_key,p_size_bytes,p_mime_type,p_order_id,p_conversation_id);
 select * into h from public.register_payment_proof_hash(a.proof_id,p_sha256);
 if not h.duplicate then perform public.enqueue_payment_proof_processing(a.proof_id);end if;
 return query select a.proof_id,(select p.status from public.payment_proofs p where p.id=a.proof_id),a.idempotent,h.canonical_proof_id,h.duplicate;
end $$;

-- Every current outbox producer copies the proof's immutable destination.
create or replace function public.register_payment_proof_hash(p_proof_id uuid,p_sha256 text) returns table(canonical_proof_id uuid,duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare v uuid;v_proof public.payment_proofs%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_sha256!~'^[0-9a-f]{64}$' then raise exception using errcode='22023',message='PAYMENT_PROOF_HASH_INVALID';end if;
 select * into v_proof from public.payment_proofs where id=p_proof_id for update;if not found then raise exception using message='PAYMENT_PROOF_NOT_FOUND';end if;
 insert into public.payment_proof_hash_tombstones(sha256,canonical_proof_id) values(p_sha256,p_proof_id) on conflict do nothing;
 select t.canonical_proof_id into v from public.payment_proof_hash_tombstones t where t.sha256=p_sha256;
 update public.payment_proofs set sha256=p_sha256,status=case when v=p_proof_id then status else 'duplicate' end,updated_at=now() where id=p_proof_id;
 if v<>p_proof_id then
  insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status) values(p_proof_id,'duplicate_detected','worker',v_proof.status,'duplicate');
  insert into public.payment_proof_outbox(proof_id,conversation_id,event_type,channel,payload) values(p_proof_id,v_proof.conversation_id,'payment_proof_duplicate',v_proof.channel,jsonb_build_object('message_key','payment_proof_already_received')) on conflict do nothing;
 end if;return query select v,v<>p_proof_id;
end $$;

create or replace function public.quarantine_payment_proof(p_proof_id uuid,p_reason text) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;v_deadline timestamptz:=now()+interval '10 days';begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select * into v from public.payment_proofs where id=p_proof_id for update;
 update public.payment_proofs set status='quarantined',quarantined_at=now(),purge_after=v_deadline,updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason) values(p_proof_id,'quarantined','worker',v.status,'quarantined',p_reason);
 insert into public.payment_proof_outbox(proof_id,conversation_id,event_type,channel,payload) values(p_proof_id,v.conversation_id,'payment_proof_rejected',v.channel,jsonb_build_object('message_key','payment_proof_under_review')) on conflict do nothing;
 return v_deadline;
end $$;

create or replace function public.restore_payment_proof(p_proof_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;begin
 if auth.uid() is null or not exists(select 1 from public.perfis p where p.id=auth.uid() and p.ativo and p.funcao='admin') then raise exception using errcode='42501',message='PAYMENT_PROOF_ADMIN_REQUIRED';end if;
 select * into v from public.payment_proofs where id=p_proof_id for update;
 if v.status<>'quarantined' or v.purge_after<=now() then raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_RESTORABLE';end if;
 update public.payment_proofs set status='review',quarantined_at=null,purge_after=null,updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,actor_id,source,previous_status,result_status,reason) values(p_proof_id,'restored',auth.uid(),'operator','quarantined','review',p_reason);
 insert into public.payment_proof_outbox(proof_id,conversation_id,event_type,channel,payload) values(p_proof_id,v.conversation_id,'payment_proof_restored',v.channel,jsonb_build_object('message_key','payment_proof_restored_under_review')) on conflict do nothing;return true;
end $$;

create or replace function public.manage_payment_proof_review(p_proof_id uuid,p_operation text,p_value text,p_lease_token text) returns boolean language plpgsql security definer set search_path='' as $$
declare proof public.payment_proofs%rowtype;role_at_action public.tipo_funcao;begin
 role_at_action:=public.require_active_payment_proof_actor_role();perform public.assert_payment_proof_lease(p_proof_id,p_lease_token);
 if p_operation<>'reject' then raise exception using errcode='22023',message='PAYMENT_PROOF_OPERATION_INVALID';end if;
 select * into proof from public.payment_proofs where id=p_proof_id for update;
 if proof.status not in('received','identity_pending','processing','review','admitted') then raise exception using errcode='23514',message='PAYMENT_PROOF_REJECTION_INVALID_STATE';end if;
 update public.payment_proofs set status='quarantined',quarantined_at=now(),purge_after=now()+interval '10 days',updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,reason) values(p_proof_id,'operator_reviewed',auth.uid(),role_at_action,'operator',proof.status,'quarantined','reject');
 insert into public.payment_proof_outbox(proof_id,conversation_id,event_type,channel,payload) values(p_proof_id,proof.conversation_id,'payment_proof_rejected',proof.channel,jsonb_build_object('message_key','payment_proof_under_review')) on conflict do nothing;
 delete from public.payment_proof_leases where proof_id=p_proof_id;return true;
end $$;

-- Claim retains all current queue, lease, and purge behavior; only outbox rows
-- expose the stored destination as a top-level worker field.
create or replace function public.claim_payment_proof_maintenance(p_lease_seconds integer default 60,p_kind text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.payment_proof_processing_queue%rowtype;o public.payment_proof_outbox%rowtype;p public.payment_proofs%rowtype;v_token uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_kind is not null and p_kind not in('processing','outbox','purge') then raise exception using errcode='22023',message='PAYMENT_PROOF_MAINTENANCE_KIND_INVALID';end if;
 if p_kind is null or p_kind='processing' then loop
  select * into q from private.payment_proof_processing_queue where status in('pending','claimed') and next_attempt_at<=now() and(status='pending' or claimed_until<=now()) order by created_at,proof_id for update skip locked limit 1;exit when not found;
  if q.status='claimed' and q.attempts>=5 then update private.payment_proof_processing_queue set status='dead_letter',claimed_until=null,lease_token=null,dead_lettered_at=now(),updated_at=now() where proof_id=q.proof_id;update public.payment_proofs set status=case when status in('received','processing') then 'review' else status end,updated_at=now() where id=q.proof_id;
  else v_token:=gen_random_uuid();update private.payment_proof_processing_queue set status='claimed',attempts=attempts+1,claimed_until=now()+make_interval(secs=>greatest(10,least(p_lease_seconds,300))),lease_token=v_token,updated_at=now() where proof_id=q.proof_id returning * into q;update public.payment_proofs set status='processing',updated_at=now() where id=q.proof_id and status='received';return jsonb_build_object('kind','processing','id',q.proof_id,'attempt',q.attempts,'lease_token',q.lease_token);end if;
 end loop;if p_kind='processing' then return null;end if;end if;
 if p_kind is null or p_kind='outbox' then select * into o from public.payment_proof_outbox where status in('pending','claimed') and next_attempt_at<=now() and(status='pending' or claimed_until<=now()) order by id for update skip locked limit 1;if found then v_token:=gen_random_uuid();update public.payment_proof_outbox set status='claimed',claimed_until=now()+make_interval(secs=>greatest(10,least(p_lease_seconds,300))),attempts=attempts+1,lease_token=v_token where id=o.id returning * into o;return jsonb_build_object('kind','outbox','id',o.id,'proof_id',o.proof_id,'channel',o.channel,'payload',o.payload,'conversation_id',o.conversation_id,'delivery_key',o.delivery_key,'attempt',o.attempts,'lease_token',o.lease_token);end if;if p_kind='outbox' then return null;end if;end if;
 if p_kind is null or p_kind='purge' then select * into p from public.payment_proofs where (status='quarantined' and purge_after<=now()) or (status='purging' and purge_claimed_until<=now()) order by purge_after,id for update skip locked limit 1;if found then v_token:=gen_random_uuid();update public.payment_proofs set status='purging',purge_attempt=purge_attempt+1,purge_lease_token=v_token,purge_claimed_until=now()+make_interval(secs=>greatest(10,least(p_lease_seconds,300))),updated_at=now() where id=p.id returning * into p;return jsonb_build_object('kind','purge','id',p.id,'original_key',p.original_storage_key,'preview_key',p.preview_storage_key,'attempt',p.purge_attempt,'lease_token',p.purge_lease_token);end if;end if;return null;
end $$;

-- The new disposition contract changes only outbox completion. Processing and
-- purge branches below retain their fenced completion and event behavior.
drop function if exists public.complete_payment_proof_maintenance(text,text,boolean,text);
drop function if exists public.complete_payment_proof_maintenance(text,text,boolean,text,uuid,integer);
create function public.complete_payment_proof_maintenance(p_kind text,p_id text,p_disposition text,p_error text,p_lease_token uuid,p_attempt integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;v_proof public.payment_proofs%rowtype;v_error text:=left(regexp_replace(coalesce(p_error,'operation_failed'),'[^a-zA-Z0-9_.-]','_','g'),160);begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_disposition not in('success','retryable','permanent') then raise exception using errcode='22023',message='PAYMENT_PROOF_DISPOSITION_INVALID';end if;
 if p_kind='outbox' then update public.payment_proof_outbox set status=case when p_disposition='success' then 'completed' when p_disposition='permanent' or attempts>=5 then 'dead_letter' else 'pending' end,completed_at=case when p_disposition='success' then now() else null end,dead_lettered_at=case when p_disposition<>'success' and (p_disposition='permanent' or attempts>=5) then now() else dead_lettered_at end,claimed_until=null,lease_token=null,last_error=case when p_disposition='success' then null else coalesce(nullif(v_error,''),'operation_failed') end,next_attempt_at=case when p_disposition='retryable' then now()+make_interval(secs=>least(3600,30*(2^greatest(attempts-1,0)))) else next_attempt_at end where id=p_id::bigint and status='claimed' and lease_token=p_lease_token and attempts=p_attempt;get diagnostics n=row_count;return n=1;end if;
 if p_disposition not in('success','retryable') then raise exception using errcode='22023',message='PAYMENT_PROOF_DISPOSITION_INVALID';end if;
 if p_kind='processing' then select * into v_proof from public.payment_proofs where id=p_id::uuid;if p_disposition='success' and (v_proof.preview_storage_key is null or v_proof.status not in('review','quarantined')) then return false;end if;update private.payment_proof_processing_queue set status=case when p_disposition='success' then 'completed' when attempts>=5 then 'dead_letter' else 'pending' end,completed_at=case when p_disposition='success' then now() else null end,dead_lettered_at=case when p_disposition='retryable' and attempts>=5 then now() else dead_lettered_at end,claimed_until=null,lease_token=null,failure_stage=case when p_disposition='success' then null when p_error in('load','render','preview','classifier') then p_error else 'load' end,next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^greatest(attempts-1,0)))),updated_at=now() where proof_id=p_id::uuid and status='claimed' and lease_token=p_lease_token and attempts=p_attempt;get diagnostics n=row_count;if n=1 and p_disposition='retryable' and (select attempts>=5 from private.payment_proof_processing_queue where proof_id=p_id::uuid) then update public.payment_proofs set status=case when status in('received','processing') then 'review' else status end,updated_at=now() where id=p_id::uuid;end if;return n=1;end if;
 if p_kind='purge' then update public.payment_proofs set status=case when p_disposition='success' then 'purged' else 'quarantined' end,preview_storage_key=case when p_disposition='success' then null else preview_storage_key end,purge_lease_token=null,purge_claimed_until=null,updated_at=now(),purge_after=case when p_disposition='success' then purge_after else now()+interval '1 hour' end where id=p_id::uuid and status='purging' and purge_lease_token=p_lease_token and purge_attempt=p_attempt;get diagnostics n=row_count;if n=1 then insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason) values(p_id::uuid,case when p_disposition='success' then 'purged' else 'purge_failed' end,'worker','purging',case when p_disposition='success' then 'purged' else 'quarantined' end,case when p_disposition='success' then null else 'storage_delete_failed' end);end if;return n=1;end if;return false;
end $$;

revoke all on function public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid,uuid),public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text),public.claim_payment_proof_maintenance(integer,text),public.complete_payment_proof_maintenance(text,text,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid,uuid),public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text),public.claim_payment_proof_maintenance(integer,text),public.complete_payment_proof_maintenance(text,text,text,text,uuid,integer) to service_role;
