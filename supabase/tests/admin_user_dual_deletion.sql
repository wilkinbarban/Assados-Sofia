-- The disposable harness clones the live schema. Apply this uncommitted migration
-- chain only when the clone does not already contain it.
select not to_regclass('public.residual_client_purge_jobs') is not null as apply_residual_chain \gset
\if :apply_residual_chain
\ir ../migrations/20260827090000_residual_client_purge.sql
\ir ../migrations/20260827100000_residual_manifest_alias_fix.sql
\ir ../migrations/20260827101000_residual_job_retention_fix.sql
\endif
\ir ../migrations/20260828183000_total_purge_sales_receipt_authority.sql
select plan(32);
set role postgres;
-- All identifiers are disposable-only and the runner executes inside a cloned DB.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('4a000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-admin@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-client-normal@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-client-purge@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-staff-purge@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-last-admin@test','x',now(),now())
on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('4a000000-0000-4000-8000-000000000001','Fixture Admin','admin',true),
 ('4a000000-0000-4000-8000-000000000002','Normal Client','cliente',true),
 ('4a000000-0000-4000-8000-000000000003','Purge Client','cliente',true),
 ('4a000000-0000-4000-8000-000000000004','Purge Staff','vendedor',true),
 ('4a000000-0000-4000-8000-000000000005','Last Admin','admin',true)
on conflict(id) do update set nome=excluded.nome,funcao=excluded.funcao,ativo=excluded.ativo,deletion_requested_at=null,auth_delete_completed_at=null;
insert into public.clientes(id,usuario_id,nome,telefone,email) values
 ('4a000000-0000-4000-8000-000000000011','4a000000-0000-4000-8000-000000000002','Normal Client','5541999999811','normal@test'),
 ('4a000000-0000-4000-8000-000000000012','4a000000-0000-4000-8000-000000000003','Purge Client','5541999999812','purge@test')
on conflict(id) do update set usuario_id=excluded.usuario_id,nome=excluded.nome,telefone=excluded.telefone,email=excluded.email;
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,status_pagamento,meio_pagamento) values
 ('4a000000-0000-4000-8000-000000000021','4a000000-0000-4000-8000-000000000011','confirmado','retirada',100,100,'pendente','pix'),
 ('4a000000-0000-4000-8000-000000000022','4a000000-0000-4000-8000-000000000012','confirmado','retirada',200,200,'pendente','pix')
