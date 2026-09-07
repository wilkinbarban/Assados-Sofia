\ir ../migrations/20260903190000_payment_proof_immutable_delivery_provenance.sql
\ir ../migrations/20260903193000_whatsapp_payment_proof_inbound_window.sql
begin;
select plan(9);

set role postgres;
insert into public.clientes(id,nome,telefone,ultima_interacao_recebida_em) values
 ('49494949-4949-4494-8494-494949494901','WhatsApp window','5541999999901',now()-interval '2 days'),
 ('49494949-4949-4494-8494-494949494902','Other customer','5541999999902',now()-interval '2 days');
insert into public.conversas(id,cliente_id,status,ia_ativa) values
 ('49494949-4949-4494-8494-494949494911','49494949-4949-4494-8494-494949494901','aberta',false),
 ('49494949-4949-4494-8494-494949494912','49494949-4949-4494-8494-494949494902','aberta',false);
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos)
values
 ('49494949-4949-4494-8494-494949494921','49494949-4949-4494-8494-494949494901','novo','pendente','retirada','pix',100,0,100),
 ('49494949-4949-4494-8494-494949494922','49494949-4949-4494-8494-494949494901','novo','pendente','retirada','pix',100,0,100);
reset role;
create temporary table legacy_messages_before as select count(*) as value from public.mensagens;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);

create temporary table whatsapp_admission as select * from public.admit_and_enqueue_payment_proof('whatsapp','window-whatsapp-new','49494949-4949-4494-8494-494949494901','sender','proofs/private/whatsapp/window-new.pdf',100,'application/pdf','49494949-4949-4494-8494-494949494921','49494949-4949-4494-8494-494949494911',repeat('a',64));
reset role;
select ok((select ultima_interacao_recebida_em > now()-interval '1 minute' from public.clientes where id='49494949-4949-4494-8494-494949494901'), 'new canonical WhatsApp admission records authoritative inbound evidence');
create temporary table timestamp_before_retry as select ultima_interacao_recebida_em as value from public.clientes where id='49494949-4949-4494-8494-494949494901';
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select ok((select idempotent from public.admit_and_enqueue_payment_proof('whatsapp','window-whatsapp-new','49494949-4949-4494-8494-494949494901','sender','proofs/private/whatsapp/window-new.pdf',100,'application/pdf','49494949-4949-4494-8494-494949494921','49494949-4949-4494-8494-494949494911',repeat('a',64))), 'exact WhatsApp retry remains idempotent');
reset role;
select is((select ultima_interacao_recebida_em from public.clientes where id='49494949-4949-4494-8494-494949494901'), (select value from timestamp_before_retry), 'exact retry does not advance inbound evidence');
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select * from public.admit_and_enqueue_payment_proof('web','window-web','49494949-4949-4494-8494-494949494901','sender','proofs/private/web/window.pdf',100,'application/pdf','49494949-4949-4494-8494-494949494922','49494949-4949-4494-8494-494949494911',repeat('b',64));
select * from public.admit_and_enqueue_payment_proof('telegram','window-telegram','49494949-4949-4494-8494-494949494901','sender','proofs/private/telegram/window.pdf',100,'application/pdf',null,'49494949-4949-4494-8494-494949494911',repeat('c',64));
reset role;
select is((select ultima_interacao_recebida_em from public.clientes where id='49494949-4949-4494-8494-494949494901'), (select value from timestamp_before_retry), 'Web and Telegram admissions do not update inbound evidence');
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select throws_ok($$select * from public.admit_and_enqueue_payment_proof('whatsapp','window-whatsapp-new','49494949-4949-4494-8494-494949494901','changed-sender','proofs/private/whatsapp/window-new.pdf',100,'application/pdf','49494949-4949-4494-8494-494949494921','49494949-4949-4494-8494-494949494911',repeat('a',64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'conflicting WhatsApp replay is rejected');
reset role;
select is((select ultima_interacao_recebida_em from public.clientes where id='49494949-4949-4494-8494-494949494901'), (select value from timestamp_before_retry), 'conflicting replay does not update inbound evidence');
select ok(has_function_privilege('service_role', 'public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text)', 'EXECUTE'), 'service role retains canonical admission access');
select ok(not has_function_privilege('anon', 'public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,uuid,text)', 'EXECUTE'), 'browser role cannot use canonical admission');
select is((select count(*) from public.mensagens), (select value from legacy_messages_before), 'canonical intake does not write legacy messages in this rollback scope');

select * from finish();
rollback;
