-- Real runtime fixture harness. Runs only against the existing migrated database.
-- Fixture UUIDs are deterministic and cleaned before and after the assertions.
select plan(1);

-- Seed under postgres; never use an application role to manufacture fixtures.
set role postgres;
delete from public.pedido_lifecycle_events where pedido_id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.pedido_estoque_snapshots where pedido_id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.pedido_estoque_efeitos where pedido_id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.itens_pedido where pedido_id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.produtos where id='11111111-1111-4111-8111-111111111115';
delete from public.pedidos where id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.clientes where id = '11111111-1111-4111-8111-111111111110';
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('11111111-1111-4111-8111-111111111101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lifecycle-operator@example.test','',now(),'{}','{}',now(),now()),
 ('11111111-1111-4111-8111-111111111102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lifecycle-customer@example.test','',now(),'{}','{}',now(),now())
on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('11111111-1111-4111-8111-111111111101','Lifecycle operator','admin',true),
 ('11111111-1111-4111-8111-111111111102','Lifecycle customer','cliente',true)
on conflict(id) do update set funcao=excluded.funcao, ativo=excluded.ativo;
insert into public.clientes(id,usuario_id,nome,telefone) values
 ('11111111-1111-4111-8111-111111111110','11111111-1111-4111-8111-111111111102','Lifecycle customer','5541999999911');
insert into public.produtos(id,nome,preco_centavos,ativo,quantidade_estoque,controlar_estoque) values
 ('11111111-1111-4111-8111-111111111115','Lifecycle product',100,true,10,true);
insert into public.pedidos(id,cliente_id,status,tipo_entrega,total_produtos_centavos,total_pedido_centavos,meio_pagamento,status_pagamento,estoque_estado) values
 ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111110','novo','retirada',100,100,'dinheiro','pendente','pendente'),
 ('11111111-1111-4111-8111-111111111112','11111111-1111-4111-8111-111111111110','novo','retirada',200,200,'dinheiro','pendente','pendente'),
 ('11111111-1111-4111-8111-111111111113','11111111-1111-4111-8111-111111111110','confirmado','retirada',300,300,'dinheiro','pendente','aplicado'),
 ('11111111-1111-4111-8111-111111111114','11111111-1111-4111-8111-111111111110','entregue','retirada',400,400,'dinheiro','pendente','aplicado');
insert into public.itens_pedido(id,pedido_id,produto_id,preco_unitario_centavos,quantidade) values
 ('11111111-1111-4111-8111-111111111116','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111115',100,1);

reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$
declare v_status public.status_pedido; v_payment public.status_pagamento; v_stock text;
begin
  begin
    perform * from public.transicionar_pedido('11111111-1111-4111-8111-111111111111','entregue','11111111-1111-4111-8111-111111111121','invalid target');
    raise exception 'invalid transition committed';
  exception when check_violation then
    if sqlerrm <> 'TRANSICAO_PEDIDO_INVALIDA' then raise; end if;
  end;
  select status,status_pagamento into v_status,v_payment from public.pedidos where id='11111111-1111-4111-8111-111111111111';
  if v_status <> 'novo' or v_payment <> 'pendente' or exists(select 1 from public.pedido_lifecycle_events where pedido_id='11111111-1111-4111-8111-111111111111') then
    raise exception 'invalid lifecycle rejection mutated order';
  end if;

  perform * from public.transicionar_pedido('11111111-1111-4111-8111-111111111112','cancelado','11111111-1111-4111-8111-111111111122','customer withdrew');
  select status,estoque_estado into v_status,v_stock from public.pedidos where id='11111111-1111-4111-8111-111111111112';
  if v_status <> 'cancelado' or v_stock <> 'pendente' then
    raise exception 'novo cancellation left stock untouched assertion failed';
  end if;

  if not exists(select 1 from public.relatorio_classificacao_legado_pedidos where pedido_id='11111111-1111-4111-8111-111111111114' and classification='needs_review') then
    raise exception 'legacy delivered/pending fixture was not classified';
  end if;
end $$;

-- Legacy wrappers must not be callable by authenticated API roles: only the
-- SECURITY DEFINER lifecycle authority may invoke them internally.
set role authenticated;
select set_config('request.jwt.claim','{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111101"}',false);
do $$
begin
  begin
    perform * from public.confirmar_pedido_estoque('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111141');
    raise exception 'legacy stock wrapper unexpectedly executed';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

