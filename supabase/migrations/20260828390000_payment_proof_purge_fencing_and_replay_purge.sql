-- Forward-only maintenance hardening: administrative purge owns every RESTRICT
-- replay request, and purge workers use the same token+attempt fence as queues.

alter table public.payment_proofs
 add column if not exists purge_lease_token uuid,
 add column if not exists purge_claimed_until timestamptz,
 add column if not exists purge_attempt integer not null default 0 check(purge_attempt >= 0);

create or replace function public.claim_payment_proof_maintenance(p_lease_seconds integer default 60,p_kind text default null) returns jsonb
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
 if p_kind is null or p_kind='purge' then
  select * into p from public.payment_proofs where (status='quarantined' and purge_after<=now()) or (status='purging' and purge_claimed_until<=now()) order by purge_after,id for update skip locked limit 1;
  if found then
   v_token:=gen_random_uuid();
   update public.payment_proofs set status='purging',purge_attempt=purge_attempt+1,purge_lease_token=v_token,purge_claimed_until=now()+make_interval(secs=>greatest(10,least(p_lease_seconds,300))),updated_at=now() where id=p.id returning * into p;
   return jsonb_build_object('kind','purge','id',p.id,'original_key',p.original_storage_key,'preview_key',p.preview_storage_key,'attempt',p.purge_attempt,'lease_token',p.purge_lease_token);
  end if;
 end if;
 return null;
end$$;

-- Remove every legacy callable completion signature before installing the fenced one.
drop function if exists public.complete_payment_proof_maintenance(text,text,boolean,text);
drop function if exists public.complete_payment_proof_maintenance(text,text,boolean,text,uuid,integer);

create function public.complete_payment_proof_maintenance(p_kind text,p_id text,p_success boolean,p_error text,p_lease_token uuid,p_attempt integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;v_proof public.payment_proofs%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';end if;
 if p_kind='processing' then
  select * into v_proof from public.payment_proofs where id=p_id::uuid;if p_success and (v_proof.preview_storage_key is null or v_proof.status not in('review','quarantined')) then return false;end if;
  update private.payment_proof_processing_queue set status=case when p_success then 'completed' when attempts>=5 then 'dead_letter' else 'pending' end,completed_at=case when p_success then now() else null end,dead_lettered_at=case when not p_success and attempts>=5 then now() else dead_lettered_at end,claimed_until=null,lease_token=null,failure_stage=case when p_success then null when p_error in('load','render','preview','classifier') then p_error else 'load' end,next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^greatest(attempts-1,0)))),updated_at=now() where proof_id=p_id::uuid and status='claimed' and lease_token=p_lease_token and attempts=p_attempt;get diagnostics n=row_count;
  if n=1 and not p_success and (select attempts>=5 from private.payment_proof_processing_queue where proof_id=p_id::uuid) then update public.payment_proofs set status=case when status in('received','processing') then 'review' else status end,updated_at=now() where id=p_id::uuid;end if;return n=1;
 end if;
 if p_kind='outbox' then update public.payment_proof_outbox set status=case when p_success then 'completed' when attempts>=5 then 'dead_letter' else 'pending' end,completed_at=case when p_success then now() else null end,dead_lettered_at=case when not p_success and attempts>=5 then now() else dead_lettered_at end,claimed_until=null,lease_token=null,last_error=case when p_success then null else 'operation_failed' end,next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^greatest(attempts-1,0)))) where id=p_id::bigint and status='claimed' and lease_token=p_lease_token and attempts=p_attempt;get diagnostics n=row_count;return n=1;end if;
 if p_kind='purge' then
  update public.payment_proofs set status=case when p_success then 'purged' else 'quarantined' end,preview_storage_key=case when p_success then null else preview_storage_key end,purge_lease_token=null,purge_claimed_until=null,updated_at=now(),purge_after=case when p_success then purge_after else now()+interval '1 hour' end where id=p_id::uuid and status='purging' and purge_lease_token=p_lease_token and purge_attempt=p_attempt;
  get diagnostics n=row_count;
  if n=1 then insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason)values(p_id::uuid,case when p_success then 'purged' else 'purge_failed' end,'worker','purging',case when p_success then 'purged' else 'quarantined' end,case when p_success then null else 'storage_delete_failed' end);end if;
  return n=1;
 end if;
 return false;
end$$;

