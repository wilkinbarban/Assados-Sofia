-- Phase 8a: settle delivery-exception receivables in full and emit a durable,
-- staff-only alert intent. This remains operational control, not accounting.
create table public.accounts_receivable_settlements(
 id uuid primary key default gen_random_uuid(),
 receivable_id uuid not null unique references public.accounts_receivable(id),
 pedido_id uuid not null unique references public.pedidos(id),
 idempotency_key uuid not null unique,
 amount_centavos integer not null check(amount_centavos>0),
 payment_method text not null check(payment_method in('cash','pix_external','card_external','bank_transfer_external')),
 actor_id uuid not null references auth.users(id),
 reason text not null check(nullif(btrim(reason),'') is not null),
 created_at timestamptz not null default now()
);
create table public.accounts_receivable_alerts(
 id uuid primary key default gen_random_uuid(),
 receivable_id uuid not null references public.accounts_receivable(id),
 event_type text not null check(event_type in('receivable_opened','receivable_settled')),
 event_id uuid not null,
 payload jsonb not null check(payload in(
  '{"message_key":"receivable_opened"}'::jsonb,
  '{"message_key":"receivable_settled"}'::jsonb
 )),
 created_at timestamptz not null default now(),
 unique(event_type,event_id)
);

create trigger accounts_receivable_settlements_immutable before update or delete on public.accounts_receivable_settlements
for each row execute function public.reject_accounts_receivable_mutation();
create trigger accounts_receivable_alerts_immutable before update or delete on public.accounts_receivable_alerts
for each row execute function public.reject_accounts_receivable_mutation();
alter table public.accounts_receivable_settlements enable row level security;
alter table public.accounts_receivable_alerts enable row level security;
revoke all on public.accounts_receivable_settlements,public.accounts_receivable_alerts from public,anon,authenticated,service_role;
grant select on public.accounts_receivable_settlements,public.accounts_receivable_alerts to authenticated;
create policy accounts_receivable_settlements_manager_read on public.accounts_receivable_settlements for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]));
create policy accounts_receivable_alerts_manager_read on public.accounts_receivable_alerts for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]));

create function public.accounts_receivable_opened_alert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.accounts_receivable_alerts(receivable_id,event_type,event_id,payload)
 values(new.receivable_id,'receivable_opened',new.id,jsonb_build_object('message_key','receivable_opened'))
 on conflict(event_type,event_id) do nothing;
 return new;
end $$;
create trigger accounts_receivable_opened_alert after insert on public.accounts_receivable_events
for each row when(new.event_type='delivery_without_approved_payment') execute function public.accounts_receivable_opened_alert();

create function public.liquidar_conta_receber(
 p_receivable_id uuid,p_amount_centavos integer,p_payment_method text,p_reason text,p_idempotency_key uuid
) returns table(receivable_id uuid,pedido_id uuid,amount_centavos integer,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_receivable public.accounts_receivable%rowtype;v_settlement public.accounts_receivable_settlements%rowtype;v_reason text:=nullif(btrim(p_reason),'');
begin
 if p_receivable_id is null or p_idempotency_key is null or p_amount_centavos is null or v_reason is null or p_payment_method not in('cash','pix_external','card_external','bank_transfer_external') then raise exception using errcode='22023',message='RECEIVABLE_SETTLEMENT_INVALID';end if;
 if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao]) then raise exception using errcode='42501',message='RECEIVABLE_SETTLEMENT_SUPERVISOR_REQUIRED';end if;
 select * into v_settlement from public.accounts_receivable_settlements s where s.idempotency_key=p_idempotency_key;
 if found then
  if v_settlement.receivable_id<>p_receivable_id or v_settlement.amount_centavos<>p_amount_centavos or v_settlement.payment_method<>p_payment_method or v_settlement.reason<>v_reason or v_settlement.actor_id<>v_actor then raise exception using errcode='23505',message='RECEIVABLE_SETTLEMENT_IDEMPOTENCY_CONFLICT';end if;
  return query select v_settlement.receivable_id,v_settlement.pedido_id,v_settlement.amount_centavos,true;return;
 end if;
 select * into v_receivable from public.accounts_receivable r where r.id=p_receivable_id for update;
 if not found then raise exception using errcode='P0002',message='RECEIVABLE_NOT_FOUND';end if;
 if exists(select 1 from public.accounts_receivable_settlements s where s.receivable_id=p_receivable_id) then raise exception using errcode='23505',message='RECEIVABLE_ALREADY_SETTLED';end if;
 if p_amount_centavos<>v_receivable.amount_total_centavos then raise exception using errcode='23514',message='RECEIVABLE_FULL_AMOUNT_REQUIRED';end if;
 perform public.registrar_status_pagamento(v_receivable.pedido_id,'aprovado','manual',null,'accounts_receivable_settlement',p_idempotency_key,null);
 insert into public.accounts_receivable_settlements(receivable_id,pedido_id,idempotency_key,amount_centavos,payment_method,actor_id,reason)
 values(p_receivable_id,v_receivable.pedido_id,p_idempotency_key,p_amount_centavos,p_payment_method,v_actor,v_reason) returning * into v_settlement;
 insert into public.accounts_receivable_alerts(receivable_id,event_type,event_id,payload) values(p_receivable_id,'receivable_settled',v_settlement.id,jsonb_build_object('message_key','receivable_settled'));
 return query select v_settlement.receivable_id,v_settlement.pedido_id,v_settlement.amount_centavos,false;
end $$;
revoke all on function public.liquidar_conta_receber(uuid,integer,text,text,uuid) from public,anon;
grant execute on function public.liquidar_conta_receber(uuid,integer,text,text,uuid) to authenticated;
