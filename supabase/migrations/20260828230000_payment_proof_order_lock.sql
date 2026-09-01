-- Forward-only authority connecting payment-proof review to order availability.
-- A lock is derived from an active proof + intent + pending order; no mutable
-- boolean is stored on pedidos.
create table public.payment_proof_order_intents (
  proof_id uuid not null references public.payment_proofs(id) on delete restrict,
  pedido_id uuid not null references public.pedidos(id) on delete restrict,
  requested_at timestamptz not null default now(),
  requested_via text not null default 'customer_web'
    check (requested_via in ('customer_web','operator_reconciliation','migration')),
  primary key (proof_id, pedido_id)
);
create index payment_proof_order_intents_order_idx
  on public.payment_proof_order_intents(pedido_id, proof_id);
alter table public.payment_proof_order_intents enable row level security;
revoke all on public.payment_proof_order_intents from public, anon, authenticated;
grant select on public.payment_proof_order_intents to authenticated;
create policy payment_proof_order_intents_staff_read
  on public.payment_proof_order_intents for select to authenticated
  using (public.tem_funcoes(array[
    'admin'::public.tipo_funcao,
    'supervisor'::public.tipo_funcao,
    'vendedor'::public.tipo_funcao
  ]));

create or replace function public.is_order_payment_proof_locked(p_pedido_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1
    from public.payment_proof_order_intents intent
    join public.payment_proofs proof on proof.id = intent.proof_id
    join public.pedidos pedido on pedido.id = intent.pedido_id
    where intent.pedido_id = p_pedido_id
      and pedido.status_pagamento = 'pendente'
      and pedido.status <> 'cancelado'
      and proof.status in ('received','identity_pending','processing','review','admitted')
  )
$$;

