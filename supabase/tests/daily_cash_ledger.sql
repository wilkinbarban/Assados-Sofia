select to_regprocedure('public.open_cash_session(date,integer)') is null as apply_daily_cash_ledger \gset
\if :apply_daily_cash_ledger
\ir ../migrations/20260908210000_daily_cash_ledger.sql
\endif
begin;select plan(17);set local role postgres;
delete from public.cash_session_closures;delete from public.cash_movements;delete from public.cash_sessions;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('f3333333-3333-4333-8333-333333333301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cash-supervisor@example.test','',now(),'{}','{}',now(),now()),
('f3333333-3333-4333-8333-333333333302','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cash-vendor@example.test','',now(),'{}','{}',now(),now()) on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values('f3333333-3333-4333-8333-333333333301','Cash supervisor','supervisor',true),('f3333333-3333-4333-8333-333333333302','Cash vendor','vendedor',true) on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;reset role;
select has_table('public','cash_sessions','cash session ledger exists');select has_table('public','cash_movements','cash movement ledger exists');select has_table('public','cash_session_closures','cash closing ledger exists');
select table_privs_are('public','cash_movements','authenticated',array['SELECT'],'authenticated can only read movements through RLS');
set local role authenticated;select set_config('request.jwt.claim.sub','f3333333-3333-4333-8333-333333333302',true);
select throws_ok($$select public.open_cash_session(current_date,1000)$$,'42501','CASH_MANAGER_REQUIRED','vendor cannot open cash');reset role;
set local role authenticated;select set_config('request.jwt.claim.sub','f3333333-3333-4333-8333-333333333301',true);
select lives_ok($$select public.open_cash_session(current_date,1000)$$,'supervisor opens cash');select id as session_id from public.cash_sessions \gset
select throws_ok($$select public.open_cash_session(current_date,0)$$,'23505','CASH_SESSION_ALREADY_OPEN','second active session is rejected');
select lives_ok(format($$select public.record_cash_movement(%L,'supply',500,null,null,'opening reinforcement','f3333333-3333-4333-8333-333333333311')$$,:'session_id'),'supply is recorded');
select lives_ok(format($$select public.record_cash_movement(%L,'withdrawal',200,null,null,'safe drop','f3333333-3333-4333-8333-333333333312')$$,:'session_id'),'withdrawal is recorded');
select lives_ok(format($$select public.record_cash_movement(%L,'supply',500,null,null,'opening reinforcement','f3333333-3333-4333-8333-333333333311')$$,:'session_id'),'movement replay is idempotent');
select is((select count(*)::integer from public.cash_movements),2,'movement replay creates no duplicate');
select throws_ok(format($$select public.record_cash_movement(%L,'supply',700,null,null,'changed','f3333333-3333-4333-8333-333333333311')$$,:'session_id'),'23505','CASH_MOVEMENT_IDEMPOTENCY_CONFLICT','changed movement replay conflicts');
select lives_ok(format($$select * from public.close_cash_session(%L,1250,'counted at close','f3333333-3333-4333-8333-333333333313')$$,:'session_id'),'cash closes with discrepancy');
select is((select expected_centavos from public.cash_session_closures),1300,'expected cash includes float, supply and withdrawal');
select is((select difference_centavos from public.cash_session_closures),-50,'closing difference is durable');
select throws_ok(format($$select public.record_cash_movement(%L,'supply',100,null,null,'late movement','f3333333-3333-4333-8333-333333333314')$$,:'session_id'),'23514','CASH_SESSION_NOT_OPEN','closed session rejects movements');
reset role;set local role postgres;select throws_ok($$delete from public.cash_movements$$,'55000','CASH_LEDGER_IMMUTABLE','cash movements are immutable');reset role;
select * from finish();rollback;
