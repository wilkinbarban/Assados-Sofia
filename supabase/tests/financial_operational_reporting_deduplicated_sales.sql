begin;
select plan(9);

select to_regprocedure('public.get_financial_operational_reporting(timestamptz,timestamptz)') is null as apply_financial_reporting \gset
\if :apply_financial_reporting
\ir ../migrations/20260908240000_financial_operational_reporting.sql
\endif
\ir ../migrations/20260909000000_financial_reporting_deduplicated_sales.sql

select function_privs_are('public', 'get_financial_operational_reporting', array['timestamp with time zone', 'timestamp with time zone'], 'service_role', array['EXECUTE'], 'service role may report');
select function_privs_are('public', 'get_financial_operational_reporting', array['timestamp with time zone', 'timestamp with time zone'], 'authenticated', array[]::text[], 'authenticated cannot report');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select public.get_financial_operational_reporting(now(), now())$$, '22023', 'FINANCIAL_REPORTING_PERIOD_INVALID', 'empty period is rejected');
set local role postgres;
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('f6666666-6666-4666-8666-666666666611', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deduplicated-sales@example.test', '', now(), '{}', '{}', now(), now()) on conflict (id) do nothing;
insert into public.perfis(id, nome, funcao, ativo) values ('f6666666-6666-4666-8666-666666666611', 'Deduplicated sales customer', 'cliente', true) on conflict (id) do update set funcao = excluded.funcao, ativo = excluded.ativo;
insert into public.clientes(id, usuario_id, nome, telefone) values ('f6666666-6666-4666-8666-666666666612', 'f6666666-6666-4666-8666-666666666611', 'Deduplicated sales customer', '5541977777778');
insert into public.pedidos(id, cliente_id, status, tipo_entrega, total_produtos_centavos, total_pedido_centavos, meio_pagamento, status_pagamento, estoque_estado) values
  ('f6666666-6666-4666-8666-666666666613', 'f6666666-6666-4666-8666-666666666612', 'confirmado', 'retirada', 1000, 1000, 'pix', 'aprovado', 'reservado'),
  ('f6666666-6666-4666-8666-666666666614', 'f6666666-6666-4666-8666-666666666612', 'cancelado', 'retirada', 700, 700, 'pix', 'reembolsado', 'restaurado');
insert into public.pedido_payment_events(pedido_id, previous_status, target_status, result_status, source, actor_id, external_reference) values
  ('f6666666-6666-4666-8666-666666666613', 'pendente', 'aprovado', 'aprovado', 'mercado_pago', null, 'deduplicated-approved-1'),
  ('f6666666-6666-4666-8666-666666666613', 'pendente', 'aprovado', 'aprovado', 'mercado_pago', null, 'deduplicated-approved-2'),
  ('f6666666-6666-4666-8666-666666666614', 'aprovado', 'reembolsado', 'reembolsado', 'mercado_pago', null, 'deduplicated-refund-1'),
  ('f6666666-6666-4666-8666-666666666614', 'aprovado', 'reembolsado', 'reembolsado', 'mercado_pago', null, 'deduplicated-refund-2');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.get_financial_operational_reporting(now() - interval '1 day', now() + interval '1 day') as report \gset
select is((:'report'::jsonb #>> '{sales,approved_order_count}')::integer, 1, 'approved sales are deduplicated by order');
select is((:'report'::jsonb #>> '{sales,gross_approved_centavos}')::integer, 1000, 'gross approved sum is deduplicated by order');
select is((:'report'::jsonb #>> '{sales,refunded_order_count}')::integer, 1, 'refunded sales are deduplicated by order');
select is((:'report'::jsonb #>> '{sales,refunds_centavos}')::integer, 700, 'refund sum is deduplicated by order');
select is((:'report'::jsonb #>> '{sales,net_operational_centavos}')::integer, 300, 'net uses deduplicated sales aggregates');
select is((:'report'::jsonb #>> '{refunds,centavos}')::integer, (:'report'::jsonb #>> '{sales,refunds_centavos}')::integer, 'sales refunds remain consistent with canonical refunds');
select * from finish();
rollback;
