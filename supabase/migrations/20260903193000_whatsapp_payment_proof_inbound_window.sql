-- Canonical WhatsApp PDF admission is authoritative inbound-window evidence.
-- Replays and rejected/conflicting deliveries must never reopen the customer window.
create or replace function public.admit_and_enqueue_payment_proof(
 p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,p_storage_key text,
 p_size_bytes bigint,p_mime_type text,p_order_id uuid,p_conversation_id uuid,p_sha256 text
) returns table(proof_id uuid,status text,idempotent boolean,canonical_proof_id uuid,duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare a record;v public.payment_proofs%rowtype;v_canonical uuid;v_customer public.clientes%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.admit_payment_proof_intake(p_channel,p_delivery_key,p_customer_id,p_sender_reference,p_storage_key,p_size_bytes,p_mime_type,p_order_id,p_conversation_id,p_sha256);
 select * into v from public.payment_proofs where id=a.proof_id for update;
 if not a.idempotent and p_channel='whatsapp' then
  select c.* into v_customer from public.clientes c join public.conversas conversation on conversation.cliente_id=c.id where c.id=p_customer_id and conversation.id=v.conversation_id for update of c;
  if not found or v_customer.id<>v.customer_id then raise exception using errcode='23514',message='PAYMENT_PROOF_CONVERSATION_CUSTOMER_MISMATCH';end if;
  update public.clientes set ultima_interacao_recebida_em=now(),data_atualizacao=now() where id=v_customer.id;
 end if;
 select tombstone.canonical_proof_id into v_canonical from public.payment_proof_hash_tombstones tombstone where tombstone.sha256=p_sha256;
 if v_canonical is distinct from v.id and v.status<>'duplicate' then
  update public.payment_proofs set status='duplicate',updated_at=now() where id=v.id;
  insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status) values(v.id,'duplicate_detected','worker',v.status,'duplicate');
  insert into public.payment_proof_outbox(proof_id,conversation_id,event_type,channel,payload) values(v.id,v.conversation_id,'payment_proof_duplicate',v.channel,jsonb_build_object('message_key','payment_proof_already_received')) on conflict do nothing;
 end if;
 if v_canonical=v.id then perform public.enqueue_payment_proof_processing(v.id);end if;
 return query select v.id,(select p.status from public.payment_proofs p where p.id=v.id),a.idempotent,v_canonical,v_canonical is distinct from v.id;
end $$;

revoke all on function public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text) to service_role;
