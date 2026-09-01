create table public.payment_proof_render_attempts(
 proof_id uuid not null references public.payment_proofs(id) on delete restrict,
 render_key text not null,event_id bigint not null references public.payment_proof_events(id) on delete restrict,
 payload_fingerprint text not null check(payload_fingerprint~'^[0-9a-f]{64}$'),
 primary key(proof_id,render_key)
);
alter table public.payment_proof_render_attempts enable row level security;
revoke all on public.payment_proof_render_attempts from public,anon,authenticated;

create function public.record_payment_proof_render(
 p_proof_id uuid,p_render_key text,p_storage_key text,p_sha256 text,p_width integer,p_height integer,p_version text
) returns bigint language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;v_event bigint;v_existing public.payment_proof_render_attempts%rowtype;
 v_hash text:=encode(extensions.digest(concat_ws('|',p_storage_key,p_sha256,p_width,p_height,p_version),'sha256'),'hex');
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if nullif(btrim(p_render_key),'') is null or p_storage_key not like 'proofs/private/%.png' or p_storage_key like '%..%'
  or p_sha256!~'^[0-9a-f]{64}$' or p_width<1 or p_width>1200 or p_height<1 or p_height>4800
  or nullif(btrim(p_version),'') is null then raise exception using errcode='22023',message='PAYMENT_PROOF_RENDER_INVALID';end if;
 select * into v from public.payment_proofs where id=p_proof_id for update;
 if not found then raise exception using message='PAYMENT_PROOF_NOT_FOUND';end if;
 select * into v_existing from public.payment_proof_render_attempts
  where proof_id=p_proof_id and render_key=btrim(p_render_key);
 if found then
  if v_existing.payload_fingerprint<>v_hash then raise exception using errcode='23505',message='PAYMENT_PROOF_RENDER_CONFLICT';end if;
  return v_existing.event_id;
 end if;
 update public.payment_proofs set preview_storage_key=p_storage_key,updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,metadata)
 values(p_proof_id,'preview_rendered','worker',v.status,v.status,
  jsonb_build_object('sha256',p_sha256,'width',p_width,'height',p_height,'render_version',p_version))
 returning id into v_event;
 insert into public.payment_proof_render_attempts values(p_proof_id,btrim(p_render_key),v_event,v_hash);
 return v_event;
end $$;
revoke all on function public.record_payment_proof_render(uuid,text,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.record_payment_proof_render(uuid,text,text,text,integer,integer,text) to service_role;
