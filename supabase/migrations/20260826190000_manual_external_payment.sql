create table public.manual_external_payment_approvals(
 id bigint generated always as identity primary key,idempotency_key uuid not null unique,actor_id uuid not null,
 provenance text not null default 'manual_external' check(provenance='manual_external'),
 method text not null check(method in('cash','pix_external','card_external','bank_transfer_external')),
 note text not null check(length(btrim(note)) between 4 and 500),confirmed_cents integer not null check(confirmed_cents>0),created_at timestamptz not null default now()
);
create table public.manual_external_payment_order_links(
 approval_id bigint not null references public.manual_external_payment_approvals(id),pedido_id uuid not null unique references public.pedidos(id),amount_cents integer not null check(amount_cents>0),primary key(approval_id,pedido_id)
);
alter table public.manual_external_payment_approvals enable row level security;alter table public.manual_external_payment_order_links enable row level security;
revoke all on public.manual_external_payment_approvals,public.manual_external_payment_order_links from public,anon,authenticated;
grant select on public.manual_external_payment_approvals,public.manual_external_payment_order_links to authenticated;
create policy manual_external_staff_read on public.manual_external_payment_approvals for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]));
create policy manual_external_links_staff_read on public.manual_external_payment_order_links for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]));

create function public.approve_manual_external_payment(p_order_ids uuid[],p_confirmed_cents integer,p_method text,p_note text,p_idempotency_key uuid) returns bigint
language plpgsql security definer set search_path='' as $$declare a public.manual_external_payment_approvals%rowtype;o public.pedidos%rowtype;ids uuid[];total integer;begin
 if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;
 if p_idempotency_key is null or coalesce(array_length(p_order_ids,1),0)=0 then raise exception using errcode='22023',message='MANUAL_EXTERNAL_ORDERS_REQUIRED';end if;
 if p_note is null or length(btrim(p_note)) not between 4 and 500 then raise exception using errcode='22023',message='MANUAL_EXTERNAL_NOTE_REQUIRED';end if;
 if p_method not in('cash','pix_external','card_external','bank_transfer_external') then raise exception using errcode='22023',message='MANUAL_EXTERNAL_METHOD_INVALID';end if;
 select array_agg(distinct x order by x) into ids from unnest(p_order_ids)x;if array_length(ids,1)<>array_length(p_order_ids,1) then raise exception using errcode='22023',message='MANUAL_EXTERNAL_DUPLICATE_ORDER';end if;
 select * into a from public.manual_external_payment_approvals where idempotency_key=p_idempotency_key;if found then if a.confirmed_cents<>p_confirmed_cents or a.method<>p_method or a.note<>btrim(p_note) or (select array_agg(pedido_id order by pedido_id) from public.manual_external_payment_order_links where approval_id=a.id)<>ids then raise exception using errcode='23505',message='MANUAL_EXTERNAL_REPLAY_CONFLICT';end if;return a.id;end if;
 perform 1 from public.pedidos where id=any(ids) order by id for update;if(select count(*) from public.pedidos where id=any(ids))<>array_length(ids,1) then raise exception using message='PEDIDO_NAO_ENCONTRADO';end if;
 if exists(select 1 from public.pedidos where id=any(ids) and(status_pagamento<>'pendente' or status='cancelado')) then raise exception using errcode='23514',message='MANUAL_EXTERNAL_ORDER_INELIGIBLE';end if;
 select sum(total_pedido_centavos) into total from public.pedidos where id=any(ids);if total<>p_confirmed_cents then raise exception using errcode='23514',message='MANUAL_EXTERNAL_AMOUNT_MISMATCH';end if;
 insert into public.manual_external_payment_approvals(idempotency_key,actor_id,method,note,confirmed_cents) values(p_idempotency_key,auth.uid(),p_method,btrim(p_note),p_confirmed_cents) returning * into a;
 for o in select * from public.pedidos where id=any(ids) order by id loop perform public.registrar_status_pagamento(o.id,'aprovado','manual',null,concat('manual_external:',p_method,':',btrim(p_note)),gen_random_uuid(),null);insert into public.manual_external_payment_order_links values(a.id,o.id,o.total_pedido_centavos);end loop;return a.id;end $$;
revoke all on function public.approve_manual_external_payment(uuid[],integer,text,text,uuid) from public,anon,authenticated;grant execute on function public.approve_manual_external_payment(uuid[],integer,text,text,uuid) to authenticated;
