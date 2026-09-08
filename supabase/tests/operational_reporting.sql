select to_regprocedure('public.get_operational_reporting(timestamp with time zone,timestamp with time zone)') is null as apply_operational_reporting \gset
\if :apply_operational_reporting
\ir ../migrations/20260908150000_operational_reporting.sql
\endif
begin;
select plan(16);

select has_function('public','get_operational_reporting',array['timestamp with time zone','timestamp with time zone'],'operational reporting RPC exists');
select function_privs_are('public','get_operational_reporting',array['timestamp with time zone','timestamp with time zone'],'service_role',array['EXECUTE'],'reporting is service-role-only');
select function_privs_are('public','get_operational_reporting',array['timestamp with time zone','timestamp with time zone'],'authenticated',array[]::text[],'authenticated cannot execute reporting');
select function_privs_are('public','get_operational_reporting',array['timestamp with time zone','timestamp with time zone'],'anon',array[]::text[],'anonymous cannot execute reporting');
select throws_ok($$select public.get_operational_reporting('2099-01-01','2099-01-02')$$,'42501','OPERATIONAL_REPORTING_SERVICE_ROLE_REQUIRED','reporting rejects non-service callers');

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select public.get_operational_reporting('2099-01-02','2099-01-01')$$,'22023','OPERATIONAL_REPORTING_PERIOD_INVALID','reporting rejects inverted periods');
select throws_ok($$select public.get_operational_reporting('2099-01-01','2100-01-03')$$,'22023','OPERATIONAL_REPORTING_PERIOD_INVALID','reporting caps periods at 366 days');
reset role;

insert into public.clientes(id,nome,telefone) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Operational fixture','5541977777777');
insert into public.pedidos(id,cliente_id,status,total_produtos_centavos,total_pedido_centavos,status_pagamento,meio_pagamento,data_criacao) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','novo',1000,1000,'pendente','pix','2099-01-01 00:00+00'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','novo',2000,2000,'pendente','pix','2099-01-02 00:00+00');
insert into public.pedido_payment_events(id,pedido_id,source,external_reference,provider_delivery_id,previous_status,target_status,result_status,created_at) values
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','mercado_pago','operational-approved','operational-approved','pendente','aprovado','aprovado','2099-01-01 12:00+00'),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','mercado_pago','operational-refund','operational-refund','aprovado','reembolsado','reembolsado','2099-01-02 12:00+00');
insert into public.payment_proofs(id,channel,delivery_key,status,original_storage_key,size_bytes,created_at) values
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','web','operational-web','admitted','operational/web.pdf',1,'2099-01-01 00:00+00'),
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2','whatsapp','operational-whatsapp','review','operational/whatsapp.pdf',1,'2099-01-01 00:00+00'),
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd3','telegram','operational-telegram','duplicate','operational/telegram.pdf',1,'2099-01-01 00:00+00');
insert into public.payment_proof_events(proof_id,event_type,source,result_status,created_at) values
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','amount_confirmed','operator','admitted','2099-01-01 00:30+00');

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.get_operational_reporting('2099-01-01','2099-01-03')->'orders','{"created":2,"novo":2,"confirmado":0,"entregue":0,"cancelado":0}'::jsonb,'orders have fixed aggregate statuses');
select is(public.get_operational_reporting('2099-01-01','2099-01-03')->'payments','{"approved_events":1,"refunded_events":1}'::jsonb,'payment events are fixed aggregate counts');
select is(public.get_operational_reporting('2099-01-01','2099-01-03')->'proof_funnel','{"received":3,"admitted":1,"reconciled":0,"review":1,"quarantined":0,"duplicate":1,"purged":0}'::jsonb,'proof funnel uses durable events and reconciliation rows');
select is(public.get_operational_reporting('2099-01-01','2099-01-03')->'proof_sla','{"admitted_within_60m":1,"admitted_over_60m":0,"open_0_to_60m":0,"open_61m_to_24h":0,"open_over_24h":1}'::jsonb,'proof SLA and aging use fixed buckets');
select is(public.get_operational_reporting('2099-01-01','2099-01-03')->'channel','{"web":1,"whatsapp":1,"telegram":1}'::jsonb,'channel metrics are fixed aggregates');
select is(public.get_operational_reporting('2099-01-01','2099-01-03')->'operational_value_cents','{"gross_approved":1000,"refunds":2000,"net":-1000}'::jsonb,'gross refunds and net are explicitly operational only');
select is((select count(*)::integer from jsonb_object_keys(public.get_operational_reporting('2099-01-01','2099-01-03'))),7,'report has only fixed dimensions');
select ok(not (public.get_operational_reporting('2099-01-01','2099-01-03')::text ~ '(aaaaaaaa|bbbbbbbb|cccccccc|dddddddd|Operational fixture|operational/)'),'report omits PII, IDs, references, and storage keys');
select is(public.get_operational_reporting('2099-01-03','2099-01-04')->'orders'->>'created','0','end-exclusive period omits boundary data');
reset role;

select * from finish();
rollback;
