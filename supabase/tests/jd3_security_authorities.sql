-- JD3 real database authority tests: grants, locked OTP identity, payments,
-- receipts, and transactional anonymisation preserving evidence.
select plan(1);
\ir ../migrations/20260824160000_jd3_security_authorities.sql
\ir ../migrations/20260824162000_jd3_final_ledger_correction.sql
\ir ../migrations/20260824163000_mercado_pago_refund_first_terminality.sql

do $$
begin
  if has_function_privilege('anon', 'public.solicitar_desafio_otp(varchar,public.tipo_desafio_otp,varchar,varchar,uuid)', 'EXECUTE') then raise exception 'anon can fabricate OTP'; end if;
  if has_function_privilege('authenticated', 'public.solicitar_desafio_otp(varchar,public.tipo_desafio_otp,varchar,varchar,uuid)', 'EXECUTE') then raise exception 'authenticated can fabricate OTP'; end if;
  if has_function_privilege('anon', 'public.ativar_desafio_otp(uuid,boolean,jsonb,integer)', 'EXECUTE') or has_function_privilege('authenticated', 'public.ativar_desafio_otp(uuid,boolean,jsonb,integer)', 'EXECUTE') then raise exception 'browser can activate OTP'; end if;
  if has_function_privilege('anon', 'public.finalizar_desafio_otp(uuid,varchar,public.tipo_desafio_otp,varchar,uuid,varchar,varchar)', 'EXECUTE') or has_function_privilege('authenticated', 'public.finalizar_desafio_otp(uuid,varchar,public.tipo_desafio_otp,varchar,uuid,varchar,varchar)', 'EXECUTE') then raise exception 'browser can finalize OTP'; end if;
  if has_function_privilege('anon', 'public.consumir_desafio_recuperacao(uuid,varchar,varchar)', 'EXECUTE') or has_function_privilege('authenticated', 'public.aplicar_concessao_recuperacao(uuid,text)', 'EXECUTE') then raise exception 'browser can recover account'; end if;
end $$;

-- Both browser roles are denied at invocation time too, not just catalog grants.
set role anon;
do $$ begin perform * from public.ativar_desafio_otp('33333333-3333-4333-8333-333333333331',true,'{}',60); raise exception 'anon activation invocation accepted'; exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
do $$ begin perform * from public.finalizar_desafio_otp('33333333-3333-4333-8333-333333333331','5541999999933','signup','h',null,null,'whatsapp'); raise exception 'authenticated finalization invocation accepted'; exception when insufficient_privilege then null; end $$;
reset role;

-- Set up service-bound OTP accounts and locked challenge.
delete from public.desafios_otp where id='33333333-3333-4333-8333-333333333331';
delete from public.comprovantes_venda where pedido_id='33333333-3333-4333-8333-333333333351';
delete from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333351';
delete from public.pedidos where id='33333333-3333-4333-8333-333333333351';
delete from public.clientes where usuario_id in ('33333333-3333-4333-8333-333333333302','33333333-3333-4333-8333-333333333303') or id in ('33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333342');
delete from public.perfis where id in ('33333333-3333-4333-8333-333333333301','33333333-3333-4333-8333-333333333302','33333333-3333-4333-8333-333333333303');
delete from auth.users where id in ('33333333-3333-4333-8333-333333333301','33333333-3333-4333-8333-333333333302','33333333-3333-4333-8333-333333333303');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('33333333-3333-4333-8333-333333333301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jd3-admin@example.test','',now(),'{}','{}',now(),now()),
 ('33333333-3333-4333-8333-333333333302','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jd3-bound@example.test','',now(),'{}','{}',now(),now()),
 ('33333333-3333-4333-8333-333333333303','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jd3-attacker@example.test','',now(),'{}','{}',now(),now()) on conflict(id) do update set email=excluded.email;
