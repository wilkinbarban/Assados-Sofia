\ir ../migrations/20260903190000_payment_proof_immutable_delivery_provenance.sql
select plan(1);
set role postgres;
insert into public.clientes(id,nome,telefone) values('27272727-2727-4272-8272-272727272721','Intake','5541999999971') on conflict(id) do nothing;
insert into public.conversas(id,cliente_id,status,ia_ativa) values('27272727-2727-4272-8272-272727272741','27272727-2727-4272-8272-272727272721','aberta',false) on conflict do nothing;
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos) values('27272727-2727-4272-8272-272727272761','27272727-2727-4272-8272-272727272721','confirmado','pendente','retirada','pix',4200,0,4200) on conflict do nothing;
reset role; set role service_role; select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$ declare a record;b record;n integer; begin
 select * into a from public.admit_payment_proof_intake('web','delivery-1','27272727-2727-4272-8272-272727272721',null,'proofs/private/a.pdf',100,'application/pdf','27272727-2727-4272-8272-272727272761','27272727-2727-4272-8272-272727272741',repeat('7',64));
 select * into b from public.admit_payment_proof_intake('web','delivery-1','27272727-2727-4272-8272-272727272721',null,'proofs/private/a.pdf',100,'application/pdf','27272727-2727-4272-8272-272727272761','27272727-2727-4272-8272-272727272741',repeat('7',64));
 if a.status<>'received' or a.idempotent or not b.idempotent or a.proof_id<>b.proof_id then raise exception 'delivery replay was not idempotent'; end if;
 begin
  perform * from public.admit_payment_proof_intake('telegram','delivery-1',null,'999','proofs/private/b.pdf',100,'application/pdf',null,null,repeat('8',64));
  raise exception 'unknown sender unexpectedly admitted';
 exception when invalid_parameter_value then
  if sqlerrm <> 'PAYMENT_PROOF_CONVERSATION_REQUIRED' then raise; end if;
 end;
 select count(*) into n from public.payment_proofs where status='identity_pending';
 if n<>0 then raise exception 'unknown proof became visible'; end if;
end $$;
reset role;
select pass('intake authority proves replay, cross-channel identity, unknown invisibility');
select * from finish();
