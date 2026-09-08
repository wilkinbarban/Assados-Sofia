-- Movements and closure serialize on the same cash-session row, preventing a
-- movement from committing after expected cash has already been calculated.
create or replace function public.lock_open_cash_session(p_session_id uuid) returns void language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
 select s.id into v_id from public.cash_sessions s where s.id=p_session_id for update;
 if v_id is null or exists(select 1 from public.cash_session_closures c where c.session_id=p_session_id) then raise exception using errcode='23514',message='CASH_SESSION_NOT_OPEN';end if;
end$$;
revoke all on function public.lock_open_cash_session(uuid) from public,anon,authenticated,service_role;
do $$declare v_oid oid;v_definition text;v_updated text;begin
 v_oid:='public.record_cash_movement(uuid,text,integer,uuid,uuid,text,uuid)'::regprocedure;
 v_definition:=pg_get_functiondef(v_oid);
 v_updated:=replace(v_definition,$needle$if not exists(select 1 from public.cash_sessions s where s.id=p_session_id and not exists(select 1 from public.cash_session_closures c where c.session_id=s.id)) then raise exception using errcode='23514',message='CASH_SESSION_NOT_OPEN';end if;$needle$,'perform public.lock_open_cash_session(p_session_id);');
 if v_updated=v_definition then raise exception 'CASH_SESSION_LOCK_PATCH_FAILED';end if;execute v_updated;
end$$;
