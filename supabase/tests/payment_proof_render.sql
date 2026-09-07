
\ir ../migrations/20260903190000_payment_proof_immutable_delivery_provenance.sql
select plan(1);
set role postgres;
insert into public.clientes(id,nome,telefone) values
('30303030-3030-4030-8030-303030303021','Render customer','5541999999983') on conflict do nothing;
insert into public.conversas(id,cliente_id,status,ia_ativa) values
('30303030-3030-4030-8030-303030303041','30303030-3030-4030-8030-303030303021','aberta',false) on conflict do nothing;
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos) values
('30303030-3030-4030-8030-303030303061','30303030-3030-4030-8030-303030303021','confirmado','pendente','retirada','pix',4200,0,4200) on conflict do nothing;
reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$
declare p record; first_event bigint; replay_event bigint;
begin
 select * into p from public.admit_payment_proof_intake(
  'web','render-one','30303030-3030-4030-8030-303030303021',null,
  'proofs/private/render-one.pdf',100,'application/pdf','30303030-3030-4030-8030-303030303061',
  '30303030-3030-4030-8030-303030303041',repeat('2',64));
 select public.record_payment_proof_render(
  p.proof_id,'render-one','proofs/private/render-one.png',repeat('b',64),1200,600,'pdf-parse-2.4.5/w1200'
 ) into first_event;
 select public.record_payment_proof_render(
  p.proof_id,'render-one','proofs/private/render-one.png',repeat('b',64),1200,600,'pdf-parse-2.4.5/w1200'
 ) into replay_event;
 if first_event<>replay_event then raise exception 'render replay was not idempotent';end if;
 if (select count(*) from public.payment_proof_events where proof_id=p.proof_id and event_type='preview_rendered')<>1
 then raise exception 'render metadata was not append-once';end if;
 if (select preview_storage_key from public.payment_proofs where id=p.proof_id)<>'proofs/private/render-one.png'
 then raise exception 'private PNG key was not persisted';end if;
 begin
  perform public.record_payment_proof_render(
   p.proof_id,'render-one','proofs/private/render-one-changed.png',repeat('c',64),1200,600,'pdf-parse-2.4.5/w1200');
  raise exception 'changed render replay unexpectedly succeeded';
 exception when unique_violation then null;end;
end $$;
reset role;
select pass('render metadata is service-only, private, append-once, and idempotent');
select * from finish();