set role postgres;
do $$
declare
  v_role text;
begin
  foreach v_role in array array['public', 'anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.confirmar_pedido_estoque(uuid,uuid)', 'execute')
      or has_function_privilege(v_role, 'public.cancelar_pedido_estoque(uuid,uuid)', 'execute') then
      raise exception 'legacy wrapper execute remains granted to %', v_role;
    end if;
  end loop;
end $$;
reset role;

-- The canonical function remains the sole atomic, idempotent, audited route.
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$
declare v_events integer; v_status public.status_pedido;
begin
  perform * from public.transicionar_pedido('11111111-1111-4111-8111-111111111111','confirmado','11111111-1111-4111-8111-111111111142','canonical confirmation');
  perform * from public.transicionar_pedido('11111111-1111-4111-8111-111111111111','confirmado','11111111-1111-4111-8111-111111111142','canonical confirmation');
  perform * from public.transicionar_pedido('11111111-1111-4111-8111-111111111111','cancelado','11111111-1111-4111-8111-111111111143','canonical cancellation');
  select status into v_status from public.pedidos where id='11111111-1111-4111-8111-111111111111';
  select count(*) into v_events from public.pedido_lifecycle_events where pedido_id='11111111-1111-4111-8111-111111111111';
  if v_status <> 'cancelado' or v_events <> 2 then
    raise exception 'canonical confirm/cancel was not atomic, idempotent, and audited';
  end if;
end $$;
reset role;

-- legacy stock wrappers deny authenticated execution; canonical confirm/cancel remain atomic, idempotent, and audited.

-- This harness runs only in the disposable verification database where dblink
-- is installed. The runner injects an authenticated loopback connection only
-- into the disposable database session; production policy stays unchanged.
create extension if not exists dblink;
select dblink_connect('delivery_terminal', :'runtime_dblink_conninfo');
select dblink_connect('cancellation_terminal', :'runtime_dblink_conninfo');
select dblink_exec('delivery_terminal', $$set request.jwt.claim = '{"role":"service_role"}'$$);
select dblink_exec('cancellation_terminal', $$set request.jwt.claim = '{"role":"service_role"}'$$);
select dblink_send_query('delivery_terminal', $$select status::text from public.transicionar_pedido('11111111-1111-4111-8111-111111111113', 'entregue', '11111111-1111-4111-8111-111111111131', 'delivery terminal')$$);
select dblink_send_query('cancellation_terminal', $$select status::text from public.transicionar_pedido('11111111-1111-4111-8111-111111111113', 'cancelado', '11111111-1111-4111-8111-111111111132', 'cancellation terminal')$$);
select * from dblink_get_result('delivery_terminal', false) as result(status text);
select * from dblink_get_result('cancellation_terminal', false) as result(status text);
select dblink_disconnect('delivery_terminal');
select dblink_disconnect('cancellation_terminal');
do $$
declare v_status public.status_pedido; v_stock text; v_events integer;
begin
  select status, estoque_estado into v_status, v_stock
  from public.pedidos where id = '11111111-1111-4111-8111-111111111113';
  select count(*) into v_events from public.pedido_lifecycle_events
  where pedido_id = '11111111-1111-4111-8111-111111111113';
  if v_events <> 1 then
    raise exception 'concurrent terminal transitions committed % events instead of exactly one', v_events;
  end if;
  if (v_status = 'entregue' and v_stock <> 'aplicado')
      or (v_status = 'cancelado' and v_stock <> 'restaurado')
      or v_status not in ('entregue'::public.status_pedido, 'cancelado'::public.status_pedido) then
    raise exception 'concurrent terminal transition corrupted final status % or stock %', v_status, v_stock;
  end if;
end $$;

select pass('lifecycle runtime proves rejection, novo cancellation stock isolation, legacy classification, and concurrent delivery/cancellation single-winner authority');

delete from public.pedido_lifecycle_events where pedido_id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.pedido_estoque_snapshots where pedido_id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.pedido_estoque_efeitos where pedido_id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.itens_pedido where pedido_id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.produtos where id='11111111-1111-4111-8111-111111111115';
delete from public.pedidos where id::text like '11111111-1111-4111-8111-1111111111%';
delete from public.clientes where id='11111111-1111-4111-8111-111111111110';
select * from finish();
