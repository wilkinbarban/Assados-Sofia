select plan(3);set role postgres;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values('33333333-3333-4333-8333-333333333301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','seller@test',now(),now()) on conflict do nothing;
insert into public.perfis(id,nome,funcao,ativo) values('33333333-3333-4333-8333-333333333301','Seller','vendedor',true) on conflict(id) do update set funcao='vendedor',ativo=true;
insert into public.clientes(id,nome,telefone) values('33333333-3333-4333-8333-333333333321','Owner','5541999999986'),('33333333-3333-4333-8333-333333333322','Other','5541999999987') on conflict do nothing;
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos)
values('33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333321','confirmado','pendente','retirada','pix',2000,0,2000),('33333333-3333-4333-8333-333333333342','33333333-3333-4333-8333-333333333321','confirmado','pendente','retirada','pix',2200,0,2200),('33333333-3333-4333-8333-333333333343','33333333-3333-4333-8333-333333333322','confirmado','pendente','retirada','pix',4200,0,4200) on conflict do nothing;
insert into public.payment_proofs(id,customer_id,channel,delivery_key,status,original_storage_key,size_bytes,confirmed_cents) values('33333333-3333-4333-8333-333333333361','33333333-3333-4333-8333-333333333321','web','reconcile','admitted','proofs/private/r.pdf',100,4200);reset role;
set role authenticated;select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333301',false);
select throws_ok(
 $$select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333343']::uuid[],'33333333-3333-4333-8333-333333333382')$$,
 '23514','PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH','cross-customer reconciliation is rejected'
);
select throws_ok(
 $$select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333341']::uuid[],'33333333-3333-4333-8333-333333333383')$$,
 '23514','PAYMENT_PROOF_AMOUNT_MISMATCH','non-exact reconciliation is rejected'
);
do $$declare a bigint;b bigint;begin select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333342']::uuid[],'33333333-3333-4333-8333-333333333381') into a;
select public.reconcile_payment_proof('33333333-3333-4333-8333-333333333361',array['33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333342']::uuid[],'33333333-3333-4333-8333-333333333381') into b;
if a<>b or exists(select 1 from public.pedidos where id in('33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333342') and status_pagamento<>'aprovado') then raise exception 'multiorder/replay failed';end if;
end $$;reset role;select pass('exact multi-order reconciliation approves once through payment authority');select * from finish();
