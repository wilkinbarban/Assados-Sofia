-- Dual-mode administrative user deletion. Normal deletion preserves non-personal
-- ledgers; a total purge is an explicit, durable job whose Storage manifest is
-- completed before any relational or Auth mutation.

create table public.user_storage_ownership (
  bucket_id text not null,
  object_path text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bucket_id, object_path)
);
revoke all on public.user_storage_ownership from public, anon, authenticated;

-- New user-owned uploads are indexed atomically by Storage metadata. Legacy
-- rows with no owner are intentionally not attributed and remain reconciliation candidates.
create or replace function public.index_user_owned_storage_object() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.bucket_id in ('chat-midias','payment-proofs') and new.owner is not null then
    insert into public.user_storage_ownership(bucket_id,object_path,owner_id)
    values(new.bucket_id,new.name,new.owner)
    on conflict(bucket_id,object_path) do update set owner_id=excluded.owner_id;
  end if;
  return new;
end $$;
drop trigger if exists user_storage_ownership_after_insert on storage.objects;
create trigger user_storage_ownership_after_insert after insert on storage.objects
for each row execute function public.index_user_owned_storage_object();

create table public.admin_user_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  mode text not null check(mode in ('normal','purge')),
  status text not null check(status in ('storage_pending','sql_pending','auth_pending','completed','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  unique(target_user_id,mode)
);
create table public.admin_user_deletion_storage_manifest (
  job_id uuid not null references public.admin_user_deletion_jobs(id) on delete cascade,
  bucket_id text not null, object_path text not null,
  deleted_at timestamptz, last_error text,
  primary key(job_id,bucket_id,object_path)
);
revoke all on public.admin_user_deletion_jobs,public.admin_user_deletion_storage_manifest from public,anon,authenticated;

-- Tombstones are global replay identities, never personal content. Detach the
-- deleted proof rather than deleting the SHA-256 identity.
alter table public.payment_proof_hash_tombstones drop constraint if exists payment_proof_hash_tombstones_canonical_proof_id_fkey;
alter table public.payment_proof_hash_tombstones alter column canonical_proof_id drop not null;
alter table public.payment_proof_hash_tombstones add constraint payment_proof_hash_tombstones_canonical_proof_id_fkey foreign key(canonical_proof_id) references public.payment_proofs(id) on delete set null;

create or replace function public.iniciar_purga_total_usuario_admin(p_usuario_alvo_id uuid)
returns table(job_id uuid,bucket_id text,object_path text)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.perfis%rowtype; remaining_admins integer; job public.admin_user_deletion_jobs%rowtype;
begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 if actor=p_usuario_alvo_id then raise exception using errcode='42501',message='ANTI_LOCKOUT_AUTO_EXCLUSAO'; end if;
 select * into target from public.perfis where id=p_usuario_alvo_id for update;
 if not found then raise exception using errcode='P0002',message='PERFIL_ALVO_NAO_ENCONTRADO'; end if;
 if target.funcao='admin' and target.ativo then select count(*) into remaining_admins from public.perfis where funcao='admin' and ativo and id<>p_usuario_alvo_id for update; if remaining_admins=0 then raise exception using errcode='42501',message='MINIMO_UM_ADMIN_ATIVO'; end if; end if;
 insert into public.admin_user_deletion_jobs(target_user_id,actor_id,mode,status) values(p_usuario_alvo_id,actor,'purge','storage_pending')
 on conflict(target_user_id,mode) do update set updated_at=now(),attempts=public.admin_user_deletion_jobs.attempts+1,last_error=null where public.admin_user_deletion_jobs.status<>'completed' returning * into job;
 if not found then select * into job from public.admin_user_deletion_jobs where target_user_id=p_usuario_alvo_id and mode='purge'; end if;
 insert into public.admin_user_deletion_storage_manifest(job_id,bucket_id,object_path)
 select job.id,bucket_id,object_path from public.user_storage_ownership where owner_id=p_usuario_alvo_id on conflict do nothing;
 return query select m.job_id,m.bucket_id,m.object_path from public.admin_user_deletion_storage_manifest m where m.job_id=job.id and m.deleted_at is null order by m.bucket_id,m.object_path;
end $$;

create or replace function public.registrar_storage_purga_usuario_admin(p_job_id uuid,p_bucket_id text,p_object_path text,p_sucesso boolean,p_erro text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 update public.admin_user_deletion_storage_manifest m set deleted_at=case when p_sucesso then now() else null end,last_error=case when p_sucesso then null else coalesce(nullif(p_erro,''),'STORAGE_DELETE_FAILED') end
 from public.admin_user_deletion_jobs j where m.job_id=p_job_id and m.job_id=j.id and j.actor_id=actor and m.bucket_id=p_bucket_id and m.object_path=p_object_path;
 if not found then return false; end if;
 if not p_sucesso then update public.admin_user_deletion_jobs set status='storage_pending',last_error='STORAGE_DELETE_FAILED',updated_at=now() where id=p_job_id; end if;
 return true;
end $$;

create or replace function public.executar_sql_purga_total_usuario_admin(p_job_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); job public.admin_user_deletion_jobs%rowtype; cid uuid; ids uuid[];
begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 select * into job from public.admin_user_deletion_jobs where id=p_job_id and actor_id=actor and mode='purge' for update;
 if not found then raise exception using errcode='P0002',message='PURGA_NAO_ENCONTRADA'; end if;
 if exists(select 1 from public.admin_user_deletion_storage_manifest where job_id=job.id and deleted_at is null) then raise exception using errcode='55000',message='STORAGE_PURGE_PENDENTE'; end if;
 if job.status='completed' then return job.target_user_id; end if;
 select array_agg(id) into ids from public.clientes where usuario_id=job.target_user_id for update;
 if ids is not null then
   perform set_config('app.total_user_purge','on',true);
   -- Delete only target-derived rows; global hash tombstones remain, detached.
   delete from public.payment_proof_legacy_backfills where canonical_payment_proof_id in(select id from public.payment_proofs where customer_id=any(ids)) or duplicate_payment_proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   update public.payment_proof_hash_tombstones set canonical_proof_id=null where canonical_proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_outbox where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_advisory_attempts where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_render_attempts where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_order_links where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_reconciliations where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_chat_projections where proof_id in(select id from public.payment_proofs where customer_id=any(ids)) or conversa_id in(select id from public.conversas where cliente_id=any(ids));
   delete from public.mensagens where conversa_id in(select id from public.conversas where cliente_id=any(ids)) or payment_proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_events where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proofs where customer_id=any(ids);
   delete from public.comprovantes where cliente_id=any(ids);
   delete from public.itens_carrinho where carrinho_id in(select id from public.carrinhos where cliente_id=any(ids));
   delete from public.carrinhos where cliente_id=any(ids);
   delete from public.itens_pedido where pedido_id in(select id from public.pedidos where cliente_id=any(ids));
   delete from public.pedido_estoque_efeitos where pedido_id in(select id from public.pedidos where cliente_id=any(ids));
   delete from public.pedido_estoque_snapshots where pedido_id in(select id from public.pedidos where cliente_id=any(ids));
   delete from public.pedido_lifecycle_events where pedido_id in(select id from public.pedidos where cliente_id=any(ids));
   delete from public.pedido_payment_events where pedido_id in(select id from public.pedidos where cliente_id=any(ids));
   delete from public.comprovantes_venda where cliente_id=any(ids) or pedido_id in(select id from public.pedidos where cliente_id=any(ids));
   delete from public.manual_external_payment_order_links where pedido_id in(select id from public.pedidos where cliente_id=any(ids));
   delete from public.movimentacoes_estoque where pedido_id in(select id from public.pedidos where cliente_id=any(ids)) or usuario_id=job.target_user_id;
   delete from public.pedidos where cliente_id=any(ids);
   delete from public.conversas where cliente_id=any(ids);
   delete from public.clientes where id=any(ids);
 end if;
 delete from public.codigos_verificacao where usuario_id=job.target_user_id;
 delete from public.user_storage_ownership where owner_id=job.target_user_id;
 delete from public.perfis where id=job.target_user_id;
 insert into public.logs_auditoria(usuario_id,acao,detalhes) values(actor,'purga_total_usuario',jsonb_build_object('job_id',job.id,'mode','purge'));
 update public.admin_user_deletion_jobs set status='auth_pending',last_error=null,updated_at=now() where id=job.id;
 return job.target_user_id;
end $$;

create or replace function public.concluir_purga_total_usuario_admin(p_job_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 update public.admin_user_deletion_jobs set status='completed',completed_at=now(),last_error=null,updated_at=now() where id=p_job_id and actor_id=actor and status in('auth_pending','completed'); return found;
end $$;
revoke all on function public.iniciar_purga_total_usuario_admin(uuid),public.registrar_storage_purga_usuario_admin(uuid,text,text,boolean,text),public.executar_sql_purga_total_usuario_admin(uuid),public.concluir_purga_total_usuario_admin(uuid) from public,anon,service_role;
grant execute on function public.iniciar_purga_total_usuario_admin(uuid),public.registrar_storage_purga_usuario_admin(uuid,text,text,boolean,text),public.executar_sql_purga_total_usuario_admin(uuid),public.concluir_purga_total_usuario_admin(uuid) to authenticated;


-- Canonical payment-proof intake is owned by the authenticated customer when
-- present. The corresponding Storage key is now purgeable without guessing.
create or replace function public.index_payment_proof_storage_owner() returns trigger
language plpgsql security definer set search_path='' as $$
declare user_id uuid;
begin
  select usuario_id into user_id from public.clientes where id=new.customer_id;
  if user_id is not null then
    insert into public.user_storage_ownership(bucket_id,object_path,owner_id)
    values('payment-proofs',new.original_storage_key,user_id)
    on conflict(bucket_id,object_path) do update set owner_id=excluded.owner_id;
  end if;
  return new;
end $$;
drop trigger if exists payment_proof_storage_owner_after_insert on public.payment_proofs;
create trigger payment_proof_storage_owner_after_insert after insert on public.payment_proofs
for each row execute function public.index_payment_proof_storage_owner();

-- The immutable event ledger is never rewritten; deletion of an entire test
-- account is the only narrow transaction that may remove its target-derived
-- rows. The transaction-local flag cannot be set by a caller outside the RPC.
create or replace function public.block_payment_proof_event_mutation() returns trigger
language plpgsql set search_path='' as $$ begin
  if current_setting('app.total_user_purge', true) = 'on' then return old; end if;
  raise exception using errcode='42501', message='PAYMENT_PROOF_EVENT_IMMUTABLE';
end $$;