create or replace function public.assert_order_payment_available(p_pedido_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_order public.pedidos%rowtype;
begin
  select * into v_order from public.pedidos where id=p_pedido_id for update;
  if not found then
    raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO';
  end if;
  if v_order.status='cancelado' or v_order.status_pagamento<>'pendente' then
    raise exception using errcode='23514',message='ORDER_PAYMENT_ROUTE_INELIGIBLE';
  end if;
  if public.is_order_payment_proof_locked(p_pedido_id) then
    raise exception using errcode='23514',message='ORDER_PAYMENT_PROOF_ALREADY_PENDING';
  end if;
  return true;
end $$;

create or replace function public.list_order_payment_proof_locks(p_order_ids uuid[])
returns table(pedido_id uuid,proof_id uuid,proof_status text,locked_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';
  end if;
  return query
  select intent.pedido_id,proof.id,proof.status,intent.requested_at
  from public.payment_proof_order_intents intent
  join public.payment_proofs proof on proof.id=intent.proof_id
  join public.pedidos pedido on pedido.id=intent.pedido_id
  where intent.pedido_id=any(coalesce(p_order_ids,'{}'::uuid[]))
    and pedido.status_pagamento='pendente'
    and pedido.status<>'cancelado'
    and proof.status in ('received','identity_pending','processing','review','admitted')
    and (
      public.tem_funcoes(array[
        'admin'::public.tipo_funcao,
        'supervisor'::public.tipo_funcao,
        'vendedor'::public.tipo_funcao
      ])
      or exists (
        select 1 from public.clientes customer
        where customer.id=pedido.cliente_id and customer.usuario_id=auth.uid()
      )
    )
  order by intent.requested_at desc;
end $$;

revoke all on function public.is_order_payment_proof_locked(uuid) from public,anon,authenticated;
revoke all on function public.assert_order_payment_available(uuid) from public,anon,authenticated;
revoke all on function public.list_order_payment_proof_locks(uuid[]) from public,anon,authenticated;
grant execute on function public.is_order_payment_proof_locked(uuid) to authenticated,service_role;
grant execute on function public.assert_order_payment_available(uuid) to authenticated,service_role;
grant execute on function public.list_order_payment_proof_locks(uuid[]) to authenticated;

create function public.enforce_order_payment_proof_lock()
returns trigger language plpgsql set search_path='' as $$
declare v_reconciliation_proof text:=current_setting('app.payment_proof_reconciliation_id',true);
begin
  if old.status_pagamento='pendente'
    and new.status_pagamento is distinct from old.status_pagamento
    and public.is_order_payment_proof_locked(old.id)
    and not (
      v_reconciliation_proof ~* '^[0-9a-f-]{36}$'
      and exists (
        select 1 from public.payment_proof_order_intents intent
        where intent.pedido_id=old.id
          and intent.proof_id=v_reconciliation_proof::uuid
      )
    ) then
    raise exception using errcode='23514',message='ORDER_PAYMENT_PROOF_ALREADY_PENDING';
  end if;
  return new;
end $$;
create trigger pedidos_payment_proof_lock
before update of status_pagamento on public.pedidos
for each row execute function public.enforce_order_payment_proof_lock();
revoke all on function public.enforce_order_payment_proof_lock()
  from public,anon,authenticated;

-- Web intake overload: the pedido row is locked before checking/inserting, so
-- concurrent uploads for the same order have a single winner.
create function public.admit_payment_proof_intake(
  p_channel text,p_delivery_key text,p_customer_id uuid,p_sender_reference text,
  p_storage_key text,p_size_bytes bigint,p_mime_type text,p_order_id uuid
) returns table(proof_id uuid,status text,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare v public.payment_proofs%rowtype;v_order public.pedidos%rowtype;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then
    raise exception using errcode='42501',message='PAYMENT_PROOF_SERVICE_ROLE_REQUIRED';
  end if;
  if p_channel not in ('web','telegram','whatsapp')
    or nullif(btrim(p_delivery_key),'') is null
    or nullif(btrim(p_storage_key),'') is null
    or p_mime_type<>'application/pdf'
    or p_size_bytes<5 or p_size_bytes>5242880 then
    raise exception using errcode='22023',message='PAYMENT_PROOF_INTAKE_INVALID';
  end if;
  if p_channel='web' and p_order_id is null then
    raise exception using errcode='22023',message='PAYMENT_PROOF_ORDER_REQUIRED';
  end if;

  if p_order_id is not null then
    select * into v_order from public.pedidos where id=p_order_id for update;
    if not found then raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO';end if;
    if p_customer_id is null or v_order.cliente_id<>p_customer_id then
      raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH';
    end if;
    if v_order.status='cancelado' or v_order.status_pagamento<>'pendente' then
      raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_INELIGIBLE';
    end if;
  end if;

  select * into v from public.payment_proofs
  where channel=p_channel and delivery_key=btrim(p_delivery_key) for update;
  if found then
    if v.customer_id is distinct from p_customer_id
      or v.original_storage_key<>btrim(p_storage_key)
      or v.size_bytes<>p_size_bytes then
      raise exception using errcode='23505',message='PAYMENT_PROOF_DELIVERY_CONFLICT';
    end if;
    if p_order_id is not null and not exists (
      select 1 from public.payment_proof_order_intents
      where proof_id=v.id and pedido_id=p_order_id
    ) then
      raise exception using errcode='23505',message='PAYMENT_PROOF_DELIVERY_ORDER_CONFLICT';
    end if;
    return query select v.id,v.status,true;return;
  end if;

  if p_order_id is not null and public.is_order_payment_proof_locked(p_order_id) then
    raise exception using errcode='23514',message='ORDER_PAYMENT_PROOF_ALREADY_PENDING';
  end if;

  insert into public.payment_proofs(
    customer_id,channel,delivery_key,sender_reference,status,
    original_storage_key,mime_type,size_bytes
  ) values (
    p_customer_id,p_channel,btrim(p_delivery_key),
    nullif(btrim(p_sender_reference),''),
    case when p_customer_id is null then 'identity_pending' else 'received' end,
    btrim(p_storage_key),p_mime_type,p_size_bytes
  ) returning * into v;
  if p_order_id is not null then
    insert into public.payment_proof_order_intents(proof_id,pedido_id)
    values(v.id,p_order_id);
  end if;
  insert into public.payment_proof_events(
    proof_id,event_type,source,result_status,metadata
  ) values (
    v.id,'intake_received',p_channel,v.status,
    jsonb_build_object(
      'identity_resolved',p_customer_id is not null,
      'requested_order_id',p_order_id
    )
  );
  return query select v.id,v.status,false;
end $$;
revoke all on function public.admit_payment_proof_intake(
  text,text,uuid,text,text,bigint,text,uuid
) from public,anon,authenticated;
grant execute on function public.admit_payment_proof_intake(
  text,text,uuid,text,text,bigint,text,uuid
) to service_role;

-- Manual external payments cannot compete with active digital evidence.
create or replace function public.approve_manual_external_payment(
  p_order_ids uuid[],p_confirmed_cents integer,p_method text,p_note text,p_idempotency_key uuid
) returns bigint language plpgsql security definer set search_path='' as $$
declare a public.manual_external_payment_approvals%rowtype;o public.pedidos%rowtype;ids uuid[];total integer;
begin
  if auth.uid() is null or not public.tem_funcoes(array[
    'admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao
  ]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;
  if p_idempotency_key is null or coalesce(array_length(p_order_ids,1),0)=0 then raise exception using errcode='22023',message='MANUAL_EXTERNAL_ORDERS_REQUIRED';end if;
  if p_note is null or length(btrim(p_note)) not between 4 and 500 then raise exception using errcode='22023',message='MANUAL_EXTERNAL_NOTE_REQUIRED';end if;
  if p_method not in('cash','pix_external','card_external','bank_transfer_external') then raise exception using errcode='22023',message='MANUAL_EXTERNAL_METHOD_INVALID';end if;
  select array_agg(distinct x order by x) into ids from unnest(p_order_ids)x;
  if array_length(ids,1)<>array_length(p_order_ids,1) then raise exception using errcode='22023',message='MANUAL_EXTERNAL_DUPLICATE_ORDER';end if;
  select * into a from public.manual_external_payment_approvals where idempotency_key=p_idempotency_key;
  if found then
    if a.confirmed_cents<>p_confirmed_cents or a.method<>p_method or a.note<>btrim(p_note)
      or (select array_agg(pedido_id order by pedido_id) from public.manual_external_payment_order_links where approval_id=a.id)<>ids then
      raise exception using errcode='23505',message='MANUAL_EXTERNAL_REPLAY_CONFLICT';
    end if;
    return a.id;
  end if;
  perform 1 from public.pedidos where id=any(ids) order by id for update;
  if(select count(*) from public.pedidos where id=any(ids))<>array_length(ids,1) then raise exception using message='PEDIDO_NAO_ENCONTRADO';end if;
  if exists(select 1 from unnest(ids) id where public.is_order_payment_proof_locked(id)) then
    raise exception using errcode='23514',message='ORDER_PAYMENT_PROOF_ALREADY_PENDING';
  end if;
  if exists(select 1 from public.pedidos where id=any(ids) and(status_pagamento<>'pendente' or status='cancelado')) then raise exception using errcode='23514',message='MANUAL_EXTERNAL_ORDER_INELIGIBLE';end if;
  select sum(total_pedido_centavos) into total from public.pedidos where id=any(ids);
  if total<>p_confirmed_cents then raise exception using errcode='23514',message='MANUAL_EXTERNAL_AMOUNT_MISMATCH';end if;
  insert into public.manual_external_payment_approvals(
    idempotency_key,actor_id,method,note,confirmed_cents
  ) values(p_idempotency_key,auth.uid(),p_method,btrim(p_note),p_confirmed_cents) returning * into a;
  for o in select * from public.pedidos where id=any(ids) order by id loop
    perform public.registrar_status_pagamento(
      o.id,'aprovado','manual',null,concat('manual_external:',p_method,':',btrim(p_note)),
      gen_random_uuid(),null
    );
    insert into public.manual_external_payment_order_links values(a.id,o.id,o.total_pedido_centavos);
  end loop;
  return a.id;
end $$;
revoke all on function public.approve_manual_external_payment(uuid[],integer,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.approve_manual_external_payment(uuid[],integer,text,text,uuid)
  to authenticated;

-- Exact reconciliation must include every early customer-selected order. It
-- may add more pending orders of the same customer.
create or replace function public.reconcile_payment_proof(
  p_proof_id uuid,p_order_ids uuid[],p_idempotency_key uuid
) returns bigint language plpgsql security definer set search_path='' as $$
declare p public.payment_proofs%rowtype;r public.payment_proof_reconciliations%rowtype;o public.pedidos%rowtype;ids uuid[];total integer;
begin
  if auth.uid() is null or not public.tem_funcoes(array[
    'admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao
  ]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO';end if;
  if p_idempotency_key is null or coalesce(array_length(p_order_ids,1),0)=0 then raise exception using errcode='22023',message='PAYMENT_PROOF_ORDERS_REQUIRED';end if;
  select array_agg(distinct x order by x) into ids from unnest(p_order_ids)x;
  if array_length(ids,1)<>array_length(p_order_ids,1) then raise exception using errcode='22023',message='PAYMENT_PROOF_DUPLICATE_ORDER';end if;
  select * into p from public.payment_proofs where id=p_proof_id for update;
  if p.status<>'admitted' or p.confirmed_cents is null then raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_RECONCILABLE';end if;
  select * into r from public.payment_proof_reconciliations where idempotency_key=p_idempotency_key;
  if found then
    if r.proof_id<>p_proof_id then raise exception using errcode='23505',message='PAYMENT_PROOF_RECONCILIATION_CONFLICT';end if;
    return r.id;
  end if;
  if exists(select 1 from public.payment_proof_reconciliations where proof_id=p_proof_id) then raise exception using errcode='23505',message='PAYMENT_PROOF_ALREADY_RECONCILED';end if;
  if exists(
    select 1 from public.payment_proof_order_intents
    where proof_id=p_proof_id and not(pedido_id=any(ids))
  ) then raise exception using errcode='23514',message='PAYMENT_PROOF_REQUESTED_ORDER_REQUIRED';end if;
  perform 1 from public.pedidos where id=any(ids) order by id for update;
  if(select count(*) from public.pedidos where id=any(ids))<>array_length(ids,1) then raise exception using message='PEDIDO_NAO_ENCONTRADO';end if;
  if exists(select 1 from public.pedidos where id=any(ids) and cliente_id<>p.customer_id) then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH';end if;
  if exists(select 1 from public.pedidos where id=any(ids) and(status_pagamento<>'pendente' or status='cancelado')) then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_INELIGIBLE';end if;
  select sum(total_pedido_centavos) into total from public.pedidos where id=any(ids);
  if total<>p.confirmed_cents then raise exception using errcode='23514',message='PAYMENT_PROOF_AMOUNT_MISMATCH';end if;
  insert into public.payment_proof_reconciliations(
    proof_id,actor_id,idempotency_key,confirmed_cents
  ) values(p_proof_id,auth.uid(),p_idempotency_key,p.confirmed_cents) returning * into r;
  perform set_config('app.payment_proof_reconciliation_id',p_proof_id::text,true);
  for o in select * from public.pedidos where id=any(ids) order by id loop
    insert into public.payment_proof_order_intents(
      proof_id,pedido_id,requested_via
    ) values(p_proof_id,o.id,'operator_reconciliation') on conflict do nothing;
    perform public.registrar_status_pagamento(
      o.id,'aprovado','manual',null,concat('digital_proof:',p_proof_id),
      gen_random_uuid(),null
    );
    insert into public.payment_proof_order_links values(r.id,p_proof_id,o.id,o.total_pedido_centavos);
  end loop;
  insert into public.payment_proof_events(
    proof_id,event_type,actor_id,source,previous_status,result_status,metadata
  ) values(
    p_proof_id,'reconciled',auth.uid(),'operator',p.status,p.status,
    jsonb_build_object('provenance','digital_proof','order_ids',ids,'total_cents',total)
  );
  return r.id;
end $$;
revoke all on function public.reconcile_payment_proof(uuid,uuid[],uuid)
  from public,anon,authenticated;
grant execute on function public.reconcile_payment_proof(uuid,uuid[],uuid)
  to authenticated;

-- Safe, unequivocal backfill: only legacy web keys containing one exact order
-- UUID owned by the proof customer, with a still-pending eligible order.
insert into public.payment_proof_order_intents(proof_id,pedido_id,requested_via)
select proof.id,(regexp_match(proof.delivery_key,
  '^web-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-'
))[1]::uuid,'migration'
from public.payment_proofs proof
join public.pedidos pedido on pedido.id=(regexp_match(proof.delivery_key,
  '^web-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-'
))[1]::uuid
where proof.channel='web'
  and proof.delivery_key ~ '^web-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-'
  and proof.status in ('received','identity_pending','processing','review','admitted')
  and pedido.cliente_id=proof.customer_id
  and pedido.status_pagamento='pendente'
  and pedido.status<>'cancelado'
on conflict do nothing;
