-- Phase 8b: append-only daily cash sessions and movements. Closing data is a
-- separate immutable fact; session rows are never updated.
create table public.cash_sessions(
 id uuid primary key default gen_random_uuid(),
 business_date date not null,
 opening_float_centavos integer not null check(opening_float_centavos>=0),
 opened_by uuid not null references auth.users(id),
 opened_at timestamptz not null default now()
);
create table public.cash_movements(
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.cash_sessions(id),
 movement_type text not null check(movement_type in('supply','withdrawal','order_payment','receivable_settlement')),
 amount_centavos integer not null check(amount_centavos>0),
 pedido_id uuid references public.pedidos(id),
 receivable_settlement_id uuid references public.accounts_receivable_settlements(id),
 actor_id uuid not null references auth.users(id),
 reason text not null check(nullif(btrim(reason),'') is not null),
 idempotency_key uuid not null unique,
 created_at timestamptz not null default now(),
 check((movement_type='order_payment')=(pedido_id is not null)),
 check((movement_type='receivable_settlement')=(receivable_settlement_id is not null))
);
create table public.cash_session_closures(
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null unique references public.cash_sessions(id),
 counted_centavos integer not null check(counted_centavos>=0),
 expected_centavos integer not null check(expected_centavos>=0),
 difference_centavos integer not null,
 closed_by uuid not null references auth.users(id),
 reason text not null check(nullif(btrim(reason),'') is not null),
 idempotency_key uuid not null unique,
 closed_at timestamptz not null default now()
);

create function public.reject_cash_ledger_mutation() returns trigger language plpgsql set search_path='' as $$begin raise exception using errcode='55000',message='CASH_LEDGER_IMMUTABLE';end$$;
create trigger cash_sessions_immutable before update or delete on public.cash_sessions for each row execute function public.reject_cash_ledger_mutation();
create trigger cash_movements_immutable before update or delete on public.cash_movements for each row execute function public.reject_cash_ledger_mutation();
create trigger cash_closures_immutable before update or delete on public.cash_session_closures for each row execute function public.reject_cash_ledger_mutation();
alter table public.cash_sessions enable row level security;alter table public.cash_movements enable row level security;alter table public.cash_session_closures enable row level security;
revoke all on public.cash_sessions,public.cash_movements,public.cash_session_closures from public,anon,authenticated,service_role;
grant select on public.cash_sessions,public.cash_movements,public.cash_session_closures to authenticated;
create policy cash_sessions_manager_read on public.cash_sessions for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]));
create policy cash_movements_manager_read on public.cash_movements for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]));
create policy cash_closures_manager_read on public.cash_session_closures for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]));

create function public.open_cash_session(p_business_date date,p_opening_float_centavos integer)
returns uuid language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
 if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]) then raise exception using errcode='42501',message='CASH_MANAGER_REQUIRED';end if;
 if p_business_date is null or p_opening_float_centavos<0 then raise exception using errcode='22023',message='CASH_OPEN_INVALID';end if;
 perform pg_advisory_xact_lock(736451);
 if exists(select 1 from public.cash_sessions s where not exists(select 1 from public.cash_session_closures c where c.session_id=s.id)) then raise exception using errcode='23505',message='CASH_SESSION_ALREADY_OPEN';end if;
 insert into public.cash_sessions(business_date,opening_float_centavos,opened_by) values(p_business_date,p_opening_float_centavos,auth.uid()) returning id into v_id;return v_id;
end$$;
create function public.record_cash_movement(p_session_id uuid,p_type text,p_amount_centavos integer,p_pedido_id uuid,p_settlement_id uuid,p_reason text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$declare v public.cash_movements%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin
 if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]) then raise exception using errcode='42501',message='CASH_MANAGER_REQUIRED';end if;
 select * into v from public.cash_movements where idempotency_key=p_idempotency_key;if found then if v.session_id<>p_session_id or v.movement_type<>p_type or v.amount_centavos<>p_amount_centavos or v.pedido_id is distinct from p_pedido_id or v.receivable_settlement_id is distinct from p_settlement_id or v.reason<>v_reason or v.actor_id<>auth.uid() then raise exception using errcode='23505',message='CASH_MOVEMENT_IDEMPOTENCY_CONFLICT';end if;return v.id;end if;
 if p_amount_centavos<=0 or v_reason is null or p_type not in('supply','withdrawal','order_payment','receivable_settlement') then raise exception using errcode='22023',message='CASH_MOVEMENT_INVALID';end if;
 if not exists(select 1 from public.cash_sessions s where s.id=p_session_id and not exists(select 1 from public.cash_session_closures c where c.session_id=s.id)) then raise exception using errcode='23514',message='CASH_SESSION_NOT_OPEN';end if;
 insert into public.cash_movements(session_id,movement_type,amount_centavos,pedido_id,receivable_settlement_id,actor_id,reason,idempotency_key) values(p_session_id,p_type,p_amount_centavos,p_pedido_id,p_settlement_id,auth.uid(),v_reason,p_idempotency_key) returning * into v;return v.id;
end$$;
create function public.close_cash_session(p_session_id uuid,p_counted_centavos integer,p_reason text,p_idempotency_key uuid)
returns table(expected_centavos integer,difference_centavos integer,idempotent boolean) language plpgsql security definer set search_path='' as $$declare v public.cash_session_closures%rowtype;v_opening integer;v_expected integer;v_reason text:=nullif(btrim(p_reason),'');begin
 if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]) then raise exception using errcode='42501',message='CASH_MANAGER_REQUIRED';end if;
 select * into v from public.cash_session_closures where idempotency_key=p_idempotency_key;if found then if v.session_id<>p_session_id or v.counted_centavos<>p_counted_centavos or v.reason<>v_reason or v.closed_by<>auth.uid() then raise exception using errcode='23505',message='CASH_CLOSE_IDEMPOTENCY_CONFLICT';end if;return query select v.expected_centavos,v.difference_centavos,true;return;end if;
 if p_counted_centavos<0 or v_reason is null then raise exception using errcode='22023',message='CASH_CLOSE_INVALID';end if;
 select opening_float_centavos into v_opening from public.cash_sessions where id=p_session_id for update;if not found then raise exception using errcode='P0002',message='CASH_SESSION_NOT_FOUND';end if;
 if exists(select 1 from public.cash_session_closures where session_id=p_session_id) then raise exception using errcode='23505',message='CASH_SESSION_ALREADY_CLOSED';end if;
 select v_opening+coalesce(sum(case when movement_type='withdrawal' then -amount_centavos else amount_centavos end),0) into v_expected from public.cash_movements where session_id=p_session_id;
 insert into public.cash_session_closures(session_id,counted_centavos,expected_centavos,difference_centavos,closed_by,reason,idempotency_key) values(p_session_id,p_counted_centavos,v_expected,p_counted_centavos-v_expected,auth.uid(),v_reason,p_idempotency_key) returning * into v;return query select v.expected_centavos,v.difference_centavos,false;
end$$;
revoke all on function public.open_cash_session(date,integer),public.record_cash_movement(uuid,text,integer,uuid,uuid,text,uuid),public.close_cash_session(uuid,integer,text,uuid) from public,anon;
grant execute on function public.open_cash_session(date,integer),public.record_cash_movement(uuid,text,integer,uuid,uuid,text,uuid),public.close_cash_session(uuid,integer,text,uuid) to authenticated;
