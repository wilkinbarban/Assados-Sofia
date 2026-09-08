select to_regprocedure('public.liquidar_conta_receber(uuid,integer,text,text,uuid)') is null as apply_financial_cxc_core \gset
\if :apply_financial_cxc_core
\ir ../migrations/20260908200000_financial_cxc_core.sql
\endif
begin;
select plan(18);
set local role postgres;
delete from public.accounts_receivable_alerts where receivable_id::text like 'f2222222-2222-4222-8222-2222222222%';
delete from public.accounts_receivable_settlements where pedido_id::text like 'f2222222-2222-4222-8222-2222222222%';
delete from public.accounts_receivable_events where pedido_id::text like 'f2222222-2222-4222-8222-2222222222%';
delete from public.accounts_receivable where pedido_id::text like 'f2222222-2222-4222-8222-2222222222%';
delete from public.pedido_payment_events where pedido_id::text like 'f2222222-2222-4222-8222-2222222222%';
delete from public.pedido_lifecycle_events where pedido_id::text like 'f2222222-2222-4222-8222-2222222222%';
delete from public.pedidos where id::text like 'f2222222-2222-4222-8222-2222222222%';
delete from public.clientes where id='f2222222-2222-4222-8222-222222222210';
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('f2222222-2222-4222-8222-222222222201','00000000-0000-0000-0000-000000000000','authenticated','authenticated','finance-supervisor@example.test','',now(),'{}','{}',now(),now()),
('f2222222-2222-4222-8222-222222222202','00000000-0000-0000-0000-000000000000','authenticated','authenticated','finance-vendor@example.test','',now(),'{}','{}',now(),now()),
('f2222222-2222-4222-8222-222222222203','00000000-0000-0000-0000-000000000000','authenticated','authenticated','finance-customer@example.test','',now(),'{}','{}',now(),now()) on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
('f2222222-2222-4222-8222-222222222201','Finance supervisor','supervisor',true),
('f2222222-2222-4222-8222-222222222202','Finance vendor','vendedor',true),
('f2222222-2222-4222-8222-222222222203','Finance customer','cliente',true)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;
insert into public.clientes(id,usuario_id,nome,telefone) values('f2222222-2222-4222-8222-222222222210','f2222222-2222-4222-8222-222222222203','Finance customer','5541955555555');
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento,estoque_estado) values
('f2222222-2222-4222-8222-222222222211','f2222222-2222-4222-8222-222222222210','confirmado','retirada',1200,1200,'pix','pendente','aplicado');
reset role;
select has_table('public','accounts_receivable_settlements','append-only CxC settlement ledger exists');
select has_table('public','accounts_receivable_alerts','durable supervisor alert intents exist');
select table_privs_are('public','accounts_receivable_settlements','authenticated',array['SELECT'],'authenticated cannot mutate settlements directly');
set local role authenticated;
select set_config('request.jwt.claim.sub','f2222222-2222-4222-8222-222222222201',true);
select lives_ok($$select * from public.entregar_pedido_sem_pagamento_aprovado('f2222222-2222-4222-8222-222222222211','f2222222-2222-4222-8222-222222222221','deferred settlement')$$,'supervisor creates CxC');
select is((select count(*)::integer from public.accounts_receivable_alerts where event_type='receivable_opened'),1,'CxC opening creates one durable alert');
select throws_ok($$select * from public.liquidar_conta_receber((select id from public.accounts_receivable where pedido_id='f2222222-2222-4222-8222-222222222211'),600,'cash','partial','f2222222-2222-4222-8222-222222222222')$$,'23514','RECEIVABLE_FULL_AMOUNT_REQUIRED','partial settlement is rejected');
select is((select status_pagamento::text from public.pedidos where id='f2222222-2222-4222-8222-222222222211'),'pendente','partial rejection leaves payment pending');
select lives_ok($$select * from public.liquidar_conta_receber((select id from public.accounts_receivable where pedido_id='f2222222-2222-4222-8222-222222222211'),1200,'cash','paid in full','f2222222-2222-4222-8222-222222222223')$$,'full settlement succeeds');
select is((select status_pagamento::text from public.pedidos where id='f2222222-2222-4222-8222-222222222211'),'aprovado','settlement updates canonical payment authority');
select is((select count(*)::integer from public.accounts_receivable_settlements where pedido_id='f2222222-2222-4222-8222-222222222211'),1,'one settlement is retained');
select is((select count(*)::integer from public.accounts_receivable_alerts where event_type='receivable_settled'),1,'settlement creates one durable alert');
select lives_ok($$select * from public.liquidar_conta_receber((select id from public.accounts_receivable where pedido_id='f2222222-2222-4222-8222-222222222211'),1200,'cash','paid in full','f2222222-2222-4222-8222-222222222223')$$,'same settlement request is idempotent');
select is((select count(*)::integer from public.accounts_receivable_settlements where pedido_id='f2222222-2222-4222-8222-222222222211'),1,'idempotent replay creates no duplicate settlement');
select throws_ok($$select * from public.liquidar_conta_receber((select id from public.accounts_receivable where pedido_id='f2222222-2222-4222-8222-222222222211'),1200,'pix_external','changed','f2222222-2222-4222-8222-222222222223')$$,'23505','RECEIVABLE_SETTLEMENT_IDEMPOTENCY_CONFLICT','changed replay conflicts');
select id as receivable_id from public.accounts_receivable where pedido_id='f2222222-2222-4222-8222-222222222211' \gset
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f2222222-2222-4222-8222-222222222202',true);
select throws_ok(format($$select * from public.liquidar_conta_receber(%L,1200,'cash','vendor attempt','f2222222-2222-4222-8222-222222222224')$$,:'receivable_id'),'42501','RECEIVABLE_SETTLEMENT_SUPERVISOR_REQUIRED','vendor cannot settle CxC');
reset role;
set local role postgres;
select throws_ok($$update public.accounts_receivable_settlements set reason='changed' where pedido_id='f2222222-2222-4222-8222-222222222211'$$,'55000','ACCOUNTS_RECEIVABLE_IMMUTABLE','settlement ledger is immutable');
select throws_ok($$delete from public.accounts_receivable_alerts where event_type='receivable_opened'$$,'55000','ACCOUNTS_RECEIVABLE_IMMUTABLE','alert ledger is immutable');
reset role;
select is((select count(*)::integer from public.pedido_payment_events where pedido_id='f2222222-2222-4222-8222-222222222211' and result_status='aprovado'),1,'settlement creates one canonical payment event');
select * from finish();
rollback;
