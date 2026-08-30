create table public.payment_proof_advisory_attempts(
 proof_id uuid not null references public.payment_proofs(id) on delete restrict,
 attempt_key text not null, event_id bigint not null references public.payment_proof_events(id) on delete restrict,
 payload_fingerprint text not null check(payload_fingerprint~'^[0-9a-f]{64}$'),
 primary key(proof_id,attempt_key)
);
alter table public.payment_proof_advisory_attempts enable row level security;
revoke all on public.payment_proof_advisory_attempts from public,anon,authenticated;

create function public.record_payment_proof_advisory(
 p_proof_id uuid,p_attempt_key text,p_disposition text,p_likely boolean,p_confidence numeric,
 p_suggested_cents integer,p_reason_code text,p_model text
) returns bigint language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;v_event bigint;v_existing public.payment_proof_advisory_attempts%rowtype;
 v_hash text:=encode(extensions.digest(concat_ws('|',p_disposition,p_likely,p_confidence,p_suggested_cents,p_reason_code,p_model),'sha256'),'hex');
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if nullif(btrim(p_attempt_key),'') is null or p_disposition not in('accepted','rejected','manual_review')
  or p_confidence<0 or p_confidence>1 or p_reason_code not in(
   'payment_markers_present','not_payment_proof','low_signal','provider_unavailable','invalid_provider_output')
  or nullif(btrim(p_model),'') is null then raise exception using errcode='22023',message='PAYMENT_PROOF_ADVISORY_INVALID';end if;
 select * into v from public.payment_proofs where id=p_proof_id for update;
 if not found then raise exception using message='PAYMENT_PROOF_NOT_FOUND';end if;
 select * into v_existing from public.payment_proof_advisory_attempts
  where proof_id=p_proof_id and attempt_key=btrim(p_attempt_key);
 if found then
  if v_existing.payload_fingerprint<>v_hash then raise exception using errcode='23505',message='PAYMENT_PROOF_ADVISORY_CONFLICT';end if;
  return v_existing.event_id;
 end if;
 update public.payment_proofs set status='review',suggested_cents=p_suggested_cents,
  extraction_confidence=p_confidence,updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason,metadata)
 values(p_proof_id,'advisory_extracted','worker',v.status,'review',p_reason_code,
  jsonb_build_object('disposition',p_disposition,'likely_payment_proof',p_likely,'confidence',p_confidence,
   'suggested_amount_cents',p_suggested_cents,'model',p_model)) returning id into v_event;
 insert into public.payment_proof_advisory_attempts values(p_proof_id,btrim(p_attempt_key),v_event,v_hash);
 if p_disposition='rejected' then
  perform public.quarantine_payment_proof(p_proof_id,p_reason_code);
 end if;
 return v_event;
end $$;
revoke all on function public.record_payment_proof_advisory(uuid,text,text,boolean,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function public.record_payment_proof_advisory(uuid,text,text,boolean,numeric,integer,text,text) to service_role;
