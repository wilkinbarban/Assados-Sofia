-- Real issuance/reissue/RLS fixture against the existing migrated database.
select plan(1);
alter table public.comprovantes_venda disable trigger comprovantes_venda_immutable;
delete from public.comprovantes_venda where pedido_id::text like '33333333-3333-4333-8333-3333333333%';
alter table public.comprovantes_venda enable trigger comprovantes_venda_immutable;
delete from public.pedido_payment_events where pedido_id::text like '33333333-3333-4333-8333-3333333333%';
-- Other focused tests use the same UUID namespace. Clean only this fixture and
-- remove its direct proof links before deleting the order.
delete from public.payment_proof_order_links where pedido_id='33333333-3333-4333-8333-333333333311';
delete from public.pedidos where id='33333333-3333-4333-8333-333333333311';
delete from public.clientes where id='33333333-3333-4333-8333-333333333310';
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('33333333-3333-4333-8333-333333333301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receipt-operator@example.test','',now(),'{}','{}',now(),now()),
 ('33333333-3333-4333-8333-333333333302','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receipt-owner@example.test','',now(),'{}','{}',now(),now()),
 ('33333333-3333-4333-8333-333333333303','00000000-0000-0000-0000-000000000000','authenticated','authenticated','receipt-stranger@example.test','',now(),'{}','{}',now(),now()) on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('33333333-3333-4333-8333-333333333301','Receipt operator','admin',true),
 ('33333333-3333-4333-8333-333333333302','Receipt owner','cliente',true),
 ('33333333-3333-4333-8333-333333333303','Receipt stranger','cliente',true)
on conflict(id) do update set funcao=excluded.funcao, ativo=excluded.ativo;
insert into public.clientes(id,usuario_id,nome,telefone) values ('33333333-3333-4333-8333-333333333310','33333333-3333-4333-8333-333333333302','Receipt owner','5541999999933');
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento) values ('33333333-3333-4333-8333-333333333311','33333333-3333-4333-8333-333333333310','entregue','retirada',1234,1234,'pix','aprovado');

set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333301',false);
do $$
declare v_first record; v_second record; v_count integer;
begin
 select * into v_first from public.emitir_comprovante_venda('33333333-3333-4333-8333-333333333311','33333333-3333-4333-8333-333333333321');
 select * into v_second from public.emitir_comprovante_venda('33333333-3333-4333-8333-333333333311','33333333-3333-4333-8333-333333333322');
 select count(*) into v_count from public.comprovantes_venda where pedido_id='33333333-3333-4333-8333-333333333311';
 if v_first.receipt_id <> v_second.receipt_id or v_first.snapshot::text <> v_second.snapshot::text or v_first.snapshot_hash <> v_second.snapshot_hash or not v_second.idempotent or v_count <> 1 then raise exception 'receipt reissue changed persisted snapshot bytes or duplicated issuance'; end if;
 if (v_first.snapshot ->> 'charged_amount_centavos')::integer <> 1234 then raise exception 'receipt snapshot lost charged amount identity'; end if;
 begin update public.comprovantes_venda set snapshot='{}'::jsonb where id=v_first.receipt_id; raise exception 'direct snapshot mutation accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333302',false);
do $$ begin
 if not exists(select 1 from public.comprovantes_venda where pedido_id='33333333-3333-4333-8333-333333333311') then raise exception 'customer could not read owned receipt'; end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333303',false);
do $$ begin
 if exists(select 1 from public.comprovantes_venda where pedido_id='33333333-3333-4333-8333-333333333311') then raise exception 'unrelated customer read receipt'; end if;
end $$;
reset role;

select pass('receipt runtime proves immutable persisted reissue identity, charged amount, operator/customer RLS, and direct mutation denial');
alter table public.comprovantes_venda disable trigger comprovantes_venda_immutable;
delete from public.comprovantes_venda where pedido_id='33333333-3333-4333-8333-333333333311';
alter table public.comprovantes_venda enable trigger comprovantes_venda_immutable;
delete from public.pedidos where id='33333333-3333-4333-8333-333333333311';
delete from public.clientes where id='33333333-3333-4333-8333-333333333310';
select * from finish();
