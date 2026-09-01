create table public.payment_proof_hash_tombstones(
 sha256 text primary key check(sha256~'^[0-9a-f]{64}$'),canonical_proof_id uuid not null references public.payment_proofs(id) on delete restrict,created_at timestamptz not null default now()
);
create table public.payment_proof_outbox(
 id bigint generated always as identity primary key,proof_id uuid not null references public.payment_proofs(id) on delete restrict,event_type text not null,
 channel text not null check(channel in('web','telegram','whatsapp')),payload jsonb not null default '{}' check(jsonb_typeof(payload)='object'),created_at timestamptz not null default now(),unique (proof_id, event_type)
);
alter table public.payment_proof_hash_tombstones enable row level security; alter table public.payment_proof_outbox enable row level security;
revoke all on public.payment_proof_hash_tombstones,public.payment_proof_outbox from public,anon,authenticated;
grant select on public.payment_proof_outbox to authenticated;
create policy payment_proof_outbox_staff_read on public.payment_proof_outbox for select to authenticated using(exists(select 1 from public.perfis p where p.id=auth.uid() and p.ativo and p.funcao in('admin','supervisor','vendedor')));

create function public.register_payment_proof_hash(p_proof_id uuid,p_sha256 text) returns table(canonical_proof_id uuid,duplicate boolean)
language plpgsql security definer set search_path='' as $$ declare v uuid;v_proof public.payment_proofs%rowtype; begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_sha256!~'^[0-9a-f]{64}$' then raise exception using errcode='22023',message='PAYMENT_PROOF_HASH_INVALID';end if;
 select * into v_proof from public.payment_proofs where id=p_proof_id for update; if not found then raise exception using message='PAYMENT_PROOF_NOT_FOUND';end if;
 insert into public.payment_proof_hash_tombstones(sha256,canonical_proof_id) values(p_sha256,p_proof_id) on conflict do nothing;
 select t.canonical_proof_id into v from public.payment_proof_hash_tombstones t where t.sha256=p_sha256;
 update public.payment_proofs set sha256=p_sha256,status=case when v=p_proof_id then status else 'duplicate' end,updated_at=now() where id=p_proof_id;
 if v<>p_proof_id then
  insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status) values(p_proof_id,'duplicate_detected','worker',v_proof.status,'duplicate');
  insert into public.payment_proof_outbox(proof_id,event_type,channel,payload) values(p_proof_id,'payment_proof_duplicate',v_proof.channel,jsonb_build_object('message_key','payment_proof_already_received')) on conflict do nothing;
 end if; return query select v,v<>p_proof_id;
end $$;

create function public.quarantine_payment_proof(p_proof_id uuid,p_reason text) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;v_deadline timestamptz:=now() + interval '10 days';begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 select * into v from public.payment_proofs where id=p_proof_id for update;
 update public.payment_proofs set status='quarantined',quarantined_at=now(),purge_after=v_deadline,updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason) values(p_proof_id,'quarantined','worker',v.status,'quarantined',p_reason);
 insert into public.payment_proof_outbox(proof_id,event_type,channel,payload) values(p_proof_id,'payment_proof_rejected',v.channel,jsonb_build_object('message_key','payment_proof_under_review')) on conflict do nothing;
 return v_deadline;end $$;

create function public.restore_payment_proof(p_proof_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;begin
 if auth.uid() is null or not exists(select 1 from public.perfis p where p.id=auth.uid() and p.ativo and p.funcao='admin') then raise exception using errcode='42501',message='PAYMENT_PROOF_ADMIN_REQUIRED';end if;
 select * into v from public.payment_proofs where id=p_proof_id for update;
 if v.status<>'quarantined' or v.purge_after<=now() then raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_RESTORABLE';end if;
 update public.payment_proofs set status='review',quarantined_at=null,purge_after=null,updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,actor_id,source,previous_status,result_status,reason) values(p_proof_id,'restored',auth.uid(),'operator','quarantined','review',p_reason);
 insert into public.payment_proof_outbox(proof_id,event_type,channel,payload) values(p_proof_id,'payment_proof_restored',v.channel,jsonb_build_object('message_key','payment_proof_restored_under_review')) on conflict do nothing;return true;end $$;
revoke all on function public.register_payment_proof_hash(uuid,text),public.quarantine_payment_proof(uuid,text),public.restore_payment_proof(uuid,text) from public,anon,authenticated;
grant execute on function public.register_payment_proof_hash(uuid,text),public.quarantine_payment_proof(uuid,text) to service_role;
grant execute on function public.restore_payment_proof(uuid,text) to authenticated;
