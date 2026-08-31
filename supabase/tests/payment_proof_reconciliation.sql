\ir ../migrations/20260828340000_payment_proof_operator_leases.sql
select plan(12);set role postgres;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values('33333333-3333-4333-8333-333333333301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','seller@test',now(),now()) on conflict do nothing;
insert into public.perfis(id,nome,funcao,ativo) values('33333333-3333-4333-8333-333333333301','Seller','vendedor',true) on conflict(id) do update set funcao='vendedor',ativo=true;
insert into public.clientes(id,nome,telefone) values('33333333-3333-4333-8333-333333333321','Owner','5541999999986'),('33333333-3333-4333-8333-333333333322','Other','5541999999987') on conflict do nothing;
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos)
values('33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333321','confirmado','pendente','retirada','pix',2000,0,2000),('33333333-3333-4333-8333-333333333342','33333333-3333-4333-8333-333333333321','confirmado','pendente','retirada','pix',2200,0,2200),('33333333-3333-4333-8333-333333333343','33333333-3333-4333-8333-333333333322','confirmado','pendente','retirada','pix',4200,0,4200) on conflict do nothing;
insert into public.payment_proofs(id,customer_id,channel,delivery_key,status,original_storage_key,size_bytes,confirmed_cents) values
 ('33333333-3333-4333-8333-333333333361','33333333-3333-4333-8333-333333333321','web','reconcile','admitted','proofs/private/r.pdf',100,4200),
 ('33333333-3333-4333-8333-333333333362','33333333-3333-4333-8333-333333333321','web','reject','review','proofs/private/x.pdf',100,4200);
insert into public.payment_proof_order_intents(proof_id,pedido_id)
values('33333333-3333-4333-8333-333333333361','33333333-3333-4333-8333-333333333341') on conflict do nothing;
create temporary table lease_tokens(proof_id uuid primary key,token text);grant all on lease_tokens to authenticated;reset role;
set role authenticated;select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333301',false);
select ok(has_function_privilege('authenticated','public.reconcile_payment_proof(uuid,uuid[],uuid)','EXECUTE')=false,'legacy reconciliation signature is not executable');
insert into lease_tokens select '33333333-3333-4333-8333-333333333361',lease_token from public.acquire_payment_proof_lease('33333333-3333-4333-8333-333333333361');
select throws_ok(
 $$select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333343']::uuid[],'33333333-3333-4333-8333-333333333382',(select token from lease_tokens where proof_id='33333333-3333-4333-8333-333333333361'))$$,
 '23514','PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH','cross-customer reconciliation is rejected'
);
select throws_ok(
 $$select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333341']::uuid[],'33333333-3333-4333-8333-333333333383',(select token from lease_tokens where proof_id='33333333-3333-4333-8333-333333333361'))$$,
 '23514','PAYMENT_PROOF_AMOUNT_MISMATCH','non-exact reconciliation is rejected'
);
select throws_ok(
 $$select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333342']::uuid[],'33333333-3333-4333-8333-333333333384',(select token from lease_tokens where proof_id='33333333-3333-4333-8333-333333333361'))$$,
 '23514','PAYMENT_PROOF_REQUESTED_ORDER_REQUIRED','reconciliation must include every early requested order'
);
do $$declare a bigint;b bigint;t text:=(select token from lease_tokens where proof_id='33333333-3333-4333-8333-333333333361');begin select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333342']::uuid[],'33333333-3333-4333-8333-333333333381',t) into a;
select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333342']::uuid[],'33333333-3333-4333-8333-333333333381',t) into b;
if a<>b or exists(select 1 from public.pedidos where id in('33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333342') and status_pagamento<>'aprovado') then raise exception 'multiorder/replay failed';end if;
end $$;select pass('exact multi-order reconciliation approves once through payment authority without conflicting order lock');
select ok(exists(select 1 from public.payment_proof_order_intents where proof_id='33333333-3333-4333-8333-333333333361' and pedido_id='33333333-3333-4333-8333-333333333342' and requested_via='operator_reconciliation'),'reconciliation records every added order intent');
select is((select actor_role::text from public.payment_proof_reconciliations where proof_id='33333333-3333-4333-8333-333333333361'),'vendedor','reconciliation snapshots actor role');
set role postgres;update public.perfis set funcao='supervisor' where id='33333333-3333-4333-8333-333333333301';reset role;
select is((select actor_role::text from public.payment_proof_reconciliations where proof_id='33333333-3333-4333-8333-333333333361'),'vendedor','historic role remains immutable after profile change');
set role postgres;update public.perfis set funcao='vendedor' where id='33333333-3333-4333-8333-333333333301';reset role;
insert into lease_tokens select '33333333-3333-4333-8333-333333333362',lease_token from public.acquire_payment_proof_lease('33333333-3333-4333-8333-333333333362');
set role postgres;update public.perfis set ativo=false where id='33333333-3333-4333-8333-333333333301';reset role;set role authenticated;
select throws_ok($$select public.manage_payment_proof_review('33333333-3333-4333-8333-333333333362','reject',null,(select token from lease_tokens where proof_id='33333333-3333-4333-8333-333333333362'))$$,'42501','PAYMENT_PROOF_OPERATOR_REQUIRED','a lease cannot authorize a mutation after deactivation');
set role postgres;update public.perfis set ativo=true where id='33333333-3333-4333-8333-333333333301';reset role;set role authenticated;
select lives_ok($$select public.manage_payment_proof_review('33333333-3333-4333-8333-333333333362','reject',null,(select token from lease_tokens where proof_id='33333333-3333-4333-8333-333333333362'))$$,'active seller rejects while holding the proof lease');
select ok((select actor_role is not null from public.payment_proof_events where proof_id='33333333-3333-4333-8333-333333333362' order by id desc limit 1),'new rejection audit role is non-null');
select is((select actor_role::text from public.payment_proof_events where proof_id='33333333-3333-4333-8333-333333333362' order by id desc limit 1),'vendedor','rejection snapshots actor role');
reset role;select * from finish();
