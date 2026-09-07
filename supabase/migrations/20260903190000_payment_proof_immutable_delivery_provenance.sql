-- A provider delivery is immutable: its canonical destination, object provenance, and
-- content hash must agree on every replay before any hash or queue side effect occurs.
drop function if exists public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid,uuid);
drop function if exists public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid,uuid,text);
drop function if exists public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text);

create function public.admit_payment_proof_intake(
 p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,p_storage_key text,
 p_size_bytes bigint,p_mime_type text,p_order_id uuid,p_conversation_id uuid,p_sha256 text
) returns table(proof_id uuid,status text,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;v_order public.pedidos%rowtype;v_conversation public.conversas%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='PAYMENT_PROOF_HASH_INVALID';end if;
 -- Serialize first delivery creation and lock every existing delivery before
 -- validating mutable request fields, so replays are provenance-atomic.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-proof-delivery:' || coalesce(p_channel,'') || ':' || coalesce(btrim(p_delivery_key),''), 0));
 select * into v from public.payment_proofs where channel=p_channel and delivery_key=btrim(p_delivery_key) for update;
 if found then
  if v.customer_id is distinct from p_customer_id or v.conversation_id is distinct from p_conversation_id or v.original_storage_key is distinct from btrim(p_storage_key) or v.size_bytes is distinct from p_size_bytes or v.mime_type is distinct from p_mime_type or v.sender_reference is distinct from nullif(btrim(p_sender_reference),'') or v.sha256 is distinct from p_sha256 or not ((p_order_id is null and not exists(select 1 from public.payment_proof_order_intents intent where intent.proof_id=v.id)) or (p_order_id is not null and exists(select 1 from public.payment_proof_order_intents intent where intent.proof_id=v.id and intent.pedido_id=p_order_id) and not exists(select 1 from public.payment_proof_order_intents intent where intent.proof_id=v.id and intent.pedido_id<>p_order_id))) then raise exception using errcode='23505',message='PAYMENT_PROOF_DELIVERY_CONFLICT';end if;
  return query select v.id,v.status,true;return;
 end if;
 if p_channel not in('web','telegram','whatsapp') or nullif(btrim(p_delivery_key),'') is null or nullif(btrim(p_storage_key),'') is null or p_mime_type<>'application/pdf' or p_size_bytes<5 or p_size_bytes>5242880 then raise exception using errcode='22023',message='PAYMENT_PROOF_INTAKE_INVALID';end if;
 if p_channel='web' and p_order_id is null then raise exception using errcode='22023',message='PAYMENT_PROOF_ORDER_REQUIRED';end if;
 if p_conversation_id is null then raise exception using errcode='22023',message='PAYMENT_PROOF_CONVERSATION_REQUIRED';end if;
 if p_order_id is not null then
  select * into v_order from public.pedidos where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO';end if;
  if p_customer_id is null or v_order.cliente_id<>p_customer_id then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH';end if;
  if v_order.status='cancelado' or v_order.status_pagamento<>'pendente' then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_INELIGIBLE';end if;
 end if;
 select * into v_conversation from public.conversas where id=p_conversation_id for update;
 if not found or p_customer_id is null or v_conversation.cliente_id<>p_customer_id then raise exception using errcode='23514',message='PAYMENT_PROOF_CONVERSATION_CUSTOMER_MISMATCH';end if;
 if p_order_id is not null and public.is_order_payment_proof_locked(p_order_id) then raise exception using errcode='23514',message='ORDER_PAYMENT_PROOF_ALREADY_PENDING';end if;
 insert into public.payment_proofs(customer_id,conversation_id,channel,delivery_key,sender_reference,status,original_storage_key,mime_type,size_bytes,sha256)
 values(p_customer_id,p_conversation_id,p_channel,btrim(p_delivery_key),nullif(btrim(p_sender_reference),''),case when p_customer_id is null then 'identity_pending' else 'received' end,btrim(p_storage_key),p_mime_type,p_size_bytes,p_sha256) returning * into v;
 insert into public.payment_proof_hash_tombstones(sha256,canonical_proof_id) values(p_sha256,v.id) on conflict do nothing;
 if p_order_id is not null then insert into public.payment_proof_order_intents(proof_id,pedido_id) values(v.id,p_order_id);end if;
 insert into public.payment_proof_events(proof_id,event_type,source,result_status,metadata) values(v.id,'intake_received',p_channel,v.status,jsonb_build_object('identity_resolved',p_customer_id is not null,'requested_order_id',p_order_id));
 return query select v.id,v.status,false;
end $$;

-- Preserve the former intake signature without retaining a hash-bypass admission path.
create function public.admit_payment_proof_intake(
 p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,p_storage_key text,
 p_size_bytes bigint,p_mime_type text,p_order_id uuid,p_conversation_id uuid
) returns table(proof_id uuid,status text,idempotent boolean)
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 raise exception using errcode='22023',message='PAYMENT_PROOF_HASH_REQUIRED';
end $$;

create function public.admit_and_enqueue_payment_proof(
 p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,p_storage_key text,
 p_size_bytes bigint,p_mime_type text,p_order_id uuid,p_conversation_id uuid,p_sha256 text
) returns table(proof_id uuid,status text,idempotent boolean,canonical_proof_id uuid,duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare a record;v public.payment_proofs%rowtype;v_canonical uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.admit_payment_proof_intake(p_channel,p_delivery_key,p_customer_id,p_sender_reference,p_storage_key,p_size_bytes,p_mime_type,p_order_id,p_conversation_id,p_sha256);
 select * into v from public.payment_proofs where id=a.proof_id for update;
 select tombstone.canonical_proof_id into v_canonical from public.payment_proof_hash_tombstones tombstone where tombstone.sha256=p_sha256;
 if v_canonical is distinct from v.id and v.status<>'duplicate' then
  update public.payment_proofs set status='duplicate',updated_at=now() where id=v.id;
  insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status) values(v.id,'duplicate_detected','worker',v.status,'duplicate');
  insert into public.payment_proof_outbox(proof_id,conversation_id,event_type,channel,payload) values(v.id,v.conversation_id,'payment_proof_duplicate',v.channel,jsonb_build_object('message_key','payment_proof_already_received')) on conflict do nothing;
 end if;
 if v_canonical=v.id then perform public.enqueue_payment_proof_processing(v.id);end if;
 return query select v.id,(select p.status from public.payment_proofs p where p.id=v.id),a.idempotent,v_canonical,v_canonical is distinct from v.id;
end $$;

revoke all on function public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid,uuid),public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid,uuid,text),public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid,uuid),public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid,uuid,text),public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text) to service_role;
