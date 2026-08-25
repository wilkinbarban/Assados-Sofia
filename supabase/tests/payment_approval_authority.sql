-- Real payment-authority transactions against the existing migrated database.
select plan(1);

delete from public.pedido_payment_events where pedido_id::text like '22222222-2222-4222-8222-2222222222%';
delete from public.pedidos where id::text like '22222222-2222-4222-8222-2222222222%';
delete from public.clientes where id='22222222-2222-4222-8222-222222222210';
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('22222222-2222-4222-8222-222222222201','00000000-0000-0000-0000-000000000000','authenticated','authenticated','payment-operator@example.test','',now(),'{}','{}',now(),now()),
 ('22222222-2222-4222-8222-222222222202','00000000-0000-0000-0000-000000000000','authenticated','authenticated','payment-customer@example.test','',now(),'{}','{}',now(),now()) on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values ('22222222-2222-4222-8222-222222222201','Payment operator','admin',true),('22222222-2222-4222-8222-222222222202','Payment customer','cliente',true) on conflict(id) do update set funcao=excluded.funcao, ativo=excluded.ativo;
insert into public.clientes(id,usuario_id,nome,telefone) values ('22222222-2222-4222-8222-222222222210','22222222-2222-4222-8222-222222222202','Payment customer','5541999999922');
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento) values
 ('22222222-2222-4222-8222-222222222211','22222222-2222-4222-8222-222222222210','novo','retirada',100,100,'pix','pendente'),
 ('22222222-2222-4222-8222-222222222212','22222222-2222-4222-8222-222222222210','confirmado','retirada',200,200,'pix','pendente'),
 ('22222222-2222-4222-8222-222222222213','22222222-2222-4222-8222-222222222210','entregue','retirada',300,300,'pix','pendente');

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222201',false);
do $$ begin
 begin perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222211'::uuid,'aprovado'::public.status_pagamento,'manual',null,null,null::uuid); raise exception 'manual reason missing accepted';
 exception when invalid_parameter_value then if sqlerrm <> 'MANUAL_PAYMENT_REASON_REQUIRED' then raise; end if; end;
 perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222211'::uuid,'aprovado'::public.status_pagamento,'manual',null,'cash confirmed','22222222-2222-4222-8222-222222222299'::uuid);
 perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222211'::uuid,'aprovado'::public.status_pagamento,'manual',null,'cash confirmed','22222222-2222-4222-8222-222222222299'::uuid);
 if (select status from public.pedidos where id='22222222-2222-4222-8222-222222222211') <> 'novo' or (select status_pagamento from public.pedidos where id='22222222-2222-4222-8222-222222222211') <> 'aprovado' then raise exception 'manual payment changed lifecycle or payment unexpectedly'; end if;
 if not exists(select 1 from public.pedido_payment_events where pedido_id='22222222-2222-4222-8222-222222222211' and source='manual' and actor_id='22222222-2222-4222-8222-222222222201' and reason='cash confirmed') then raise exception 'manual payment audit missing'; end if;
 if (select count(*) from public.pedido_payment_events where pedido_id='22222222-2222-4222-8222-222222222211' and source='manual') <> 1 then raise exception 'manual payment retry duplicated audit'; end if;
 begin update public.pedido_payment_events set reason='rewrite' where pedido_id='22222222-2222-4222-8222-222222222211'; raise exception 'direct payment audit mutation accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set role service_role;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$ begin
 perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222212'::uuid,'aprovado'::public.status_pagamento,'mercado_pago','mp-runtime-222',null,null::uuid,'delivery-approved-222');
 perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222212'::uuid,'aprovado'::public.status_pagamento,'mercado_pago','mp-runtime-222',null,null::uuid,'delivery-approved-222');
 perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222212'::uuid,'reembolsado'::public.status_pagamento,'mercado_pago','mp-runtime-222',null,null::uuid,'delivery-refund-222');
 perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222212'::uuid,'reembolsado'::public.status_pagamento,'mercado_pago','mp-runtime-222',null,null::uuid,'delivery-refund-222');
 if (select status_pagamento from public.pedidos where id='22222222-2222-4222-8222-222222222212') <> 'reembolsado' then raise exception 'approved payment did not become refunded'; end if;
 if (select count(*) from public.pedido_payment_events where external_reference='mp-runtime-222') <> 2 then raise exception 'refund replay duplicated payment audit'; end if;
 begin perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222213'::uuid,'aprovado'::public.status_pagamento,'mercado_pago','mp-runtime-222',null,null::uuid,'delivery-conflict-222'); raise exception 'duplicate external reference conflict accepted'; exception when unique_violation then if sqlerrm <> 'MERCADO_PAGO_EXTERNAL_REFERENCE_CONFLICT' then raise; end if; end;
 perform * from public.registrar_status_pagamento('22222222-2222-4222-8222-222222222213'::uuid,'rejeitado'::public.status_pagamento,'mercado_pago','mp-runtime-rejected-222',null,null::uuid,'delivery-rejected-222');
 if (select status from public.pedidos where id='22222222-2222-4222-8222-222222222213') <> 'entregue' or (select status_pagamento from public.pedidos where id='22222222-2222-4222-8222-222222222213') <> 'rejeitado' then raise exception 'rejected payment mutated lifecycle'; end if;
end $$;
reset role;
select pass('payment runtime proves manual reason/audit/order independence, refund/replay/conflict, and rejected payment isolation');
delete from public.pedido_payment_events where pedido_id::text like '22222222-2222-4222-8222-2222222222%';
delete from public.pedidos where id::text like '22222222-2222-4222-8222-2222222222%';
delete from public.clientes where id='22222222-2222-4222-8222-222222222210';
select * from finish();

-- JD3 regression: an approved Mercado Pago delivery can transition once to a
-- refund with the same external reference; repeats remain idempotent.
