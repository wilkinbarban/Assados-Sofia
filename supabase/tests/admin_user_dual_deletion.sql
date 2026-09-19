-- The disposable harness clones the live schema. Apply this uncommitted migration
-- chain only when the clone does not already contain it.
select not to_regclass('public.residual_client_purge_jobs') is not null as apply_residual_chain \gset
\if :apply_residual_chain
\ir ../migrations/20260827090000_residual_client_purge.sql
\ir ../migrations/20260827100000_residual_manifest_alias_fix.sql
\ir ../migrations/20260827101000_residual_job_retention_fix.sql
\endif
select not to_regclass('public.payment_proof_order_intents') is not null as apply_payment_proof_dependents \gset
\if :apply_payment_proof_dependents
\ir ../migrations/20260828230000_payment_proof_order_lock.sql
\ir ../migrations/20260828300000_payment_proof_operational_metrics.sql
\ir ../migrations/20260828320000_payment_proof_processing_queue.sql
\endif
\ir ../migrations/20260828183000_total_purge_sales_receipt_authority.sql
\ir ../migrations/20260828330000_total_purge_payment_proof_dependents.sql
select to_regclass('private.payment_proof_dead_letter_replay_requests') is null as apply_replay_chain \gset
\if :apply_replay_chain
\ir ../migrations/20260828340000_payment_proof_operator_leases.sql
\ir ../migrations/20260828380000_payment_proof_dead_letter_replay.sql
\endif
\ir ../migrations/20260828390000_payment_proof_purge_fencing_and_replay_purge.sql
-- Fatos por cliente (memoria_cliente). Mesmo padrao guardado acima: o harness local descartavel
-- ja aplicou a cadeia completa, enquanto o runner self-hosted clona um banco que ainda pode nao
-- conter estas migracoes. A migracao de anonimizacao e reconhecida pela definicao da propria
-- funcao que ela substitui, porque ela nao cria um objeto novo.
select not to_regclass('public.fatos_cliente') is not null as apply_fatos_cliente_schema \gset
\if :apply_fatos_cliente_schema
\ir ../migrations/20260918010000_fatos_cliente_schema.sql
\endif
select position('fatos_cliente' in pg_get_functiondef('public.anonymizar_usuario_admin(uuid)'::regprocedure)) = 0 as apply_fatos_cliente_anonymization \gset
\if :apply_fatos_cliente_anonymization
\ir ../migrations/20260918030000_anonymize_fatos_cliente.sql
\endif
create extension if not exists pgtap;
select plan(56);
set role postgres;
-- All identifiers are disposable-only and the runner executes inside a cloned DB.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('4a000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-admin@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-client-normal@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-client-purge@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-staff-purge@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-last-admin@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-plain-caller@test','x',now(),now()),
 ('4a000000-0000-4000-8000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deletion-order-control@test','x',now(),now())
on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('4a000000-0000-4000-8000-000000000001','Fixture Admin','admin',true),
 ('4a000000-0000-4000-8000-000000000002','Normal Client','cliente',true),
 ('4a000000-0000-4000-8000-000000000003','Purge Client','cliente',true),
 ('4a000000-0000-4000-8000-000000000004','Purge Staff','vendedor',true),
 ('4a000000-0000-4000-8000-000000000005','Last Admin','admin',true),
 ('4a000000-0000-4000-8000-000000000006','Plain Caller','cliente',true),
 ('4a000000-0000-4000-8000-000000000007','Order Control','cliente',true)
on conflict(id) do update set nome=excluded.nome,funcao=excluded.funcao,ativo=excluded.ativo,deletion_requested_at=null,auth_delete_completed_at=null;
insert into public.clientes(id,usuario_id,nome,telefone,email) values
 ('4a000000-0000-4000-8000-000000000011','4a000000-0000-4000-8000-000000000002','Normal Client','5541999999811','normal@test'),
 ('4a000000-0000-4000-8000-000000000012','4a000000-0000-4000-8000-000000000003','Purge Client','5541999999812','purge@test')
on conflict(id) do update set usuario_id=excluded.usuario_id,nome=excluded.nome,telefone=excluded.telefone,email=excluded.email;
insert into public.clientes(id,usuario_id,nome,telefone,email) values
 ('4a000000-0000-4000-8000-000000000014',null,'Unlinked Customer','5541999999814','unlinked@test'),
 ('4a000000-0000-4000-8000-000000000015','4a000000-0000-4000-8000-000000000006','Plain Caller Target','5541999999815','caller-target@test'),
 ('4a000000-0000-4000-8000-000000000016','4a000000-0000-4000-8000-000000000007','Order Control Client','5541999999816','order-control@test')
