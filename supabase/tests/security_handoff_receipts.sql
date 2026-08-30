-- Runtime authorization coverage for Sofia handoff writers and legacy receipt RLS.
\ir ../migrations/20260828100000_sofia_handoff_authorization.sql
\ir ../migrations/20260828101000_comprovantes_active_staff_rls.sql
begin;
select plan(8);

insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
 ('6a000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','security-active@test',now(),now()),
 ('6a000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','security-inactive@test',now(),now()),
 ('6a000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','security-owner@test',now(),now())
on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('6a000000-0000-4000-8000-000000000001','Active operator','vendedor',true),
 ('6a000000-0000-4000-8000-000000000002','Inactive operator','vendedor',false),
 ('6a000000-0000-4000-8000-000000000003','Receipt owner','cliente',true)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;
insert into public.clientes(id,usuario_id,nome,telefone) values
 ('6a000000-0000-4000-8000-000000000010','6a000000-0000-4000-8000-000000000003','Receipt owner','5541960000010'),
 ('6a000000-0000-4000-8000-000000000011',null,'Webhook customer','5541960000011')
on conflict(id) do nothing;
insert into public.comprovantes(id,cliente_id,url_arquivo,nome_arquivo,tamanho_bytes) values
 ('6a000000-0000-4000-8000-000000000020','6a000000-0000-4000-8000-000000000010','security/receipt.pdf','receipt.pdf',10)
on conflict(id) do nothing;

select ok(not has_function_privilege('anon','public.silenciar_sofia_cliente(uuid,integer,character varying,uuid)','execute'),'anonymous cannot execute Sofia mute');

set local role authenticated;
select set_config('request.jwt.claim.sub','6a000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.silenciar_sofia_cliente('6a000000-0000-4000-8000-000000000011',30,'cooldown_operador',null)$$,
  '42501','SOFIA_HANDOFF_OPERATOR_REQUIRED','inactive operator cannot mute Sofia'
);
select is((select count(*)::integer from public.comprovantes),0,'inactive operator cannot read legacy receipts');

select set_config('request.jwt.claim.sub','6a000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.silenciar_sofia_cliente('6a000000-0000-4000-8000-000000000011',30,'cooldown_operador','6a000000-0000-4000-8000-000000000002')$$,
  'active operator can mute Sofia'
);
select is(
  (select alterado_por from public.whatsapp_sofia_states where cliente_id='6a000000-0000-4000-8000-000000000011' and canal='whatsapp'),
  '6a000000-0000-4000-8000-000000000001'::uuid,
  'database derives the operator actor instead of trusting p_usuario_id'
);
select is((select count(*)::integer from public.comprovantes),1,'active operator can read legacy receipts');

select set_config('request.jwt.claim.sub','6a000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.comprovantes),1,'customer still reads own legacy receipt');

set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim','{"role":"service_role"}',true);
select lives_ok(
  $$select public.reativar_sofia_cliente('6a000000-0000-4000-8000-000000000011',null)$$,
  'service role preserves internal webhook handoff workflow'
);

reset role;
select * from finish();
rollback;
