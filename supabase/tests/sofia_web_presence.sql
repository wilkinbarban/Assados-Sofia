create extension if not exists pgtap;
\ir ../migrations/20260910010000_sofia_humanized_timing.sql
\ir ../migrations/20260911020000_sofia_activity_core_a_corrective.sql
\ir ../migrations/20260912020000_sofia_web_presence.sql
select plan(6);

select function_privs_are(
  'public', 'get_sofia_conversation_presence', array['uuid'], 'authenticated', array['EXECUTE'],
  'authenticated users may read only the filtered presence projection'
);
select function_privs_are(
  'public', 'get_sofia_conversation_presence', array['uuid'], 'anon', array[]::text[],
  'anonymous users cannot read presence'
);

insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
  ('cb100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'presence-owner@example.test', now(), now()),
  ('cb100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'presence-outsider@example.test', now(), now())
on conflict (id) do nothing;
insert into public.clientes(id, nome, telefone, usuario_id) values
  ('cb200000-0000-4000-8000-000000000001', 'Presence Owner', '5541992222202', 'cb100000-0000-4000-8000-000000000001');
insert into public.conversas(id, cliente_id, ia_ativa, status) values
  ('cb300000-0000-4000-8000-000000000001', 'cb200000-0000-4000-8000-000000000001', true, 'ia_atendendo');
insert into public.sofia_inbound_batches(id, conversa_id, cliente_id, canal, first_message_at, latest_message_at, scheduled_process_at, status, lease_token, claimed_until)
values (
  'cb400000-0000-4000-8000-000000000001', 'cb300000-0000-4000-8000-000000000001', 'cb200000-0000-4000-8000-000000000001',
  'web', clock_timestamp(), clock_timestamp(), clock_timestamp(), 'processing', gen_random_uuid(), clock_timestamp() + interval '1 minute'
);
insert into public.sofia_conversation_presence(conversa_id, status, owner_kind, owner_token, attempt_id, source_batch_id, expires_at)
values (
  'cb300000-0000-4000-8000-000000000001', 'composing', 'generation', gen_random_uuid(), gen_random_uuid(),
  'cb400000-0000-4000-8000-000000000001', clock_timestamp() + interval '30 seconds'
);

set role authenticated;
select set_config('request.jwt.claim.sub', 'cb100000-0000-4000-8000-000000000001', false);
select is(
  (select status from public.get_sofia_conversation_presence('cb300000-0000-4000-8000-000000000001')),
  'composing', 'conversation owner reads a live composing projection'
);
update public.sofia_conversation_presence set expires_at = clock_timestamp() - interval '1 second'
where conversa_id = 'cb300000-0000-4000-8000-000000000001';
select is_empty(
  $$select * from public.get_sofia_conversation_presence('cb300000-0000-4000-8000-000000000001')$$,
  'expired presence never reaches the customer projection'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'cb100000-0000-4000-8000-000000000002', false);
select throws_ok(
  $$select * from public.get_sofia_conversation_presence('cb300000-0000-4000-8000-000000000001')$$,
  '42501', 'SOFIA_PRESENCE_ACCESS_DENIED', 'unrelated customer cannot read another conversation presence'
);
reset role;

select set_config('request.jwt.claim', '{"role":"anon"}', false);
select throws_ok(
  $$select * from public.get_sofia_conversation_presence('cb300000-0000-4000-8000-000000000001')$$,
  '42501', 'SOFIA_PRESENCE_ACCESS_DENIED', 'anonymous caller fails closed'
);
select * from finish();