on conflict do nothing;
insert into public.comprovantes_venda(id,pedido_id,cliente_id,idempotency_key,snapshot,snapshot_hash,issued_by) values
 ('4a000000-0000-4000-8000-000000000060','4a000000-0000-4000-8000-000000000021','4a000000-0000-4000-8000-000000000011','4a000000-0000-4000-8000-000000000063','{}','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','4a000000-0000-4000-8000-000000000001'),
 ('4a000000-0000-4000-8000-000000000061','4a000000-0000-4000-8000-000000000022','4a000000-0000-4000-8000-000000000012','4a000000-0000-4000-8000-000000000062','{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','4a000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.conversas(id,cliente_id,status) values
 ('4a000000-0000-4000-8000-000000000041','4a000000-0000-4000-8000-000000000012','aberta') on conflict do nothing;
insert into public.mensagens(id,conversa_id,remetente,conteudo) values
 ('4a000000-0000-4000-8000-000000000042','4a000000-0000-4000-8000-000000000041','cliente','purge me') on conflict do nothing;
insert into public.payment_proofs(id,customer_id,channel,delivery_key,status,original_storage_key,size_bytes,sha256) values
 ('4a000000-0000-4000-8000-000000000031','4a000000-0000-4000-8000-000000000012','web','purge-fixture','received','proofs/private/web/purge-fixture.pdf',100,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
on conflict do nothing;
insert into public.payment_proof_events(proof_id,event_type,source,result_status) values
 ('4a000000-0000-4000-8000-000000000031','fixture','web','received') on conflict do nothing;
insert into public.payment_proof_hash_tombstones(sha256,canonical_proof_id) values
 ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','4a000000-0000-4000-8000-000000000031') on conflict do nothing;
reset role;

-- The RPCs see a real authenticated admin context, not postgres/service_role.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','4a000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.anonymizar_usuario_admin('4a000000-0000-4000-8000-000000000001')$$,'ANTI_LOCKOUT_AUTO_EXCLUSAO','normal mode rejects self deletion');
select pass('last-admin guard is unreachable by a valid distinct active admin: anti-self plus actor authorization necessarily leaves at least one other admin');
select lives_ok($$select public.anonymizar_usuario_admin('4a000000-0000-4000-8000-000000000002')$$,'normal client anonymization runs as authenticated admin');
select is((select ativo from public.perfis where id='4a000000-0000-4000-8000-000000000002'),false,'normal target access is deactivated');
select is((select usuario_id from public.clientes where id='4a000000-0000-4000-8000-000000000011'),null::uuid,'normal mode detaches client Auth identity');
select is((select nome from public.clientes where id='4a000000-0000-4000-8000-000000000011'),'Deleted customer','normal mode removes client PII');
select ok(exists(select 1 from public.pedidos where id='4a000000-0000-4000-8000-000000000021'),'normal mode preserves business order');
select lives_ok($$select public.concluir_anonymizacao_usuario_admin('4a000000-0000-4000-8000-000000000002')$$,'normal completion is retry-safe');
select lives_ok($$select public.concluir_anonymizacao_usuario_admin('4a000000-0000-4000-8000-000000000002')$$,'normal completion remains idempotent');

-- Total purge: create/reuse a durable manifest; fail/retry storage progress; then
-- run the locked relational purge and finalization, all under this same actor.
create temporary table purge_manifest as select * from public.iniciar_purga_total_usuario_admin('4a000000-0000-4000-8000-000000000003');
select is((select count(*) from purge_manifest),1::bigint,'purge creates exact attributable Storage manifest');
select is((select bucket_id from purge_manifest),'payment-proofs','manifest records the owned bucket');
select is((select object_path from purge_manifest),'proofs/private/web/purge-fixture.pdf','manifest records the exact owned path');
select lives_ok($$select public.registrar_storage_purga_usuario_admin((select job_id from purge_manifest),'payment-proofs','proofs/private/web/purge-fixture.pdf',false,'fixture failure')$$,'storage failure is recorded instead of false success');
reset role;
select is((select status from public.admin_user_deletion_jobs where id=(select job_id from purge_manifest)),'storage_pending','failed Storage leaves durable retryable state');
set local role authenticated;
select lives_ok($$select public.registrar_storage_purga_usuario_admin((select job_id from purge_manifest),'payment-proofs','proofs/private/web/purge-fixture.pdf',true,null)$$,'storage retry records completion');
select lives_ok($$select public.executar_sql_purga_total_usuario_admin((select job_id from purge_manifest))$$,'locked total purge runs after manifest completion');
select ok(not exists(select 1 from public.comprovantes_venda where id='4a000000-0000-4000-8000-000000000061'),'total purge removes the target test sales receipt through its narrow authority');
select ok(not exists(select 1 from public.clientes where id='4a000000-0000-4000-8000-000000000012'),'purge deletes target client row');
select ok(not exists(select 1 from public.pedidos where id='4a000000-0000-4000-8000-000000000022'),'purge deletes target-derived order');
select ok(not exists(select 1 from public.conversas where id='4a000000-0000-4000-8000-000000000041'),'purge deletes target-derived conversation/messages');
select ok(not exists(select 1 from public.payment_proofs where id='4a000000-0000-4000-8000-000000000031'),'purge deletes target proof and dependent ledger rows');
reset role;
select ok(exists(select 1 from public.payment_proof_hash_tombstones where sha256='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' and canonical_proof_id is null),'purge retains only detached global SHA-256 tombstone');
reset role;
select is((select status from public.admin_user_deletion_jobs where id=(select job_id from purge_manifest)),'auth_pending','SQL purge records pending Auth phase');
set local role authenticated;
select lives_ok($$select public.concluir_purga_total_usuario_admin((select job_id from purge_manifest))$$,'purge finalization runs after Auth boundary');
reset role;
select is((select status from public.admin_user_deletion_jobs where id=(select job_id from purge_manifest)),'completed','purge job ends completed');
select is((select detalhes->>'mode' from public.logs_auditoria where acao='purga_total_usuario' and detalhes->>'job_id'=(select job_id::text from purge_manifest) order by data_criacao desc limit 1),'purge','purge audit is minimal and sanitized');
set local role authenticated;
select lives_ok($$select public.executar_sql_purga_total_usuario_admin((select job_id from purge_manifest))$$,'completed SQL purge is idempotent');
reset role;
select throws_ok($$delete from public.comprovantes_venda where id='4a000000-0000-4000-8000-000000000060'$$,'SALES_RECEIPT_IMMUTABLE','sales receipts remain immutable outside the total-purge authority');
set local role authenticated;
-- A normal anonymization may leave business data. Its residual purge is keyed
-- to that client record and must not require or affect an Auth user.
insert into public.clientes(id,usuario_id,nome,telefone) values('4a000000-0000-4000-8000-000000000013',null,'Deleted customer','5541999999813') on conflict(id) do update set usuario_id=null,nome='Deleted customer',telefone='5541999999813';
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,status_pagamento,meio_pagamento) values('4a000000-0000-4000-8000-000000000023','4a000000-0000-4000-8000-000000000013','confirmado','retirada',300,300,'pendente','pix') on conflict do nothing;
create temporary table residual_manifest as select * from public.iniciar_purga_residual_cliente_admin('4a000000-0000-4000-8000-000000000013');
select is((select count(*) from residual_manifest),0::bigint,'residual purge allows an empty exact Storage manifest');
reset role;
create temporary table residual_job as select id from public.residual_client_purge_jobs where client_id='4a000000-0000-4000-8000-000000000013';
select set_config('app.residual_job_id',(select id::text from residual_job),true);
set local role authenticated;
select lives_ok($$select public.executar_purga_residual_cliente_admin(current_setting('app.residual_job_id')::uuid)$$,'residual client purge runs without Auth deletion');
select ok(not exists(select 1 from public.clientes where id='4a000000-0000-4000-8000-000000000013'),'residual purge deletes anonymized client record');
select ok(not exists(select 1 from public.pedidos where id='4a000000-0000-4000-8000-000000000023'),'residual purge deletes its derived order');
select * from finish();
rollback;
