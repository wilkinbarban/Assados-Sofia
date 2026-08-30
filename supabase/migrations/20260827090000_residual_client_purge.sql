-- Purges only the residual data of an already-anonymized client.  Unlike the
-- account purge, this workflow never touches Auth or perfis.
create table public.residual_client_purge_jobs(
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null unique references public.clientes(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 status text not null check(status in('storage_pending','sql_pending','completed','failed')),
 last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create table public.residual_client_purge_manifest(
 job_id uuid not null references public.residual_client_purge_jobs(id) on delete cascade,
 bucket_id text not null, object_path text not null, deleted_at timestamptz, last_error text,
 primary key(job_id,bucket_id,object_path)
);
revoke all on public.residual_client_purge_jobs,public.residual_client_purge_manifest from public,anon,authenticated;

create function public.iniciar_purga_residual_cliente_admin(p_cliente_id uuid)
returns table(job_id uuid,bucket_id text,object_path text) language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); c public.clientes%rowtype; j public.residual_client_purge_jobs%rowtype;
begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;
 select * into c from public.clientes where id=p_cliente_id for update;
 if not found then raise exception using errcode='P0002',message='CLIENTE_NAO_ENCONTRADO';end if;
 if c.usuario_id is not null or c.nome<>'Deleted customer' then raise exception using errcode='42501',message='EVIDENCIA_DE_ANONIMIZACAO_AUSENTE';end if;
 insert into public.residual_client_purge_jobs(client_id,actor_id,status) values(p_cliente_id,actor,'storage_pending')
 on conflict(client_id) do update set actor_id=excluded.actor_id,updated_at=now(),last_error=null where public.residual_client_purge_jobs.status<>'completed' returning * into j;
 if not found then select * into j from public.residual_client_purge_jobs where client_id=p_cliente_id;end if;
 insert into public.residual_client_purge_manifest(job_id,bucket_id,object_path)
 select j.id,'payment-proofs',k from public.payment_proofs p cross join lateral unnest(array[p.original_storage_key,p.preview_storage_key]) k where p.customer_id=p_cliente_id and k is not null
 union
 select j.id,'chat-midias',c.url_arquivo from public.comprovantes c where c.cliente_id=p_cliente_id and c.url_arquivo is not null
 on conflict do nothing;
 return query select m.job_id,m.bucket_id,m.object_path from public.residual_client_purge_manifest m where m.job_id=j.id and m.deleted_at is null order by m.bucket_id,m.object_path;
end$$;

create function public.registrar_storage_purga_residual_cliente_admin(p_job_id uuid,p_bucket_id text,p_object_path text,p_sucesso boolean,p_erro text default null)
returns boolean language plpgsql security definer set search_path='' as $$declare actor uuid:=auth.uid();begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;
 update public.residual_client_purge_manifest m set deleted_at=case when p_sucesso then now() else null end,last_error=case when p_sucesso then null else coalesce(nullif(p_erro,''),'STORAGE_DELETE_FAILED') end from public.residual_client_purge_jobs j where j.id=m.job_id and j.id=p_job_id and j.actor_id=actor and m.bucket_id=p_bucket_id and m.object_path=p_object_path;
 if not found then return false;end if;
 if not p_sucesso then update public.residual_client_purge_jobs set status='storage_pending',last_error='STORAGE_DELETE_FAILED',updated_at=now() where id=p_job_id;end if;return true;
end$$;

create function public.executar_purga_residual_cliente_admin(p_job_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();j public.residual_client_purge_jobs%rowtype;cid uuid;begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;
 select * into j from public.residual_client_purge_jobs where id=p_job_id and actor_id=actor for update;if not found then raise exception using errcode='P0002',message='PURGA_NAO_ENCONTRADA';end if;
 if exists(select 1 from public.residual_client_purge_manifest where job_id=j.id and deleted_at is null) then raise exception using errcode='55000',message='STORAGE_PURGE_PENDENTE';end if;
 if j.status='completed' then return j.client_id;end if;cid:=j.client_id;perform set_config('app.total_user_purge','on',true);
 delete from public.payment_proof_legacy_backfills where canonical_payment_proof_id in(select id from public.payment_proofs where customer_id=cid) or duplicate_payment_proof_id in(select id from public.payment_proofs where customer_id=cid);
 update public.payment_proof_hash_tombstones set canonical_proof_id=null where canonical_proof_id in(select id from public.payment_proofs where customer_id=cid);
 delete from public.payment_proof_outbox where proof_id in(select id from public.payment_proofs where customer_id=cid);
 delete from public.payment_proof_advisory_attempts where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_render_attempts where proof_id in(select id from public.payment_proofs where customer_id=cid);
 delete from public.payment_proof_order_links where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_reconciliations where proof_id in(select id from public.payment_proofs where customer_id=cid);
 delete from public.payment_proof_chat_projections where proof_id in(select id from public.payment_proofs where customer_id=cid) or conversa_id in(select id from public.conversas where cliente_id=cid);
 delete from public.mensagens where conversa_id in(select id from public.conversas where cliente_id=cid) or payment_proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_events where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proofs where customer_id=cid;
 delete from public.comprovantes where cliente_id=cid;delete from public.itens_carrinho where carrinho_id in(select id from public.carrinhos where cliente_id=cid);delete from public.carrinhos where cliente_id=cid;delete from public.itens_pedido where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_estoque_efeitos where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_estoque_snapshots where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_lifecycle_events where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_payment_events where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.comprovantes_venda where cliente_id=cid or pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.manual_external_payment_order_links where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.movimentacoes_estoque where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedidos where cliente_id=cid;delete from public.conversas where cliente_id=cid;delete from public.clientes where id=cid;
 insert into public.logs_auditoria(usuario_id,acao,detalhes)values(actor,'purga_residual_cliente',jsonb_build_object('job_id',j.id,'mode','residual'));update public.residual_client_purge_jobs set status='completed',completed_at=now(),last_error=null,updated_at=now() where id=j.id;return cid;
end$$;
revoke all on function public.iniciar_purga_residual_cliente_admin(uuid),public.registrar_storage_purga_residual_cliente_admin(uuid,text,text,boolean,text),public.executar_purga_residual_cliente_admin(uuid) from public,anon,service_role;
grant execute on function public.iniciar_purga_residual_cliente_admin(uuid),public.registrar_storage_purga_residual_cliente_admin(uuid,text,text,boolean,text),public.executar_purga_residual_cliente_admin(uuid) to authenticated;
