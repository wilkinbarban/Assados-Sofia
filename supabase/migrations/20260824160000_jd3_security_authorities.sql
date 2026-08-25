-- JD3 bounded correction: service-only OTP orchestration, identity binding,
-- reversible payment refunds, and transactional account anonymisation.

-- Browser roles must never fabricate, activate, consume, or recover OTP state.
revoke all on function public.solicitar_desafio_otp(varchar, public.tipo_desafio_otp, varchar, varchar, uuid) from public, anon, authenticated;
grant execute on function public.solicitar_desafio_otp(varchar, public.tipo_desafio_otp, varchar, varchar, uuid) to service_role;
revoke all on function public.ativar_desafio_otp(uuid, boolean, jsonb, integer) from public, anon, authenticated;
grant execute on function public.ativar_desafio_otp(uuid, boolean, jsonb, integer) to service_role;
revoke all on function public.finalizar_desafio_otp(uuid, varchar, public.tipo_desafio_otp, varchar, uuid, varchar, varchar) from public, anon, authenticated;
grant execute on function public.finalizar_desafio_otp(uuid, varchar, public.tipo_desafio_otp, varchar, uuid, varchar, varchar) to service_role;
revoke all on function public.consumir_desafio_recuperacao(uuid, varchar, varchar) from public, anon, authenticated;
grant execute on function public.consumir_desafio_recuperacao(uuid, varchar, varchar) to service_role;
revoke all on function public.aplicar_concessao_recuperacao(uuid, text) from public, anon, authenticated;
grant execute on function public.aplicar_concessao_recuperacao(uuid, text) to service_role;

