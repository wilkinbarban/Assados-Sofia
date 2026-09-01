-- Later payment-proof features deliberately retain RESTRICT foreign keys during
-- ordinary operations. The two administrative purge paths are the narrow,
-- authorized exception: delete each target-derived dependent before its proof.

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
   -- Delete only target-derived rows; global hash tombstones remain, detached.
   delete from public.payment_proof_legacy_backfills where canonical_payment_proof_id in(select id from public.payment_proofs where customer_id=any(ids)) or duplicate_payment_proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   update public.payment_proof_hash_tombstones set canonical_proof_id=null where canonical_proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_outbox where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_advisory_attempts where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_render_attempts where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_order_links where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_reconciliations where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from public.payment_proof_order_intents where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from private.payment_proof_operational_failures where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
   delete from private.payment_proof_processing_queue where proof_id in(select id from public.payment_proofs where customer_id=any(ids));
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

create or replace function public.executar_purga_residual_cliente_admin(p_job_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();j public.residual_client_purge_jobs%rowtype;cid uuid;begin
 if actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;select * into j from public.residual_client_purge_jobs where id=p_job_id and actor_id=actor for update;if not found then raise exception using errcode='P0002',message='PURGA_NAO_ENCONTRADA';end if;if exists(select 1 from public.residual_client_purge_manifest where job_id=j.id and deleted_at is null)then raise exception using errcode='55000',message='STORAGE_PURGE_PENDENTE';end if;if j.status='completed'then return j.client_id;end if;cid:=j.client_id;perform set_config('app.total_user_purge','on',true);
 delete from public.payment_proof_legacy_backfills where canonical_payment_proof_id in(select id from public.payment_proofs where customer_id=cid)or duplicate_payment_proof_id in(select id from public.payment_proofs where customer_id=cid);update public.payment_proof_hash_tombstones set canonical_proof_id=null where canonical_proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_outbox where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_advisory_attempts where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_render_attempts where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_order_links where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_reconciliations where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_order_intents where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from private.payment_proof_operational_failures where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from private.payment_proof_processing_queue where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_chat_projections where proof_id in(select id from public.payment_proofs where customer_id=cid)or conversa_id in(select id from public.conversas where cliente_id=cid);delete from public.mensagens where conversa_id in(select id from public.conversas where cliente_id=cid)or payment_proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proof_events where proof_id in(select id from public.payment_proofs where customer_id=cid);delete from public.payment_proofs where customer_id=cid;delete from public.comprovantes where cliente_id=cid;delete from public.itens_carrinho where carrinho_id in(select id from public.carrinhos where cliente_id=cid);delete from public.carrinhos where cliente_id=cid;delete from public.itens_pedido where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_estoque_efeitos where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_estoque_snapshots where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_lifecycle_events where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedido_payment_events where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.comprovantes_venda where cliente_id=cid or pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.manual_external_payment_order_links where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.movimentacoes_estoque where pedido_id in(select id from public.pedidos where cliente_id=cid);delete from public.pedidos where cliente_id=cid;delete from public.conversas where cliente_id=cid;delete from public.clientes where id=cid;
 insert into public.logs_auditoria(usuario_id,acao,detalhes)values(actor,'purga_residual_cliente',jsonb_build_object('job_id',j.id,'mode','residual'));update public.residual_client_purge_jobs set client_id=null,status='completed',completed_at=now(),last_error=null,updated_at=now() where id=j.id;return cid;end $$;

revoke all on function public.executar_sql_purga_total_usuario_admin(uuid) from public,anon,service_role;
grant execute on function public.executar_sql_purga_total_usuario_admin(uuid) to authenticated;
revoke all on function public.executar_purga_residual_cliente_admin(uuid) from public,anon,service_role;
grant execute on function public.executar_purga_residual_cliente_admin(uuid) to authenticated;
