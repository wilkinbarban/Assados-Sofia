create table public.payment_proof_reconciliations(
 id bigint generated always as identity primary key,proof_id uuid not null unique references public.payment_proofs(id) on delete restrict,
 actor_id uuid not null,idempotency_key uuid not null unique,confirmed_cents integer not null check(confirmed_cents>=0),
 provenance text not null default 'digital_proof' check(provenance='digital_proof'),created_at timestamptz not null default now()
);
create table public.payment_proof_order_links(
 reconciliation_id bigint not null references public.payment_proof_reconciliations(id) on delete restrict,
 proof_id uuid not null references public.payment_proofs(id) on delete restrict,
 pedido_id uuid not null unique references public.pedidos(id) on delete restrict,
 amount_cents integer not null check(amount_cents>=0),primary key(reconciliation_id,pedido_id)
);
alter table public.payment_proof_reconciliations enable row level security;alter table public.payment_proof_order_links enable row level security;
revoke all on public.payment_proof_reconciliations,public.payment_proof_order_links from public,anon,authenticated;
grant select on public.payment_proof_reconciliations,public.payment_proof_order_links to authenticated;
create policy payment_proof_reconciliation_staff_read on public.payment_proof_reconciliations for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]));
create policy payment_proof_order_links_staff_read on public.payment_proof_order_links for select to authenticated using(public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]));

create function public.reconcile_payment_proof(p_proof_id uuid,p_order_ids uuid[],p_idempotency_key uuid) returns bigint
language plpgsql security definer set search_path='' as $$declare p public.payment_proofs%rowtype;r public.payment_proof_reconciliations%rowtype;o public.pedidos%rowtype;ids uuid[];total integer;begin
 if auth.uid() is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;
 if p_idempotency_key is null or coalesce(array_length(p_order_ids,1),0)=0 then raise exception using errcode='22023',message='PAYMENT_PROOF_ORDERS_REQUIRED';end if;
 select array_agg(distinct x order by x) into ids from unnest(p_order_ids)x;if array_length(ids,1)<>array_length(p_order_ids,1) then raise exception using errcode='22023',message='PAYMENT_PROOF_DUPLICATE_ORDER';end if;
 select * into p from public.payment_proofs where id=p_proof_id for update;if p.status<>'admitted' or p.confirmed_cents is null then raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_RECONCILABLE';end if;
 select * into r from public.payment_proof_reconciliations where idempotency_key=p_idempotency_key;
 if found then if r.proof_id<>p_proof_id then raise exception using errcode='23505',message='PAYMENT_PROOF_RECONCILIATION_CONFLICT';end if;return r.id;end if;
 if exists(select 1 from public.payment_proof_reconciliations where proof_id=p_proof_id) then raise exception using errcode='23505',message='PAYMENT_PROOF_ALREADY_RECONCILED';end if;
 perform 1 from public.pedidos where id=any(ids) order by id for update;
 if (select count(*) from public.pedidos where id=any(ids))<>array_length(ids,1) then raise exception using message='PEDIDO_NAO_ENCONTRADO';end if;
 if exists(select 1 from public.pedidos where id=any(ids) and cliente_id<>p.customer_id) then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH';end if;
 if exists(select 1 from public.pedidos where id=any(ids) and (status_pagamento<>'pendente' or status='cancelado')) then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_INELIGIBLE';end if;
 select sum(total_pedido_centavos) into total from public.pedidos where id=any(ids);if total<>p.confirmed_cents then raise exception using errcode='23514',message='PAYMENT_PROOF_AMOUNT_MISMATCH';end if;
 insert into public.payment_proof_reconciliations(proof_id,actor_id,idempotency_key,confirmed_cents) values(p_proof_id,auth.uid(),p_idempotency_key,p.confirmed_cents) returning * into r;
 for o in select * from public.pedidos where id=any(ids) order by id loop
  perform public.registrar_status_pagamento(o.id,'aprovado','manual',null,concat('digital_proof:',p_proof_id),gen_random_uuid(),null);
  insert into public.payment_proof_order_links values(r.id,p_proof_id,o.id,o.total_pedido_centavos);
 end loop;
 insert into public.payment_proof_events(proof_id,event_type,actor_id,source,previous_status,result_status,metadata) values(p_proof_id,'reconciled',auth.uid(),'operator',p.status,p.status,jsonb_build_object('provenance','digital_proof','order_ids',ids,'total_cents',total));
 return r.id;end $$;
revoke all on function public.reconcile_payment_proof(uuid,uuid[],uuid) from public,anon,authenticated;grant execute on function public.reconcile_payment_proof(uuid,uuid[],uuid) to authenticated;
