begin;
select plan(11);
set local role postgres;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('88111111-1111-4111-8111-111111111101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outbox-test@example.test','',now(),'{}','{}',now(),now());
insert into public.clientes(id,nome,telefone,telegram_chat_id) values
 ('88111111-1111-4111-8111-111111111110','Web WhatsApp Telegram','5541999999881','chat-881'),
 ('88111111-1111-4111-8111-111111111120','Web and WhatsApp','5541999999882',null);
insert into public.conversas(id,cliente_id) values
 ('88111111-1111-4111-8111-111111111130','88111111-1111-4111-8111-111111111110'),
 ('88111111-1111-4111-8111-111111111131','88111111-1111-4111-8111-111111111120');
insert into public.pedidos(id,cliente_id,conversa_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento) values
 ('88111111-1111-4111-8111-111111111140','88111111-1111-4111-8111-111111111110','88111111-1111-4111-8111-111111111130','novo','retirada',100,100,'pix','pendente'),
 ('88111111-1111-4111-8111-111111111141','88111111-1111-4111-8111-111111111120','88111111-1111-4111-8111-111111111131','novo','retirada',100,100,'pix','pendente');
select is((select count(*)::integer from public.notification_outbox where aggregate_id='88111111-1111-4111-8111-111111111140' and event_type='order_created'),3,'order insert atomically produces all eligible destinations');
select is((select payload from public.notification_outbox where aggregate_id='88111111-1111-4111-8111-111111111140' and event_type='order_created' limit 1),'{"message_key":"order_created"}'::jsonb,'order-created payload matches the symbolic template contract');
select lives_ok($test$do $$begin begin insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento) values('88111111-1111-4111-8111-111111111142','88111111-1111-4111-8111-111111111110','novo','retirada',1,1,'pix','pendente'); raise exception 'force rollback'; exception when raise_exception then null; end; if exists(select 1 from public.notification_outbox where aggregate_id='88111111-1111-4111-8111-111111111142') then raise exception 'outbox escaped rollback'; end if; end$$$test$,'producer outbox rows roll back with their source transaction');
select is((select array_agg(channel order by channel)::text from public.notification_outbox where aggregate_id='88111111-1111-4111-8111-111111111141' and event_type='order_created'),'{web,whatsapp}'::text,'absent Telegram independently leaves eligible web and WhatsApp destinations');
insert into public.pedido_lifecycle_events(id,pedido_id,idempotency_key,previous_status,target_status,result_status) values('88111111-1111-4111-8111-111111111150','88111111-1111-4111-8111-111111111140','88111111-1111-4111-8111-111111111151','novo','confirmado','confirmado');
select is((select payload->>'status' from public.notification_outbox where event_id='88111111-1111-4111-8111-111111111150' and channel='web'),'confirmado','lifecycle payload uses canonical Portuguese result status');
insert into public.pedido_payment_events(id,pedido_id,source,actor_id,idempotency_key,reason,previous_status,target_status,result_status) values('88111111-1111-4111-8111-111111111160','88111111-1111-4111-8111-111111111140','manual','88111111-1111-4111-8111-111111111101','88111111-1111-4111-8111-111111111161','refund','aprovado','reembolsado','reembolsado');
select is((select count(*)::integer from public.notification_outbox where aggregate_id='88111111-1111-4111-8111-111111111140' and event_type in('payment_status_changed','refund_completed')),6,'refund produces independent payment and refund deliveries');
select is((select payload->>'status' from public.notification_outbox where aggregate_id='88111111-1111-4111-8111-111111111140' and event_type='refund_completed' limit 1),'concluido','refund completion uses canonical concluded status');
insert into public.comprovantes_venda(id,pedido_id,cliente_id,idempotency_key,snapshot,snapshot_hash,issued_by) values('88111111-1111-4111-8111-111111111170','88111111-1111-4111-8111-111111111140','88111111-1111-4111-8111-111111111110','88111111-1111-4111-8111-111111111171','{}','0000000000000000000000000000000000000000000000000000000000000000','88111111-1111-4111-8111-111111111101');
select is((select count(*)::integer from public.notification_outbox where event_id='88111111-1111-4111-8111-111111111170' and event_type='receipt_issued'),3,'receipt insert produces eligible deliveries');
select lives_ok($$select public.enqueue_notification_outbox_internal('order','88111111-1111-4111-8111-111111111140','order_created','88111111-1111-4111-8111-111111111140','{"message_key":"order_created"}')$$,'same helper event is exactly idempotent');
select function_privs_are('public','enqueue_notification_outbox_internal',array['text','uuid','text','uuid','jsonb'],'authenticated',array[]::text[],'application roles cannot execute internal helper');
set local role authenticated;
select throws_ok($$select public.enqueue_notification_outbox_internal('order','88111111-1111-4111-8111-111111111140','order_created','88111111-1111-4111-8111-111111111140','{"message_key":"order_created"}')$$,'42501',null,'authenticated cannot execute internal helper');
select * from finish();
rollback;
