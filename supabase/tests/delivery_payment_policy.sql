select to_regprocedure('public.entregar_pedido_sem_pagamento_aprovado(uuid,uuid,text)') is null as apply_delivery_payment_policy \gset
\if :apply_delivery_payment_policy
\ir ../migrations/20260908160000_delivery_payment_policy.sql
\endif
begin;
select plan(16);

set local role postgres;
delete from public.notification_outbox where event_id::text like 'f5555555-5555-4555-8555-5555555555%';
delete from public.accounts_receivable_events where pedido_id::text like 'f1111111-1111-4111-8111-1111111111%';
delete from public.accounts_receivable where pedido_id::text like 'f1111111-1111-4111-8111-1111111111%';
delete from public.pedido_lifecycle_events where pedido_id::text like 'f1111111-1111-4111-8111-1111111111%';
delete from public.pedidos where id::text like 'f1111111-1111-4111-8111-1111111111%';
delete from public.clientes where id='f1111111-1111-4111-8111-111111111110';
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('f1111111-1111-4111-8111-111111111101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','delivery-supervisor@example.test','',now(),'{}','{}',now(),now()),
 ('f1111111-1111-4111-8111-111111111102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','delivery-vendor@example.test','',now(),'{}','{}',now(),now()),
 ('f1111111-1111-4111-8111-111111111103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','delivery-customer@example.test','',now(),'{}','{}',now(),now()) on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('f1111111-1111-4111-8111-111111111101','Delivery supervisor','supervisor',true),
 ('f1111111-1111-4111-8111-111111111102','Delivery vendor','vendedor',true),
 ('f1111111-1111-4111-8111-111111111103','Delivery customer','cliente',true)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;
insert into public.clientes(id,usuario_id,nome,telefone) values('f1111111-1111-4111-8111-111111111110','f1111111-1111-4111-8111-111111111103','Delivery customer','5541966666666');
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento,estoque_estado) values
 ('f1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111110','confirmado','retirada',700,700,'pix','pendente','aplicado'),
 ('f1111111-1111-4111-8111-111111111112','f1111111-1111-4111-8111-111111111110','confirmado','retirada',900,900,'pix','aprovado','aplicado');
reset role;

select has_table('public','accounts_receivable','durable accounts receivable exists');
select table_privs_are('public','accounts_receivable','authenticated',array['SELECT'],'staff gets only CxC read grant');
select function_privs_are('public','entregar_pedido_sem_pagamento_aprovado',array['uuid','uuid','text'],'authenticated',array['EXECUTE'],'exception authority is callable by authenticated staff');

set local role authenticated;
select set_config('request.jwt.claim.sub','f1111111-1111-4111-8111-111111111102',true);
select throws_ok($$select * from public.transicionar_pedido('f1111111-1111-4111-8111-111111111111','entregue','f5555555-5555-4555-8555-555555555501','normal delivery')$$,'23514','DELIVERY_PAYMENT_APPROVAL_REQUIRED','ordinary transition blocks pending payment delivery');
select is((select status::text from public.pedidos where id='f1111111-1111-4111-8111-111111111111'),'confirmado','blocked delivery leaves lifecycle unchanged');
select throws_ok($$select * from public.entregar_pedido_sem_pagamento_aprovado('f1111111-1111-4111-8111-111111111111','f5555555-5555-4555-8555-555555555502','override')$$,'42501','DELIVERY_EXCEPTION_SUPERVISOR_REQUIRED','vendor cannot use payment exception');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','f1111111-1111-4111-8111-111111111101',true);
select throws_ok($$select * from public.entregar_pedido_sem_pagamento_aprovado('f1111111-1111-4111-8111-111111111111','f5555555-5555-4555-8555-555555555502',' ')$$,'22023','DELIVERY_EXCEPTION_REASON_REQUIRED','exception requires a nonblank reason');
select lives_ok($$select * from public.entregar_pedido_sem_pagamento_aprovado('f1111111-1111-4111-8111-111111111111','f5555555-5555-4555-8555-555555555502','customer will settle tomorrow')$$,'supervisor exception succeeds');
select lives_ok($$select * from public.entregar_pedido_sem_pagamento_aprovado('f1111111-1111-4111-8111-111111111111','f5555555-5555-4555-8555-555555555502','customer will settle tomorrow')$$,'exception replay is idempotent');
select is((select status::text from public.pedidos where id='f1111111-1111-4111-8111-111111111111'),'entregue','exception delivers the order');
select is((select amount_total_centavos from public.accounts_receivable where pedido_id='f1111111-1111-4111-8111-111111111111'),700,'CxC stores the entire order amount, not a partial payment');
select is((select status from public.accounts_receivable where pedido_id='f1111111-1111-4111-8111-111111111111'),'open','CxC starts open');
select is((select supervisor_alert_required from public.accounts_receivable where pedido_id='f1111111-1111-4111-8111-111111111111'),true,'CxC requires a supervisor alert');
select is((select count(*)::integer from public.accounts_receivable_events where pedido_id='f1111111-1111-4111-8111-111111111111'),1,'exception creates one append-only CxC event');
reset role;
set local role postgres;
select throws_ok($$update public.accounts_receivable set status='open' where pedido_id='f1111111-1111-4111-8111-111111111111'$$,'55000','ACCOUNTS_RECEIVABLE_IMMUTABLE','CxC is immutable');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1111111-1111-4111-8111-111111111101',true);
select lives_ok($$select * from public.transicionar_pedido('f1111111-1111-4111-8111-111111111112','entregue','f5555555-5555-4555-8555-555555555503','approved payment')$$,'approved payment remains deliverable through canonical transition');
reset role;

select * from finish();
rollback;