-- The original authority is retained, but a caller can no longer select the
-- account: signup uses the challenge's immutable usuario_id after its lock.
create or replace function public.finalizar_desafio_otp(
  p_desafio_id uuid, p_telefone varchar, p_proposito public.tipo_desafio_otp,
  p_hash_codigo varchar, p_usuario_id uuid default null, p_nome varchar default null,
  p_origem_verificacao varchar default 'whatsapp'
) returns table(sucesso boolean, codigo_erro text, cliente_id uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare v_desafio record; v_cliente_id uuid; v_cliente_existente_id uuid; v_cliente_rascunho_id uuid;
begin
  select * into v_desafio from public.desafios_otp where id = p_desafio_id for update;
  if not found then return query select false, 'DESAFIO_NAO_ENCONTRADO', null::uuid; return; end if;
  if v_desafio.status <> 'active'::public.status_desafio_otp then return query select false, 'DESAFIO_INVALIDO', null::uuid; return; end if;
  if v_desafio.telefone <> p_telefone then return query select false, 'TELEFONE_INCORRETO', null::uuid; return; end if;
  if v_desafio.proposito <> p_proposito then return query select false, 'PROPOSITO_INVALIDO', null::uuid; return; end if;
  if p_proposito = 'signup'::public.tipo_desafio_otp and v_desafio.usuario_id is null then return query select false, 'USUARIO_DESAFIO_AUSENTE', null::uuid; return; end if;
  if p_usuario_id is not null and v_desafio.usuario_id is distinct from p_usuario_id then return query select false, 'USUARIO_DESAFIO_INCORRETO', null::uuid; return; end if;
  -- Trust the locked challenge rather than any browser-supplied user id.
  p_usuario_id := v_desafio.usuario_id;
  if v_desafio.expira_em <= now() then update public.desafios_otp set status='expired' where id=p_desafio_id; return query select false, 'DESAFIO_EXPIRADO', null::uuid; return; end if;
  if v_desafio.tentativas >= v_desafio.max_tentativas then update public.desafios_otp set status='expired' where id=p_desafio_id; return query select false, 'MAXIMO_TENTATIVAS_EXCEDIDO', null::uuid; return; end if;
  if v_desafio.hash_codigo <> p_hash_codigo then update public.desafios_otp set tentativas=tentativas+1, status=case when tentativas+1>=max_tentativas then 'expired' else status end where id=p_desafio_id; return query select false, 'CODIGO_INVALIDO', null::uuid; return; end if;
  update public.desafios_otp set status='consumed', consumido_em=now() where id=p_desafio_id;
  if p_proposito in ('signup'::public.tipo_desafio_otp, 'phone_change'::public.tipo_desafio_otp) then
    select id into v_cliente_existente_id from public.clientes where telefone=p_telefone limit 1;
    if p_usuario_id is not null then select id into v_cliente_rascunho_id from public.clientes where usuario_id=p_usuario_id limit 1; end if;
    if v_cliente_existente_id is not null then
      v_cliente_id := v_cliente_existente_id;
      update public.clientes set usuario_id=coalesce(p_usuario_id, usuario_id), nome=coalesce(p_nome,nome), telefone_verificado_em=now(), telefone_verificado_origem=p_origem_verificacao where id=v_cliente_id;
      if v_cliente_rascunho_id is not null and v_cliente_rascunho_id <> v_cliente_id then perform public.mesclar_dependencias_cliente(v_cliente_rascunho_id,v_cliente_id); delete from public.clientes where id=v_cliente_rascunho_id; end if;
    elsif v_cliente_rascunho_id is not null then
      v_cliente_id:=v_cliente_rascunho_id; update public.clientes set telefone=p_telefone,nome=coalesce(p_nome,nome),telefone_verificado_em=now(),telefone_verificado_origem=p_origem_verificacao where id=v_cliente_id;
    else
      insert into public.clientes(usuario_id,nome,telefone,telefone_verificado_em,telefone_verificado_origem) values(p_usuario_id,coalesce(p_nome,'Novo Cliente'),p_telefone,now(),p_origem_verificacao) returning id into v_cliente_id;
    end if;
    insert into public.logs_auditoria(usuario_id,acao,detalhes) values(p_usuario_id,'cliente_telefone_verificado',jsonb_build_object('cliente_id',v_cliente_id,'desafio_id',p_desafio_id,'proposito',p_proposito));
  end if;
  return query select true, null::text, v_cliente_id;
end $$;

-- Mercado Pago has one immutable delivery id; a refund is the permitted next
-- state for that same delivery, not an accidental conflict or new payment.
create or replace function public.registrar_status_pagamento(
  p_pedido_id uuid, p_novo_status public.status_pagamento, p_source text,
  p_external_reference text default null, p_reason text default null, p_idempotency_key uuid default null
) returns table(pedido_id uuid,status_pagamento public.status_pagamento,idempotent boolean,google_event_id text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_order public.pedidos%rowtype; v_event public.pedido_payment_events%rowtype; v_reason text:=nullif(btrim(p_reason),''); v_external_reference text:=nullif(btrim(p_external_reference),'');
begin
 if p_pedido_id is null or p_novo_status is null or p_source not in ('manual','mercado_pago') then raise exception using errcode='22023',message='DADOS_PAGAMENTO_INVALIDOS'; end if;
 if p_source='mercado_pago' then
   if coalesce(auth.jwt()->>'role','') <> 'service_role' or v_actor is not null then raise exception using errcode='42501',message='MERCADO_PAGO_SERVICE_ROLE_REQUIRED'; end if;
   if v_external_reference is null then raise exception using errcode='22023',message='MERCADO_PAGO_EXTERNAL_REFERENCE_REQUIRED'; end if;
   if v_reason is not null then raise exception using errcode='22023',message='MERCADO_PAGO_REASON_FORBIDDEN'; end if;
 else
   if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
   if v_reason is null then raise exception using errcode='22023',message='MANUAL_PAYMENT_REASON_REQUIRED'; end if;
   if p_idempotency_key is null then raise exception using errcode='22023',message='MANUAL_PAYMENT_IDEMPOTENCY_KEY_REQUIRED'; end if;
   if v_external_reference is not null then raise exception using errcode='22023',message='MANUAL_PAYMENT_EXTERNAL_REFERENCE_FORBIDDEN'; end if;
 end if;
 select * into v_order from public.pedidos where id=p_pedido_id for update; if not found then raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO'; end if;
 if p_source='manual' then
   select e.* into v_event from public.pedido_payment_events e where e.source='manual' and e.pedido_id=p_pedido_id and e.idempotency_key=p_idempotency_key;
   if found then
     if v_event.target_status<>p_novo_status or v_event.reason is distinct from v_reason or v_event.actor_id is distinct from v_actor then raise exception using errcode='23505',message='MANUAL_PAYMENT_IDEMPOTENCY_CONFLICT'; end if;
     return query select v_order.id,v_event.result_status,true,v_order.google_event_id::text; return;
   end if;
 end if;
 if p_source='mercado_pago' then
   select * into v_event from public.pedido_payment_events where source='mercado_pago' and external_reference=v_external_reference;
   if found then
     if v_event.pedido_id<>p_pedido_id then raise exception using errcode='23505',message='MERCADO_PAGO_EXTERNAL_REFERENCE_CONFLICT'; end if;
     if v_event.target_status=p_novo_status then return query select v_order.id,v_order.status_pagamento,true,v_order.google_event_id::text; return; end if;
     if v_event.target_status='aprovado'::public.status_pagamento and p_novo_status='reembolsado'::public.status_pagamento then
       update public.pedidos set status_pagamento='reembolsado',data_atualizacao=now() where id=p_pedido_id;
       update public.pedido_payment_events set target_status='reembolsado',result_status='reembolsado' where id=v_event.id;
       return query select v_order.id,'reembolsado'::public.status_pagamento,false,v_order.google_event_id::text; return;
     end if;
     raise exception using errcode='23505',message='MERCADO_PAGO_EXTERNAL_REFERENCE_CONFLICT';
   end if;
 end if;
 update public.pedidos set status_pagamento=p_novo_status,mercado_pago_pagamento_id=case when p_source='mercado_pago' then v_external_reference else mercado_pago_pagamento_id end,data_atualizacao=now() where id=p_pedido_id;
 insert into public.pedido_payment_events(pedido_id,source,actor_id,external_reference,idempotency_key,reason,previous_status,target_status,result_status) values(p_pedido_id,p_source,v_actor,v_external_reference,p_idempotency_key,v_reason,v_order.status_pagamento,p_novo_status,p_novo_status);
 return query select v_order.id,p_novo_status,false,v_order.google_event_id::text;
end $$;
revoke all on function public.registrar_status_pagamento(uuid,public.status_pagamento,text,text,text,uuid) from public, anon;
grant execute on function public.registrar_status_pagamento(uuid,public.status_pagamento,text,text,text,uuid) to authenticated, service_role;

alter table public.perfis add column if not exists deletion_requested_at timestamptz;
-- The constrained 8-digit suffix has 100M values. A sequence gives each
-- deletion a distinct candidate; the loop also skips any historic collision.
create sequence if not exists public.deleted_customer_phone_sequence minvalue 0 maxvalue 99999999;
create or replace function public.anonymizar_usuario_admin(p_usuario_alvo_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_target public.perfis%rowtype; v_remaining_admins integer; v_anonymized_phone varchar(20); v_attempt integer:=0;
begin
 if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao]) then raise exception using errcode='42501',message='USUARIO_NAO_AUTORIZADO'; end if;
 if v_actor=p_usuario_alvo_id then raise exception using errcode='42501',message='ANTI_LOCKOUT_AUTO_EXCLUSAO'; end if;
 select * into v_target from public.perfis where id=p_usuario_alvo_id for update; if not found then raise exception using errcode='P0002',message='PERFIL_ALVO_NAO_ENCONTRADO'; end if;
 if v_target.funcao='admin' and v_target.ativo then select count(*) into v_remaining_admins from public.perfis where funcao='admin' and ativo and id<>p_usuario_alvo_id for update; if v_remaining_admins<1 then raise exception using errcode='42501',message='MINIMO_UM_ADMIN_ATIVO'; end if; end if;
 loop
   v_attempt:=v_attempt+1;
   if v_attempt > 100 then raise exception using errcode='54000',message='ANONYMIZED_PHONE_NAMESPACE_EXHAUSTED'; end if;
   v_anonymized_phone:='55419'||lpad(nextval('public.deleted_customer_phone_sequence')::text,8,'0');
   exit when not exists (select 1 from public.clientes where telefone=v_anonymized_phone);
 end loop;
 update public.clientes set usuario_id=null,nome='Deleted customer',telefone=v_anonymized_phone,email=null,telegram_chat_id=null where usuario_id=p_usuario_alvo_id;
 -- Do not alter nome: its legacy self-service audit trigger deliberately
 -- rejects cross-user writes. Disabling plus the detached customer state is the
 -- safe, recoverable deletion boundary.
 update public.perfis set ativo=false,deletion_requested_at=now() where id=p_usuario_alvo_id;
 insert into public.logs_auditoria(usuario_id,acao,detalhes) values(v_actor,'anonymizar_usuario',jsonb_build_object('usuario_alvo_id',p_usuario_alvo_id,'auth_delete_pending',true));
end $$;
revoke all on function public.anonymizar_usuario_admin(uuid) from public,anon;
grant execute on function public.anonymizar_usuario_admin(uuid) to authenticated;

-- A refund makes a new sales receipt ineligible while never modifying an
-- already-issued immutable snapshot.
create or replace function public.emitir_comprovante_venda(p_pedido_id uuid, p_idempotency_key uuid)
returns table(receipt_id uuid, snapshot jsonb, snapshot_hash text, idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_order public.pedidos%rowtype; v_existing public.comprovantes_venda%rowtype; v_snapshot jsonb; v_hash text;
begin
 if p_pedido_id is null or p_idempotency_key is null then raise exception using errcode='22023',message='SALES_RECEIPT_INPUT_INVALID'; end if;
 if v_actor is null or not public.tem_funcoes(array['admin'::public.tipo_funcao,'supervisor'::public.tipo_funcao,'vendedor'::public.tipo_funcao]) then raise exception using errcode='42501',message='SALES_RECEIPT_OPERATOR_REQUIRED'; end if;
 select * into v_order from public.pedidos where id=p_pedido_id for update; if not found then raise exception using errcode='P0002',message='PEDIDO_NAO_ENCONTRADO'; end if;
 select * into v_existing from public.comprovantes_venda where pedido_id=p_pedido_id; if found then return query select v_existing.id,v_existing.snapshot,v_existing.snapshot_hash,true; return; end if;
 if v_order.status <> 'entregue' or v_order.status_pagamento <> 'aprovado' then raise exception using errcode='22023',message='RECEIPT_ISSUANCE_INELIGIVEL'; end if;
 v_snapshot:=jsonb_build_object('order',jsonb_build_object('id',v_order.id,'status',v_order.status,'delivery_type',v_order.tipo_entrega,'delivery_address',v_order.endereco_entrega,'total_products_centavos',v_order.total_produtos_centavos,'delivery_fee_centavos',v_order.taxa_entrega_centavos,'total_order_centavos',v_order.total_pedido_centavos),'customer',(select jsonb_build_object('id',c.id,'name',c.nome,'phone',c.telefone) from public.clientes c where c.id=v_order.cliente_id),'line_items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.produto_id,'name',p.nome,'quantity',i.quantidade,'unit_price_centavos',i.preco_unitario_centavos,'line_total_centavos',i.quantidade*i.preco_unitario_centavos) order by i.id) from public.itens_pedido i join public.produtos p on p.id=i.produto_id where i.pedido_id=v_order.id),'[]'::jsonb),'charged_amount_centavos',v_order.total_pedido_centavos,'payment',jsonb_build_object('status',v_order.status_pagamento,'method',v_order.meio_pagamento),'establishment',jsonb_build_object('name',coalesce(nullif(current_setting('app.establishment_name',true),''),'Asados')),'payment_provenance',coalesce((select jsonb_agg(jsonb_build_object('source',e.source,'external_reference',e.external_reference,'reason',e.reason,'previous_status',e.previous_status,'target_status',e.target_status,'recorded_at',e.created_at) order by e.created_at,e.id) from public.pedido_payment_events e where e.pedido_id=v_order.id),'[]'::jsonb),'issuance',jsonb_build_object('issued_by',v_actor,'issued_at',now(),'snapshot_version',1));
 v_hash:=encode(extensions.digest(v_snapshot::text,'sha256'),'hex');
 insert into public.comprovantes_venda(pedido_id,cliente_id,idempotency_key,snapshot,snapshot_hash,issued_by) values(v_order.id,v_order.cliente_id,p_idempotency_key,v_snapshot,v_hash,v_actor) returning * into v_existing;
 return query select v_existing.id,v_existing.snapshot,v_existing.snapshot_hash,false;
end $$;
revoke all on function public.emitir_comprovante_venda(uuid,uuid) from public,anon;
grant execute on function public.emitir_comprovante_venda(uuid,uuid) to authenticated;
