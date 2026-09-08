select to_regprocedure('public.financial_idempotency_lock(uuid)') is null as apply_financial_lock \gset
\if :apply_financial_lock
\ir ../migrations/20260908250000_financial_idempotency_concurrency.sql
\endif
begin;select plan(9);
select function_privs_are('public','financial_idempotency_lock',array['uuid'],'authenticated',array[]::text[],'clients cannot call lock helper');
select ok((select indisunique from pg_index where indexrelid='public.cash_movements_order_payment_once'::regclass),'order cash payment is unique');select ok((select indisunique from pg_index where indexrelid='public.cash_movements_receivable_settlement_once'::regclass),'CxC cash settlement is unique');
select ok(pg_get_functiondef('public.liquidar_conta_receber(uuid,integer,text,text,uuid)'::regprocedure) like '%financial_idempotency_lock(p_idempotency_key)%','CxC settlement locks idempotency key');
select ok(pg_get_functiondef('public.record_cash_movement(uuid,text,integer,uuid,uuid,text,uuid)'::regprocedure) like '%financial_idempotency_lock(p_idempotency_key)%','cash movement locks idempotency key');
select ok(pg_get_functiondef('public.close_cash_session(uuid,integer,text,uuid)'::regprocedure) like '%financial_idempotency_lock(p_idempotency_key)%','cash close locks idempotency key');
select ok(pg_get_functiondef('public.record_financial_settlement(text,text,integer,integer,date,uuid)'::regprocedure) like '%financial_idempotency_lock(p_idempotency_key)%','provider settlement locks idempotency key');
select ok(pg_get_functiondef('public.record_bank_statement_entry(text,text,date,integer,uuid)'::regprocedure) like '%financial_idempotency_lock(p_idempotency_key)%','bank entry locks idempotency key');
select ok(pg_get_functiondef('public.reconcile_bank_settlement(uuid,uuid,text,uuid)'::regprocedure) like '%financial_idempotency_lock(p_idempotency_key)%','bank reconciliation locks idempotency key');
select * from finish();rollback;