on conflict(id) do update set usuario_id=excluded.usuario_id,nome=excluded.nome,telefone=excluded.telefone,email=excluded.email;
-- Fatos por cliente: o cliente anonimizado, um cliente ligado a outro usuario, um cliente sem
-- usuario nenhum e o alvo de um chamador sem autoridade.
insert into public.fatos_cliente(id,cliente_id,tipo,chave,valor,origem,confianca,estado) values
 ('4a000000-0000-4000-8000-000000000051','4a000000-0000-4000-8000-000000000011','endereco','logradouro','Rua X, 123','cliente',null,'aprovado'),
 ('4a000000-0000-4000-8000-000000000052','4a000000-0000-4000-8000-000000000011','preferencia','ponto_da_carne','bem passado','operador',null,'aprovado'),
 ('4a000000-0000-4000-8000-000000000053','4a000000-0000-4000-8000-000000000012','endereco','logradouro','Rua Y, 456','cliente',null,'aprovado'),
 ('4a000000-0000-4000-8000-000000000054','4a000000-0000-4000-8000-000000000014','preferencia','bebida','guarana','cliente',null,'aprovado'),
 ('4a000000-0000-4000-8000-000000000055','4a000000-0000-4000-8000-000000000014','endereco','logradouro','Rua Z, 789','cliente',null,'aprovado'),
 ('4a000000-0000-4000-8000-000000000056','4a000000-0000-4000-8000-000000000015','endereco','logradouro','Rua W, 101','cliente',null,'aprovado'),
 -- O alvo carrega tambem historico pendente, rejeitado e substituido: a exclusao da anonimizacao
 -- nao pode se limitar aos fatos aprovados que o prompt le.
 ('4a000000-0000-4000-8000-000000000057','4a000000-0000-4000-8000-000000000011','preferencia','molho','picante','ia',0.50,'pendente'),
 ('4a000000-0000-4000-8000-000000000058','4a000000-0000-4000-8000-000000000011','preferencia','sobremesa','doce','operador',null,'rejeitado'),
 ('4a000000-0000-4000-8000-000000000059','4a000000-0000-4000-8000-000000000011','preferencia','corte','ao ponto','ia',0.90,'substituido'),
 -- Controle negativo da ordenacao: um cliente cuja identidade e desvinculada ANTES da exclusao.
 ('4a000000-0000-4000-8000-000000000080','4a000000-0000-4000-8000-000000000016','endereco','logradouro','Rua V, 202','cliente',null,'aprovado');
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
insert into public.payment_proof_order_intents(proof_id,pedido_id,requested_via) values
 ('4a000000-0000-4000-8000-000000000031','4a000000-0000-4000-8000-000000000022','migration') on conflict do nothing;
insert into private.payment_proof_operational_failures(proof_id,stage) values
 ('4a000000-0000-4000-8000-000000000031','render');
insert into private.payment_proof_processing_queue(proof_id) values
 ('4a000000-0000-4000-8000-000000000031') on conflict do nothing;
-- O runner self-hosted usa uma sessao superusuario que pode mudar para `supabase_admin`; o harness
-- local conecta como `postgres`, que nao e superusuario no Supabase e por isso nao tem permissao
-- para assumir esse papel. A troca e condicional para a suite rodar nos dois runners.
select pg_catalog.pg_has_role(current_user, 'supabase_admin', 'member') as can_set_supabase_admin \gset
\if :can_set_supabase_admin
set role supabase_admin;
\else
reset role;
\endif
insert into private.payment_proof_dead_letter_replay_requests(idempotency_key,request_fingerprint,source,target_id,proof_id,actor_id,actor_role,outcome) values
 ('4a000000-0000-4000-8000-000000000071',repeat('e',64),'processing_queue','4a000000-0000-4000-8000-000000000031','4a000000-0000-4000-8000-000000000031','4a000000-0000-4000-8000-000000000001','admin','ineligible');
insert into public.payment_proof_hash_tombstones(sha256,canonical_proof_id) values
 ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','4a000000-0000-4000-8000-000000000031') on conflict do nothing;
reset role;

