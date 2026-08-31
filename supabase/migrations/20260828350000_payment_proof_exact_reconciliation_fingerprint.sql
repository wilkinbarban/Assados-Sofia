-- Canonical request identity closes the idempotency-key replay ambiguity in leased reconciliation.
alter table public.payment_proof_reconciliations add column request_fingerprint text;

with canonical_requests as (
 select r.id,encode(extensions.digest(jsonb_build_object(
  'proof_id',r.proof_id,'order_ids',coalesce((
   select array_agg(l.pedido_id order by l.pedido_id)
   from public.payment_proof_order_links l where l.reconciliation_id=r.id
  ),array[]::uuid[])
 )::text,'sha256'),'hex') as request_fingerprint
 from public.payment_proof_reconciliations r
)
update public.payment_proof_reconciliations r
set request_fingerprint=c.request_fingerprint
from canonical_requests c where c.id=r.id;
alter table public.payment_proof_reconciliations alter column request_fingerprint set not null;

-- Replace as the migration owner that created the 34000 internal boundary.
-- RESET ROLE also makes this deterministic when a verification fixture has
-- temporarily assumed a data-seeding role.
reset role;
create or replace function public.reconcile_payment_proof_authorized(p_proof_id uuid,p_order_ids uuid[],p_idempotency_key uuid,p_actor_role public.tipo_funcao)
returns bigint language plpgsql security definer set search_path='' as $$
declare p public.payment_proofs%rowtype;r public.payment_proof_reconciliations%rowtype;o public.pedidos%rowtype;ids uuid[];total integer;canonical_fingerprint text;
begin
 if p_idempotency_key is null or coalesce(array_length(p_order_ids,1),0)=0 then raise exception using errcode='22023',message='PAYMENT_PROOF_ORDERS_REQUIRED';end if;
 select array_agg(distinct x order by x) into ids from unnest(p_order_ids)x;if array_length(ids,1)<>array_length(p_order_ids,1) then raise exception using errcode='22023',message='PAYMENT_PROOF_DUPLICATE_ORDER';end if;
 canonical_fingerprint:=encode(extensions.digest(jsonb_build_object('proof_id',p_proof_id,'order_ids',ids)::text,'sha256'),'hex');
 select * into p from public.payment_proofs where id=p_proof_id for update;if p.status<>'admitted' or p.confirmed_cents is null then raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_RECONCILABLE';end if;
 select * into r from public.payment_proof_reconciliations where idempotency_key=p_idempotency_key;
 if found then
  if r.request_fingerprint<>canonical_fingerprint then raise exception using errcode='23505',message='PAYMENT_PROOF_RECONCILIATION_CONFLICT';end if;
  return r.id;
 end if;
 if exists(select 1 from public.payment_proof_reconciliations where proof_id=p_proof_id) then raise exception using errcode='23505',message='PAYMENT_PROOF_ALREADY_RECONCILED';end if;
 if exists(select 1 from public.payment_proof_order_intents where proof_id=p_proof_id and not(pedido_id=any(ids))) then raise exception using errcode='23514',message='PAYMENT_PROOF_REQUESTED_ORDER_REQUIRED';end if;
 perform 1 from public.pedidos where id=any(ids) order by id for update;
 if (select count(*) from public.pedidos where id=any(ids))<>array_length(ids,1) then raise exception using message='PEDIDO_NAO_ENCONTRADO';end if;
 if exists(select 1 from public.pedidos where id=any(ids) and cliente_id<>p.customer_id) then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH';end if;
 if exists(select 1 from public.pedidos where id=any(ids) and (status_pagamento<>'pendente' or status='cancelado')) then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_INELIGIBLE';end if;
 select sum(total_pedido_centavos) into total from public.pedidos where id=any(ids);if total<>p.confirmed_cents then raise exception using errcode='23514',message='PAYMENT_PROOF_AMOUNT_MISMATCH';end if;
 insert into public.payment_proof_reconciliations(proof_id,actor_id,idempotency_key,confirmed_cents,actor_role,request_fingerprint) values(p_proof_id,auth.uid(),p_idempotency_key,p.confirmed_cents,p_actor_role,canonical_fingerprint) returning * into r;
 perform set_config('app.payment_proof_reconciliation_id',p_proof_id::text,true);
 for o in select * from public.pedidos where id=any(ids) order by id loop
  insert into public.payment_proof_order_intents(proof_id,pedido_id,requested_via) values(p_proof_id,o.id,'operator_reconciliation') on conflict do nothing;
  perform public.registrar_status_pagamento(o.id,'aprovado','manual',null,concat('digital_proof:',p_proof_id),gen_random_uuid(),null);
  insert into public.payment_proof_order_links values(r.id,p_proof_id,o.id,o.total_pedido_centavos);
 end loop;
 insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,metadata) values(p_proof_id,'reconciled',auth.uid(),p_actor_role,'operator',p.status,p.status,jsonb_build_object('provenance','digital_proof','order_ids',ids,'total_cents',total));
 return r.id;
end$$;