insert into public.perfis(id,nome,funcao,ativo) values
 ('33333333-3333-4333-8333-333333333301','JD3 admin','admin',true),('33333333-3333-4333-8333-333333333302','JD3 bound','cliente',true),('33333333-3333-4333-8333-333333333303','JD3 attacker','cliente',true) on conflict(id) do update set nome=excluded.nome,funcao=excluded.funcao,ativo=excluded.ativo;
insert into public.desafios_otp(id,telefone,usuario_id,proposito,status,hash_codigo,expira_em) values ('33333333-3333-4333-8333-333333333331','5541999999933','33333333-3333-4333-8333-333333333302','signup','active','valid-hash',now()+interval '5 minutes');

set role service_role;
select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$ declare v_ok boolean; v_error text; begin
 select sucesso,codigo_erro into v_ok,v_error from public.finalizar_desafio_otp('33333333-3333-4333-8333-333333333331','5541999999933','signup','valid-hash','33333333-3333-4333-8333-333333333303','Attacker','whatsapp');
 if v_ok or v_error <> 'USUARIO_DESAFIO_INCORRETO' then raise exception 'OTP mismatch did not reject bound identity'; end if;
 select sucesso,codigo_erro into v_ok,v_error from public.finalizar_desafio_otp('33333333-3333-4333-8333-333333333331','5541999999933','signup','valid-hash','33333333-3333-4333-8333-333333333302','Bound','whatsapp');
 if not v_ok then raise exception 'valid locked OTP did not complete: %',v_error; end if;
end $$;
reset role;
delete from public.clientes where usuario_id='33333333-3333-4333-8333-333333333302';

