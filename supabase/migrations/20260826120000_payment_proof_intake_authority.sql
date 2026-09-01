-- Service-only intake authority. Hash deduplication is intentionally deferred.
create or replace function public.admit_payment_proof_intake(
 p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,
 p_storage_key text,p_size_bytes bigint,p_mime_type text
) returns table(proof_id uuid,status text,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED'; end if;
 if p_channel not in ('web','telegram','whatsapp') or nullif(btrim(p_delivery_key),'') is null or nullif(btrim(p_storage_key),'') is null
   or p_mime_type<>'application/pdf' or p_size_bytes<5 or p_size_bytes>5242880 then
   raise exception using errcode='22023',message='PAYMENT_PROOF_INTAKE_INVALID';
 end if;
 select * into v from public.payment_proofs where channel=p_channel and delivery_key=btrim(p_delivery_key) for update;
 if found then
   if v.customer_id is distinct from p_customer_id or v.original_storage_key<>btrim(p_storage_key) or v.size_bytes<>p_size_bytes then
    raise exception using errcode='23505',message='PAYMENT_PROOF_DELIVERY_CONFLICT';
   end if;
   return query select v.id,v.status,true; return;
 end if;
 insert into public.payment_proofs(customer_id,channel,delivery_key,sender_reference,status,original_storage_key,mime_type,size_bytes)
 values(p_customer_id,p_channel,btrim(p_delivery_key),nullif(btrim(p_sender_reference),''),case when p_customer_id is null then 'identity_pending' else 'received' end,btrim(p_storage_key),p_mime_type,p_size_bytes)
 returning * into v;
 insert into public.payment_proof_events(proof_id,event_type,source,result_status,metadata)
 values(v.id,'intake_received',p_channel,v.status,jsonb_build_object('identity_resolved',p_customer_id is not null));
 return query select v.id,v.status,false;
end $$;
revoke all on function public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text) to service_role;
