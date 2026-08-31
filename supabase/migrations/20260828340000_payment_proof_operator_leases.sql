-- Proof-scoped operator leases and immutable actor-role audit snapshots.
-- Mutation boundaries pass their locked capability snapshot explicitly; a column
-- default would permit a later, independent authorization read.
alter table public.payment_proof_events add column actor_role public.tipo_funcao;
alter table public.payment_proof_reconciliations add column actor_role public.tipo_funcao;

create table public.payment_proof_leases(
 proof_id uuid primary key references public.payment_proofs(id) on delete cascade,
 holder_actor_id uuid not null,
 token_digest text not null check(token_digest ~ '^[0-9a-f]{64}$'),
 acquired_at timestamptz not null default now(),
 expires_at timestamptz not null check(expires_at>acquired_at)
);
alter table public.payment_proof_leases enable row level security;
revoke all on public.payment_proof_leases from public,anon,authenticated;

-- Every capability boundary takes this row lock first.  The lock lasts until the
-- enclosing mutation transaction commits, preventing a role/deactivation TOCTOU.
create function public.require_active_payment_proof_actor_role()
returns public.tipo_funcao language plpgsql security definer set search_path='' as $$
declare role_at_action public.tipo_funcao;
begin
 select p.funcao into role_at_action from public.perfis p where p.id=auth.uid()
  and p.ativo and p.funcao in ('admin','supervisor','vendedor') for update;
 if role_at_action is null then
  raise exception using errcode='42501',message='PAYMENT_PROOF_OPERATOR_REQUIRED';
 end if;
 return role_at_action;
end$$;
revoke all on function public.require_active_payment_proof_actor_role() from public,anon,authenticated;