-- Deterministic collision skip: next candidate is occupied; target must retain
-- orders, payment event and immutable receipt while becoming auth-delete-pending.
insert into public.clientes(id,usuario_id,nome,telefone) values ('33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333302','JD3 customer','5541999999934'),('33333333-3333-4333-8333-333333333342',null,'occupied','5541900424243');
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento) values ('33333333-3333-4333-8333-333333333351','33333333-3333-4333-8333-333333333341','entregue','retirada',100,100,'pix','aprovado');
insert into public.pedido_payment_events(pedido_id,source,actor_id,reason,previous_status,target_status,result_status,idempotency_key) values ('33333333-3333-4333-8333-333333333351','manual','33333333-3333-4333-8333-333333333301','fixture','pendente','aprovado','aprovado','33333333-3333-4333-8333-333333333391');
insert into public.comprovantes_venda(pedido_id,cliente_id,idempotency_key,snapshot,snapshot_hash,issued_by) values ('33333333-3333-4333-8333-333333333351','33333333-3333-4333-8333-333333333341','33333333-3333-4333-8333-333333333399','{}',repeat('a',64),'33333333-3333-4333-8333-333333333301');
select setval('public.deleted_customer_phone_sequence',424242,true);
set role authenticated; select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333301',false);
select public.anonymizar_usuario_admin('33333333-3333-4333-8333-333333333302');
reset role;
do $$ begin
 if exists(select 1 from public.clientes where id='33333333-3333-4333-8333-333333333341' and usuario_id is not null) then raise exception 'customer was not detached'; end if;
 if not exists(select 1 from public.clientes where id='33333333-3333-4333-8333-333333333341' and telefone='5541900424244') then raise exception 'phone collision was not skipped deterministically'; end if;
 if (select ativo from public.perfis where id='33333333-3333-4333-8333-333333333302') then raise exception 'target remains active after DB transaction'; end if;
 if not exists(select 1 from public.pedidos where id='33333333-3333-4333-8333-333333333351') or not exists(select 1 from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333351') or not exists(select 1 from public.comprovantes_venda where pedido_id='33333333-3333-4333-8333-333333333351') then raise exception 'deletion transaction lost immutable evidence'; end if;
 if not exists(select 1 from public.logs_auditoria where acao='anonymizar_usuario' and detalhes->>'auth_delete_pending'='true') then raise exception 'recoverable auth-delete pending audit missing'; end if;
end $$;
-- A provider refund is a second, differently identified delivery: approval
-- evidence remains immutable, replay is stable, and a late approval cannot resurrect revenue.
update public.pedidos set status_pagamento='aprovado' where id='33333333-3333-4333-8333-333333333351';
insert into public.pedido_payment_events(pedido_id,source,external_reference,provider_delivery_id,previous_status,target_status,result_status)
values ('33333333-3333-4333-8333-333333333351','mercado_pago','payment-jd3','delivery-approved','pendente','aprovado','aprovado');
set role service_role;
select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$ declare v_idempotent boolean; begin
  select idempotent into v_idempotent from public.registrar_status_pagamento('33333333-3333-4333-8333-333333333351','reembolsado','mercado_pago','payment-jd3',null,null,'delivery-refund');
  if v_idempotent then raise exception 'first refund was incorrectly replayed'; end if;
  if (select count(*) from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333351' and source='mercado_pago') <> 2 then raise exception 'refund did not append exactly one provider event'; end if;
  if not exists(select 1 from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333351' and provider_delivery_id='delivery-approved' and previous_status='pendente' and target_status='aprovado') then raise exception 'approval evidence was changed'; end if;
  select idempotent into v_idempotent from public.registrar_status_pagamento('33333333-3333-4333-8333-333333333351','reembolsado','mercado_pago','payment-jd3',null,null,'delivery-refund');
  if not v_idempotent then raise exception 'refund delivery replay was not idempotent'; end if;
  select idempotent into v_idempotent from public.registrar_status_pagamento('33333333-3333-4333-8333-333333333351','aprovado','mercado_pago','payment-jd3',null,null,'delivery-late-approved');
  if v_idempotent or (select status_pagamento from public.pedidos where id='33333333-3333-4333-8333-333333333351') <> 'reembolsado' then raise exception 'late approval resurrected revenue'; end if;
  if not exists(select 1 from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333351'
    and provider_delivery_id='delivery-late-approved'
    and observation_provenance='provider_approval_observed_after_reversal') then
    raise exception 'late approval was not preserved as observed evidence';
  end if;
end $$;
reset role;

-- A terminal provider observation can legitimately arrive before this system
-- has ever seen approval. It must converge without fabricating approval.
delete from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333353';
delete from public.pedidos where id='33333333-3333-4333-8333-333333333353';
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento)
values ('33333333-3333-4333-8333-333333333353','33333333-3333-4333-8333-333333333341','entregue','retirada',300,300,'pix','pendente');
set role service_role;
select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$ declare v_idempotent boolean; begin
  select idempotent into v_idempotent from public.registrar_status_pagamento(
    '33333333-3333-4333-8333-333333333353','reembolsado','mercado_pago',
    'payment-refund-first',null,null,'delivery-refund-first'
  );
  if v_idempotent then raise exception 'refund-first first delivery was unexpectedly replayed'; end if;
  if (select status_pagamento from public.pedidos where id='33333333-3333-4333-8333-333333333353') <> 'reembolsado' then
    raise exception 'refund-first did not converge to reembolsado';
  end if;
  if exists(select 1 from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333353' and target_status='aprovado') then
    raise exception 'refund-first invented approval evidence';
  end if;
  if not exists(select 1 from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333353'
    and provider_delivery_id='delivery-refund-first'
    and observation_provenance='provider_terminal_without_local_approval') then
    raise exception 'refund-first provenance is missing';
  end if;
  select idempotent into v_idempotent from public.registrar_status_pagamento(
    '33333333-3333-4333-8333-333333333353','reembolsado','mercado_pago',
    'payment-refund-first',null,null,'delivery-refund-first'
  );
  if not v_idempotent then raise exception 'refund-first exact replay was not idempotent'; end if;
  begin
    perform * from public.registrar_status_pagamento(
      '33333333-3333-4333-8333-333333333353','aprovado','mercado_pago',
      'different-payment',null,null,'delivery-refund-first'
    );
    raise exception 'conflicting delivery identity was accepted';
  exception when unique_violation then
    if sqlerrm <> 'MERCADO_PAGO_DELIVERY_CONFLICT' then raise; end if;
  end;
  select idempotent into v_idempotent from public.registrar_status_pagamento(
    '33333333-3333-4333-8333-333333333353','aprovado','mercado_pago',
    'payment-refund-first',null,null,'delivery-late-approval'
  );
  if v_idempotent or (select status_pagamento from public.pedidos where id='33333333-3333-4333-8333-333333333353') <> 'reembolsado' then
    raise exception 'late approval resurrected refund-first state';
  end if;
  if not exists(select 1 from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333353'
    and provider_delivery_id='delivery-late-approval'
    and observation_provenance='provider_approval_observed_after_reversal') then
    raise exception 'late approval evidence was not retained';
  end if;
  select idempotent into v_idempotent from public.registrar_status_pagamento(
    '33333333-3333-4333-8333-333333333353','reembolsado','mercado_pago',
    'payment-refund-first',null,null,'delivery-chargeback'
  );
  if v_idempotent then raise exception 'distinct chargeback observation was discarded'; end if;
  if not exists(select 1 from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333353'
    and provider_delivery_id='delivery-chargeback'
    and observation_provenance='provider_reversal_duplicate_observation') then
    raise exception 'duplicate terminal observation lacks provenance';
  end if;
end $$;
reset role;

-- Terminal reversals preserve chronological evidence and make a new receipt /
-- revenue assertion ineligible while preserving the already-issued receipt fixture.
do $$ declare v_events jsonb; v_receipt_id uuid; begin
  select jsonb_agg(jsonb_build_object('previous', previous_status, 'target', target_status, 'result', result_status) order by ledger_sequence)
    into v_events from public.pedido_payment_events where pedido_id='33333333-3333-4333-8333-333333333351' and source='mercado_pago';
  if v_events <> '[{"previous":"pendente","target":"aprovado","result":"aprovado"},{"previous":"aprovado","target":"reembolsado","result":"reembolsado"},{"previous":"reembolsado","target":"aprovado","result":"reembolsado"}]'::jsonb then raise exception 'payment reversal chronology is not append-only: %', v_events; end if;
  if not exists(select 1 from public.comprovantes_venda where pedido_id='33333333-3333-4333-8333-333333333351') then raise exception 'existing immutable receipt was lost'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333301',true);
  begin
    select receipt_id into v_receipt_id from public.emitir_comprovante_venda('33333333-3333-4333-8333-333333333353','33333333-3333-4333-8333-333333333397');
    raise exception 'refund-first order became receipt eligible: %', v_receipt_id;
  exception when invalid_parameter_value then
    if sqlerrm <> 'RECEIPT_ISSUANCE_INELIGIVEL' then raise; end if;
  end;
  reset role;
  insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento)
  values ('33333333-3333-4333-8333-333333333352','33333333-3333-4333-8333-333333333341','entregue','retirada',200,200,'pix','reembolsado');
  insert into public.pedido_payment_events(pedido_id,source,external_reference,provider_delivery_id,previous_status,target_status,result_status)
  values ('33333333-3333-4333-8333-333333333352','mercado_pago','payment-receipt-ineligible','delivery-receipt-approved','pendente','aprovado','aprovado'),
         ('33333333-3333-4333-8333-333333333352','mercado_pago','payment-receipt-ineligible','delivery-receipt-refund','aprovado','reembolsado','reembolsado');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333301',true);
  begin
    select receipt_id into v_receipt_id from public.emitir_comprovante_venda('33333333-3333-4333-8333-333333333352','33333333-3333-4333-8333-333333333398');
    raise exception 'refunded order became revenue / receipt eligible: %', v_receipt_id;
  exception when invalid_parameter_value then
    if sqlerrm <> 'RECEIPT_ISSUANCE_INELIGIVEL' then raise; end if;
  end;
end $$;

select pass('JD3 database runtime proves append-only reversal chronology, receipt ineligibility, and no resurrection');
select * from finish();