create or replace function public.executar_sql_purga_total_usuario_admin(p_job_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); job public.admin_user_deletion_jobs%rowtype; cid uuid; ids uuid[];
begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 select * into job from public.admin_user_deletion_jobs where id=p_job_id and actor_id=actor and mode='purge' for update;
 if not found then raise exception using errcode='P0002',message='PURGA_NAO_ENCONTRADA'; end if;
 if exists(select 1 from public.admin_user_deletion_storage_manifest where job_id=job.id and deleted_at is null) then raise exception using errcode='55000',message='STORAGE_PURGE_PENDENTE'; end if;
 if job.status='completed' then return job.target_user_id; end if;
 perform 1 from public.clientes where usuario_id=job.target_user_id order by id for update;
 select array_agg(id) into ids from public.clientes where usuario_id=job.target_user_id;
 if ids is not null then
  perform set_config('app.total_user_purge','on',true);
  delete from private.payment_proof_dead_letter_replay_requests where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
  delete from public.payment_proof_legacy_backfills where canonical_payment_proof_id in(select id from public.payment_proofs where customer_id=any(ids)) or duplicate_payment_proof_id in(select id from public.payment_proofs where customer_id=any(ids));
  update public.payment_proof_hash_tombstones set canonical_proof_id=null where canonical_proof_id in(select id from public.payment_proofs where customer_id=any(ids));
  delete from public.payment_proof_outbox where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from public.payment_proof_advisory_attempts where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from public.payment_proof_render_attempts where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from public.payment_proof_order_links where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from public.payment_proof_reconciliations where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from public.payment_proof_order_intents where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from private.payment_proof_operational_failures where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from private.payment_proof_processing_queue where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from public.payment_proof_chat_projections where proof_id in(select id from public.payment_proofs where customer_id=any(ids)) or conversa_id in(select id from public.conversas where cliente_id=any(ids));delete from public.mensagens where conversa_id in(select id from public.conversas where cliente_id=any(ids)) or payment_proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from public.payment_proof_events where proof_id in(select id from public.payment_proofs where customer_id=any(ids));delete from public.payment_proofs where customer_id=any(ids);delete from public.comprovantes where cliente_id=any(ids);delete from public.itens_carrinho where carrinho_id in(select id from public.carrinhos where cliente_id=any(ids));delete from public.carrinhos where cliente_id=any(ids);delete from public.itens_pedido where pedido_id in(select id from public.pedidos where cliente_id=any(ids));delete from public.pedido_estoque_efeitos where pedido_id in(select id from public.pedidos where cliente_id=any(ids));delete from public.pedido_estoque_snapshots where pedido_id in(select id from public.pedidos where cliente_id=any(ids));delete from public.pedido_lifecycle_events where pedido_id in(select id from public.pedidos where cliente_id=any(ids));delete from public.pedido_payment_events where pedido_id in(select id from public.pedidos where cliente_id=any(ids));delete from public.comprovantes_venda where cliente_id=any(ids) or pedido_id in(select id from public.pedidos where cliente_id=any(ids));delete from public.manual_external_payment_order_links where pedido_id in(select id from public.pedidos where cliente_id=any(ids));delete from public.movimentacoes_estoque where pedido_id in(select id from public.pedidos where cliente_id=any(ids)) or usuario_id=job.target_user_id;delete from public.pedidos where cliente_id=any(ids);delete from public.conversas where cliente_id=any(ids);delete from public.clientes where id=any(ids);
 end if;
 delete from public.codigos_verificacao where usuario_id=job.target_user_id;delete from public.user_storage_ownership where owner_id=job.target_user_id;delete from public.perfis where id=job.target_user_id;insert into public.logs_auditoria(usuario_id,acao,detalhes) values(actor,'purga_total_usuario',jsonb_build_object('job_id',job.id,'mode','purge'));update public.admin_user_deletion_jobs set status='auth_pending',last_error=null,updated_at=now() where id=job.id;return job.target_user_id;
end $$;

create or replace function public.executar_purga_residual_cliente_admin(p_job_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();j public.residual_client_purge_jobs%rowtype;cid uuid;begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;select * into j from public.residual_client_purge_jobs where id=p_job_id and actor_id=actor for update;if not found then raise exception using errcode='P0002',message='PURGA_NAO_ENCONTRADA';end if;if exists(select 1 from public.residual_client_purge_manifest where job_id=j.id and deleted_at is null)then raise exception using errcode='55000',message='STORAGE_PURGE_PENDENTE';end if;if j.status='completed'then return j.client_id;end if;cid:=j.client_id;perform set_config('app.total_user_purge','on',true);
 delete from private.payment_proof_dead_letter_replay_requests where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_legacy_backfills where canonical_payment_proof_id in(select id from public.payment_proofs where customer_id=cid)or duplicate_payment_proof_id in(select id from public.payment_proofs where customer_id=cid);update public.payment_proof_hash_tombstones set canonical_proof_id=null where canonical_proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_outbox where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_advisory_attempts where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_render_attempts where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_order_links where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_reconciliations where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_order_intents where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from private.payment_proof_operational_failures where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from private.payment_proof_processing_queue where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_chat_projections where proof_id in(select id from public.payment_proofs where customer_id=cid)or conversa_id in(select id from public.conversas where cliente_id=cid);delete from public.mensagens where conversa_id in(select id from public.conversas where cliente_id=cid)or payment_proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_events where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proofs where customer_id=cid;delete from public.comprovantes where cliente_id=cid;delete from public.itens_carrinho where carrinho_id in(select id from public.carrinhos where cliente_id=cid);delete from public.carrinhos where cliente_id=cid;delete from public.itens_pedido where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_estoque_efeitos where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_estoque_snapshots where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_lifecycle_events where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_payment_events where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.comprovantes_venda where cliente_id=cid or pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.manual_external_payment_order_links where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.movimentacoes_estoque where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedidos where cliente_id=cid;delete from public.conversas where cliente_id=cid;delete from public.clientes where id=cid;
 insert into public.logs_auditoria(usuario_id,acao,detalhes)values(actor,'purga_residual_cliente',jsonb_build_object('job_id',j.id,'mode','residual'));update public.residual_client_purge_jobs set client_id=null,status='completed',completed_at=now(),last_error=null,updated_at=now() where id=j.id;return cid;end $$;

-- The replay ledger intentionally grants no table access. Its owner therefore owns
-- the definer purge routines that explicitly delete those RESTRICT dependents.
alter function public.executar_sql_purga_total_usuario_admin(uuid) owner to supabase_admin;
alter function public.executar_purga_residual_cliente_admin(uuid) owner to supabase_admin;

revoke all on function public.claim_payment_proof_maintenance(integer,text),public.complete_payment_proof_maintenance(text,text,boolean,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_payment_proof_maintenance(integer,text),public.complete_payment_proof_maintenance(text,text,boolean,text,uuid,integer) to service_role;