create function public.acquire_payment_proof_lease(p_proof_id uuid)
returns table(lease_token text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();token text:=encode(extensions.gen_random_bytes(32),'hex');until_at timestamptz:=now()+interval '5 minutes';
begin
 perform public.require_active_payment_proof_actor_role();
 perform 1 from public.payment_proofs where id=p_proof_id for update;
 if not found then raise exception using errcode='P0002',message='PAYMENT_PROOF_NOT_FOUND';end if;
 insert into public.payment_proof_leases(proof_id,holder_actor_id,token_digest,expires_at)
 values(p_proof_id,actor,encode(extensions.digest(token,'sha256'),'hex'),until_at)
 on conflict(proof_id) do update set holder_actor_id=excluded.holder_actor_id,
  token_digest=excluded.token_digest,acquired_at=now(),expires_at=excluded.expires_at
 where public.payment_proof_leases.expires_at<=now()
    or public.payment_proof_leases.holder_actor_id=excluded.holder_actor_id;
 if not found then raise exception using errcode='55P03',message='PAYMENT_PROOF_LEASE_CONFLICT';end if;
 return query select token,until_at;
end$$;

create function public.assert_payment_proof_lease(p_proof_id uuid,p_lease_token text)
returns void language plpgsql security definer set search_path='' as $$
declare lease public.payment_proof_leases%rowtype;
begin
 select * into lease from public.payment_proof_leases where proof_id=p_proof_id for update;
 if not found or lease.holder_actor_id<>auth.uid()
   or lease.token_digest<>encode(extensions.digest(coalesce(p_lease_token,''),'sha256'),'hex') then
  raise exception using errcode='42501',message='PAYMENT_PROOF_LEASE_NOT_OWNED';
 end if;
 if lease.expires_at<=now() then raise exception using errcode='42501',message='PAYMENT_PROOF_LEASE_EXPIRED';end if;
end$$;

create function public.release_payment_proof_lease(p_proof_id uuid,p_lease_token text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_payment_proof_actor_role();
 perform public.assert_payment_proof_lease(p_proof_id,p_lease_token);
 delete from public.payment_proof_leases where proof_id=p_proof_id;
 return true;
end$$;

-- The legacy signature is no longer an authenticated mutation boundary.
revoke execute on function public.reconcile_payment_proof(uuid,uuid[],uuid) from authenticated;
create function public.reconcile_payment_proof_authorized(p_proof_id uuid,p_order_ids uuid[],p_idempotency_key uuid,p_actor_role public.tipo_funcao)
returns bigint language plpgsql security definer set search_path='' as $$
declare p public.payment_proofs%rowtype;r public.payment_proof_reconciliations%rowtype;o public.pedidos%rowtype;ids uuid[];total integer;
begin
 if p_idempotency_key is null or coalesce(array_length(p_order_ids,1),0)=0 then raise exception using errcode='22023',message='PAYMENT_PROOF_ORDERS_REQUIRED';end if;
 select array_agg(distinct x order by x) into ids from unnest(p_order_ids)x;if array_length(ids,1)<>array_length(p_order_ids,1) then raise exception using errcode='22023',message='PAYMENT_PROOF_DUPLICATE_ORDER';end if;
 select * into p from public.payment_proofs where id=p_proof_id for update;if p.status<>'admitted' or p.confirmed_cents is null then raise exception using errcode='23514',message='PAYMENT_PROOF_NOT_RECONCILABLE';end if;
 select * into r from public.payment_proof_reconciliations where idempotency_key=p_idempotency_key;
 if found then if r.proof_id<>p_proof_id then raise exception using errcode='23505',message='PAYMENT_PROOF_RECONCILIATION_CONFLICT';end if;return r.id;end if;
 if exists(select 1 from public.payment_proof_reconciliations where proof_id=p_proof_id) then raise exception using errcode='23505',message='PAYMENT_PROOF_ALREADY_RECONCILED';end if;
 if exists(select 1 from public.payment_proof_order_intents where proof_id=p_proof_id and not(pedido_id=any(ids))) then raise exception using errcode='23514',message='PAYMENT_PROOF_REQUESTED_ORDER_REQUIRED';end if;
 perform 1 from public.pedidos where id=any(ids) order by id for update;
 if (select count(*) from public.pedidos where id=any(ids))<>array_length(ids,1) then raise exception using message='PEDIDO_NAO_ENCONTRADO';end if;
 if exists(select 1 from public.pedidos where id=any(ids) and cliente_id<>p.customer_id) then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH';end if;
 if exists(select 1 from public.pedidos where id=any(ids) and (status_pagamento<>'pendente' or status='cancelado')) then raise exception using errcode='23514',message='PAYMENT_PROOF_ORDER_INELIGIBLE';end if;
 select sum(total_pedido_centavos) into total from public.pedidos where id=any(ids);if total<>p.confirmed_cents then raise exception using errcode='23514',message='PAYMENT_PROOF_AMOUNT_MISMATCH';end if;
 insert into public.payment_proof_reconciliations(proof_id,actor_id,idempotency_key,confirmed_cents,actor_role) values(p_proof_id,auth.uid(),p_idempotency_key,p.confirmed_cents,p_actor_role) returning * into r;
 perform set_config('app.payment_proof_reconciliation_id',p_proof_id::text,true);
 for o in select * from public.pedidos where id=any(ids) order by id loop
  insert into public.payment_proof_order_intents(proof_id,pedido_id,requested_via) values(p_proof_id,o.id,'operator_reconciliation') on conflict do nothing;
  perform public.registrar_status_pagamento(o.id,'aprovado','manual',null,concat('digital_proof:',p_proof_id),gen_random_uuid(),null);
  insert into public.payment_proof_order_links values(r.id,p_proof_id,o.id,o.total_pedido_centavos);
 end loop;
 insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,metadata) values(p_proof_id,'reconciled',auth.uid(),p_actor_role,'operator',p.status,p.status,jsonb_build_object('provenance','digital_proof','order_ids',ids,'total_cents',total));
 return r.id;
end$$;
revoke all on function public.reconcile_payment_proof_authorized(uuid,uuid[],uuid,public.tipo_funcao) from public,anon,authenticated;

create function public.reconcile_payment_proof(p_proof_id uuid,p_order_ids uuid[],p_idempotency_key uuid,p_lease_token text)
returns bigint language plpgsql security definer set search_path='' as $$
declare role_at_action public.tipo_funcao;
begin
 role_at_action:=public.require_active_payment_proof_actor_role();
 perform public.assert_payment_proof_lease(p_proof_id,p_lease_token);
 return public.reconcile_payment_proof_authorized(p_proof_id,p_order_ids,p_idempotency_key,role_at_action);
end$$;

revoke execute on function public.manage_payment_proof_review(uuid,text,text) from authenticated;
create function public.manage_payment_proof_review(p_proof_id uuid,p_operation text,p_value text,p_lease_token text)
returns boolean language plpgsql security definer set search_path='' as $$
declare proof public.payment_proofs%rowtype;role_at_action public.tipo_funcao;
begin
 role_at_action:=public.require_active_payment_proof_actor_role();
 perform public.assert_payment_proof_lease(p_proof_id,p_lease_token);
 if p_operation<>'reject' then raise exception using errcode='22023',message='PAYMENT_PROOF_OPERATION_INVALID';end if;
 select * into proof from public.payment_proofs where id=p_proof_id for update;
 if proof.status not in('received','identity_pending','processing','review','admitted') then raise exception using errcode='23514',message='PAYMENT_PROOF_REJECTION_INVALID_STATE';end if;
 update public.payment_proofs set status='quarantined',quarantined_at=now(),purge_after=now()+interval '10 days',updated_at=now() where id=p_proof_id;
 insert into public.payment_proof_events(proof_id,event_type,actor_id,actor_role,source,previous_status,result_status,reason) values(p_proof_id,'operator_reviewed',auth.uid(),role_at_action,'operator',proof.status,'quarantined','reject');
 insert into public.payment_proof_outbox(proof_id,event_type,channel,payload) values(p_proof_id,'payment_proof_rejected',proof.channel,jsonb_build_object('message_key','payment_proof_under_review')) on conflict do nothing;
 delete from public.payment_proof_leases where proof_id=p_proof_id;
 return true;
end$$;

revoke all on function public.acquire_payment_proof_lease(uuid),public.assert_payment_proof_lease(uuid,text),public.require_active_payment_proof_actor_role(),public.release_payment_proof_lease(uuid,text),public.reconcile_payment_proof(uuid,uuid[],uuid,text),public.manage_payment_proof_review(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.acquire_payment_proof_lease(uuid),public.release_payment_proof_lease(uuid,text),public.reconcile_payment_proof(uuid,uuid[],uuid,text),public.manage_payment_proof_review(uuid,text,text,text) to authenticated;
