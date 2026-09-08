select to_regprocedure('public.lock_open_cash_session(uuid)') is null as apply_cash_serialization \gset
\if :apply_cash_serialization
\ir ../migrations/20260908260000_cash_close_movement_serialization.sql
\endif
begin;select plan(4);
select function_privs_are('public','lock_open_cash_session',array['uuid'],'authenticated',array[]::text[],'client cannot call session lock helper');
select ok(pg_get_functiondef('public.record_cash_movement(uuid,text,integer,uuid,uuid,text,uuid)'::regprocedure) like '%lock_open_cash_session(p_session_id)%','movement locks session before insertion');
select ok(pg_get_functiondef('public.close_cash_session(uuid,integer,text,uuid)'::regprocedure) like '%from public.cash_sessions where id=p_session_id for update%','close locks the same session row');
select ok(position('lock_open_cash_session(p_session_id)' in pg_get_functiondef('public.record_cash_movement(uuid,text,integer,uuid,uuid,text,uuid)'::regprocedure))<position('insert into public.cash_movements' in pg_get_functiondef('public.record_cash_movement(uuid,text,integer,uuid,uuid,text,uuid)'::regprocedure)),'movement acquires session lock before append');
select * from finish();rollback;
