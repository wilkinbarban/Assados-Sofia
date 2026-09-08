select plan(7);

set role postgres;
insert into public.clientes(id,nome,telefone) values
 ('70707070-7070-4070-8070-707070707001','Public status customer','5541999997001'),
 ('70707070-7070-4070-8070-707070707002','Other customer','5541999997002')
on conflict do nothing;
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos) values
 ('70707070-7070-4070-8070-707070707011','70707070-7070-4070-8070-707070707001','confirmado','pendente','retirada','pix',1000,0,1000),
 ('70707070-7070-4070-8070-707070707012','70707070-7070-4070-8070-707070707002','confirmado','aprovado','retirada','pix',1000,0,1000)
on conflict do nothing;
insert into public.payment_proofs(id,customer_id,channel,delivery_key,status,original_storage_key,mime_type,size_bytes,sha256)
values('70707070-7070-4070-8070-707070707021','70707070-7070-4070-8070-707070707001','web','public-status-proof','review','proofs/private/secret.pdf','application/pdf',100,repeat('7',64))
on conflict do nothing;
insert into public.payment_proof_order_intents(proof_id,pedido_id) values
 ('70707070-7070-4070-8070-707070707021','70707070-7070-4070-8070-707070707011') on conflict do nothing;
insert into public.payment_proof_events(proof_id,event_type,source,result_status,metadata)
values('70707070-7070-4070-8070-707070707021','intake_received','web','review','{}') on conflict do nothing;
reset role;

select ok(has_function_privilege('service_role','public.get_customer_payment_proof_public_status(uuid,uuid)','EXECUTE'),'service role can query public status');
select ok(not has_function_privilege('anon','public.get_customer_payment_proof_public_status(uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.get_customer_payment_proof_public_status(uuid,uuid)','EXECUTE'),'browser roles cannot query public status');

set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select is((select proof_status from public.get_customer_payment_proof_public_status('70707070-7070-4070-8070-707070707001','70707070-7070-4070-8070-707070707011')),'em_analise','proof status is allowlisted');
select is((select payment_status from public.get_customer_payment_proof_public_status('70707070-7070-4070-8070-707070707001','70707070-7070-4070-8070-707070707011')),'em_analise','canonical pending payment is sanitized');
select is((select proof_status from public.get_customer_payment_proof_public_status('70707070-7070-4070-8070-707070707001','70707070-7070-4070-8070-707070707012')),'indisponivel','foreign pedido fails closed');
select ok(not (select to_jsonb(s) ?| array['id','proof_id','pedido_id','storage_key','original_storage_key','sha256','extraction_confidence','confirmed_cents','lease_token'] from public.get_customer_payment_proof_public_status('70707070-7070-4070-8070-707070707001','70707070-7070-4070-8070-707070707011') s),'public response excludes sensitive fields');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','70707070-7070-4070-8070-707070707001',false);
select throws_like($$select * from public.get_customer_payment_proof_public_status('70707070-7070-4070-8070-707070707001',null)$$,'%permission denied%','non-service callers are denied');
reset role;

select * from finish();