-- The RPCs see a real authenticated admin context, not postgres/service_role.
begin;
-- Prova direta da ordem exigida: um gatilho BEFORE UPDATE em public.clientes registra, no exato
-- instante em que a identidade e desvinculada, quantos fatos ainda existiam para aquele cliente.
-- Se a exclusao viesse depois da anulacao de `usuario_id`, o registro traria um valor maior que
-- zero (e uma exclusao posterior nao encontraria mais nada para apagar).
create table public.anonymization_order_probe(usuario_id uuid, fatos_no_instante bigint);
create function public.probe_anonymization_order() returns trigger language plpgsql security definer as $$
begin
 if new.usuario_id is null and old.usuario_id is not null then
   insert into public.anonymization_order_probe(usuario_id,fatos_no_instante)
   values(old.usuario_id,(select count(*) from public.fatos_cliente f where f.cliente_id=old.id));
 end if;
 return new;
end $$;
create trigger trg_probe_anonymization_order before update on public.clientes
 for each row execute function public.probe_anonymization_order();
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000011' and estado in ('pendente','rejeitado','substituido')),3::bigint,'the anonymization target carries pending, rejected and superseded history before the call');
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

-- Fatos por cliente: a anonimizacao precisa apaga-los antes de desvincular a identidade, porque
-- `clientes.usuario_id` e a unica ligacao entre o usuario e o registro de cliente.
reset role;
select ok(not exists(select 1 from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000011'),'normal mode deletes every fact of the anonymized customer');
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000012'),1::bigint,'facts of a customer linked to another Auth user survive the anonymization');
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000014'),2::bigint,'facts of an unlinked customer survive the anonymization');
select is((select count(*) from public.anonymization_order_probe where usuario_id='4a000000-0000-4000-8000-000000000002'),1::bigint,'the ordering probe observed exactly one identity unlink for the target');
select is((select fatos_no_instante from public.anonymization_order_probe where usuario_id='4a000000-0000-4000-8000-000000000002'),0::bigint,'the target facts were already deleted at the instant clientes.usuario_id was nulled');
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000011' and estado in ('pendente','rejeitado','substituido')),0::bigint,'the anonymization also removes the pending, rejected and superseded history of the target');
set local role authenticated;
select lives_ok($$select public.anonymizar_usuario_admin('4a000000-0000-4000-8000-000000000002')$$,'a second anonymization call stays idempotent');
reset role;
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000011'),0::bigint,'the idempotent second call deletes no additional fact');
select is((select count(*) from public.anonymization_order_probe where usuario_id='4a000000-0000-4000-8000-000000000002'),1::bigint,'the idempotent second call never re-nulls the identity');
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000014'),2::bigint,'the idempotent second call leaves other customers untouched');
set local role authenticated;
select set_config('request.jwt.claim.sub','4a000000-0000-4000-8000-000000000006',true);
select throws_ok($$select public.anonymizar_usuario_admin('4a000000-0000-4000-8000-000000000006')$$,'USUARIO_NAO_AUTORIZADO','a caller without the admin function cannot anonymize anyone');
reset role;
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000015'),1::bigint,'the unauthorized caller deleted no fact');
-- Controle negativo: a exclusao depende de `clientes.usuario_id`, entao executa-la depois da
-- anulacao nao apaga nada. As tres assercoes seguintes provam que a ordem e carga, e que a
-- sonda de ordenacao acima consegue falhar quando a ordem esta errada.
update public.clientes set usuario_id=null where id='4a000000-0000-4000-8000-000000000016';
with removidos as (
  delete from public.fatos_cliente f using public.clientes c
   where c.id=f.cliente_id and c.usuario_id='4a000000-0000-4000-8000-000000000007' returning 1)
select is((select count(*) from removidos),0::bigint,'the same delete statement removes nothing once clientes.usuario_id has already been nulled');
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000016'),1::bigint,'the fact a post-update deletion would leave behind is exactly the leak the required order prevents');
select is((select fatos_no_instante from public.anonymization_order_probe where usuario_id='4a000000-0000-4000-8000-000000000007'),1::bigint,'the ordering probe records a non-zero fact count when the unlink happens with facts still present');
set local role authenticated;
select set_config('request.jwt.claim.sub','4a000000-0000-4000-8000-000000000001',true);

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
reset role;
select ok(not exists(select 1 from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000012'),'total purge removes the target customer facts through the cliente_id cascade');
select is((select count(*) from public.fatos_cliente where cliente_id='4a000000-0000-4000-8000-000000000014'),2::bigint,'the purge cascade leaves another customer facts intact');
set local role authenticated;
select ok(not exists(select 1 from public.pedidos where id='4a000000-0000-4000-8000-000000000022'),'purge deletes target-derived order');
select ok(not exists(select 1 from public.conversas where id='4a000000-0000-4000-8000-000000000041'),'purge deletes target-derived conversation/messages');
select ok(not exists(select 1 from public.payment_proofs where id='4a000000-0000-4000-8000-000000000031'),'purge deletes target proof and dependent ledger rows');
select ok(not exists(select 1 from public.payment_proof_order_intents where proof_id='4a000000-0000-4000-8000-000000000031'),'total purge clears RESTRICT payment-proof order intents');
reset role;
select ok(not exists(select 1 from private.payment_proof_operational_failures where proof_id='4a000000-0000-4000-8000-000000000031'),'total purge clears RESTRICT private operational failures');
select ok(not exists(select 1 from private.payment_proof_processing_queue where proof_id='4a000000-0000-4000-8000-000000000031'),'total purge clears RESTRICT private processing queue rows');
select ok(not exists(select 1 from private.payment_proof_dead_letter_replay_requests where proof_id='4a000000-0000-4000-8000-000000000031'),'total purge clears RESTRICT replay-request dependents');
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
\if :can_set_supabase_admin
set local role supabase_admin;
\else
reset role;
\endif
insert into public.clientes(id,usuario_id,nome,telefone) values('4a000000-0000-4000-8000-000000000013',null,'Deleted customer','5541999999813') on conflict(id) do update set usuario_id=null,nome='Deleted customer',telefone='5541999999813';
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,status_pagamento,meio_pagamento) values('4a000000-0000-4000-8000-000000000023','4a000000-0000-4000-8000-000000000013','confirmado','retirada',300,300,'pendente','pix') on conflict do nothing;
insert into public.payment_proofs(id,customer_id,channel,delivery_key,status,original_storage_key,size_bytes,sha256) values
 ('4a000000-0000-4000-8000-000000000032','4a000000-0000-4000-8000-000000000013','web','residual-purge-fixture','received','proofs/private/web/residual-purge-fixture.pdf',100,repeat('d',64));
\if :can_set_supabase_admin
set local role supabase_admin;
\else
reset role;
\endif
insert into private.payment_proof_dead_letter_replay_requests(idempotency_key,request_fingerprint,source,target_id,proof_id,actor_id,actor_role,outcome) values
 ('4a000000-0000-4000-8000-000000000072',repeat('f',64),'processing_queue','4a000000-0000-4000-8000-000000000032','4a000000-0000-4000-8000-000000000032','4a000000-0000-4000-8000-000000000001','admin','ineligible');
set local role authenticated;
create temporary table residual_manifest as select * from public.iniciar_purga_residual_cliente_admin('4a000000-0000-4000-8000-000000000013');
select is((select count(*) from residual_manifest),1::bigint,'residual purge returns the proof Storage manifest');
select lives_ok($$select public.registrar_storage_purga_residual_cliente_admin((select job_id from residual_manifest),(select bucket_id from residual_manifest),(select object_path from residual_manifest),true,null)$$,'residual Storage manifest completes before SQL purge');
reset role;
create temporary table residual_job as select id from public.residual_client_purge_jobs where client_id='4a000000-0000-4000-8000-000000000013';
select set_config('app.residual_job_id',(select id::text from residual_job),true);
set local role authenticated;
select lives_ok($$select public.executar_purga_residual_cliente_admin(current_setting('app.residual_job_id')::uuid)$$,'residual client purge runs without Auth deletion');
select ok(not exists(select 1 from public.clientes where id='4a000000-0000-4000-8000-000000000013'),'residual purge deletes anonymized client record');
select ok(not exists(select 1 from public.pedidos where id='4a000000-0000-4000-8000-000000000023'),'residual purge deletes its derived order');
\if :can_set_supabase_admin
set local role supabase_admin;
\else
reset role;
\endif
select ok(not exists(select 1 from private.payment_proof_dead_letter_replay_requests where proof_id='4a000000-0000-4000-8000-000000000032'),'residual purge clears RESTRICT replay-request dependents');
select * from finish();
rollback;
