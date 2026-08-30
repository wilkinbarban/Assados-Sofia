select plan(12);

set role postgres;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
values
 ('51515151-5151-4151-8151-515151515101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lock-admin@test',now(),now()),
 ('51515151-5151-4151-8151-515151515102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lock-client@test',now(),now())
on conflict do nothing;
insert into public.perfis(id,nome,funcao,ativo)
values('51515151-5151-4151-8151-515151515101','Lock Admin','admin',true)
on conflict(id) do update set ativo=true,funcao='admin';
insert into public.clientes(id,nome,telefone,usuario_id)
values
 ('51515151-5151-4151-8151-515151515121','Lock Owner','5541999995151','51515151-5151-4151-8151-515151515102'),
 ('51515151-5151-4151-8151-515151515122','Other Owner','5541999995152',null)
on conflict(id) do update set usuario_id=excluded.usuario_id;
insert into public.pedidos(
 id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,
 total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos
) values
 ('51515151-5151-4151-8151-515151515141','51515151-5151-4151-8151-515151515121','confirmado','pendente','retirada','pix',4200,0,4200),
 ('51515151-5151-4151-8151-515151515142','51515151-5151-4151-8151-515151515121','confirmado','pendente','retirada','pix',1800,0,1800),
 ('51515151-5151-4151-8151-515151515143','51515151-5151-4151-8151-515151515122','confirmado','pendente','retirada','pix',4200,0,4200)
on conflict do nothing;
reset role;

set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select lives_ok(
 $$select * from public.admit_payment_proof_intake(
   'web','order-lock-1','51515151-5151-4151-8151-515151515121',
   '51515151-5151-4151-8151-515151515102','proofs/private/order-lock-1.pdf',
   100,'application/pdf','51515151-5151-4151-8151-515151515141'
 )$$,
 'web intake atomically creates its early order intent'
);
select ok(
 public.is_order_payment_proof_locked('51515151-5151-4151-8151-515151515141'),
 'received proof locks the order'
);
select throws_ok(
 $$select * from public.admit_payment_proof_intake(
   'web','order-lock-2','51515151-5151-4151-8151-515151515121',
   '51515151-5151-4151-8151-515151515102','proofs/private/order-lock-2.pdf',
   100,'application/pdf','51515151-5151-4151-8151-515151515141'
 )$$,
 '23514','ORDER_PAYMENT_PROOF_ALREADY_PENDING',
 'a second proof cannot claim an actively locked order'
);
select throws_ok(
 $$select * from public.admit_payment_proof_intake(
   'web','order-lock-cross-customer','51515151-5151-4151-8151-515151515121',
   '51515151-5151-4151-8151-515151515102','proofs/private/order-lock-cross.pdf',
   100,'application/pdf','51515151-5151-4151-8151-515151515143'
 )$$,
 '23514','PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH',
 'intake cannot claim another customer order'
);
select throws_ok(
 $$select public.assert_order_payment_available('51515151-5151-4151-8151-515151515141')$$,
 '23514','ORDER_PAYMENT_PROOF_ALREADY_PENDING',
 'competing payment routes are rejected while proof is active'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','51515151-5151-4151-8151-515151515101',false);
select lives_ok(
 $$select public.manage_payment_proof_review(
   (select id from public.payment_proofs where delivery_key='order-lock-1'),
   'reject',null
 )$$,
 'operator rejection quarantines the proof'
);
select ok(
 not public.is_order_payment_proof_locked('51515151-5151-4151-8151-515151515141'),
 'quarantine releases the order'
);
select lives_ok(
 $$select public.restore_payment_proof(
   (select id from public.payment_proofs where delivery_key='order-lock-1'),
   'restore lock test'
 )$$,
 'restoring an eligible proof succeeds'
);
select ok(
 public.is_order_payment_proof_locked('51515151-5151-4151-8151-515151515141'),
 'restore relocks an eligible pending order'
);
select throws_ok(
 $$select public.approve_manual_external_payment(
   array['51515151-5151-4151-8151-515151515141']::uuid[],
   4200,'cash','Paid at counter','51515151-5151-4151-8151-515151515181'
 )$$,
 '23514','ORDER_PAYMENT_PROOF_ALREADY_PENDING',
 'manual external approval cannot compete with active digital evidence'
);
select is(
 (select count(*)::integer from public.list_order_payment_proof_locks(
   array['51515151-5151-4151-8151-515151515141','51515151-5151-4151-8151-515151515142']::uuid[]
 )),
 1,
 'lock projection returns only actively locked orders'
);
select is(
 (select proof_status from public.list_order_payment_proof_locks(
   array['51515151-5151-4151-8151-515151515141']::uuid[]
 )),
 'review',
 'lock projection includes the current proof status'
);

reset role;
select * from finish();
