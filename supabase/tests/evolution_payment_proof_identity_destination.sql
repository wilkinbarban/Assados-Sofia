-- The resolver migration must be committed before dblink sessions can invoke it.
\ir ../migrations/20260903180000_evolution_payment_proof_identity_destination.sql
create extension if not exists dblink;

begin;
select plan(16);

select ok(has_function_privilege('service_role', 'public.resolve_evolution_payment_proof_identity_destination(text,text)', 'EXECUTE'), 'service_role can execute the Evolution identity destination resolver');
select ok(not exists (select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl where p.oid = 'public.resolve_evolution_payment_proof_identity_destination(text,text)'::regprocedure and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'), 'PUBLIC has no execute grant on the Evolution identity destination resolver');
select ok(not has_function_privilege('anon', 'public.resolve_evolution_payment_proof_identity_destination(text,text)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.resolve_evolution_payment_proof_identity_destination(text,text)', 'EXECUTE'), 'browser roles cannot execute the Evolution identity destination resolver');

set role anon;
select throws_ok($$select * from public.resolve_evolution_payment_proof_identity_destination('5541998888801', 'Anon')$$, '42501', 'permission denied for function resolve_evolution_payment_proof_identity_destination', 'anon invocation is denied with a stable privilege error');
reset role;
set role authenticated;
select throws_ok($$select * from public.resolve_evolution_payment_proof_identity_destination('5541998888801', 'Authenticated')$$, '42501', 'permission denied for function resolve_evolution_payment_proof_identity_destination', 'authenticated invocation is denied with a stable privilege error');
reset role;

set role postgres;
insert into public.clientes(id, nome, telefone) values
  ('91919191-9191-4191-8191-919191919101', 'Existing customer', '5541998888804') ;
insert into public.conversas(id, cliente_id, status, ia_ativa, data_atualizacao) values
  ('91919191-9191-4191-8191-919191919111', '91919191-9191-4191-8191-919191919101', 'fechada', false, '2026-09-03 18:05:00+00'),
  ('91919191-9191-4191-8191-919191919112', '91919191-9191-4191-8191-919191919101', 'aberta', false, '2026-09-03 18:04:00+00'),
  ('91919191-9191-4191-8191-919191919113', '91919191-9191-4191-8191-919191919101', 'aberta', false, '2026-09-03 18:05:00+00');
reset role;

set role service_role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim', '{"role":"service_role"}', false);
create temporary table resolved_identity_destinations (label text primary key, customer_id uuid not null, conversation_id uuid not null);
insert into resolved_identity_destinations select 'long-name', customer_id, conversation_id from public.resolve_evolution_payment_proof_identity_destination('5541998888801', repeat('x', 101));
insert into resolved_identity_destinations select 'fallback-name', customer_id, conversation_id from public.resolve_evolution_payment_proof_identity_destination('5541998888802', '   ');
insert into resolved_identity_destinations select 'existing', customer_id, conversation_id from public.resolve_evolution_payment_proof_identity_destination('5541998888804', 'Ignored');
insert into resolved_identity_destinations select 'repeat', customer_id, conversation_id from public.resolve_evolution_payment_proof_identity_destination('5541998888801', 'Changed');

select is((select pg_typeof(customer_id)::text from resolved_identity_destinations where label = 'long-name'), 'uuid', 'service role with null uid resolves a UUID customer id');
select is((select pg_typeof(conversation_id)::text from resolved_identity_destinations where label = 'long-name'), 'uuid', 'service role with null uid resolves a UUID conversation id');
select is((select nome::text from public.clientes where telefone = '5541998888801'), repeat('x', 100), 'new customer display name is bounded to 100 characters');
select is((select nome::text from public.clientes where telefone = '5541998888802'), 'Contato Evolution'::text, 'blank display name falls back deterministically');
select is((select customer_id from resolved_identity_destinations where label = 'repeat'), (select customer_id from resolved_identity_destinations where label = 'long-name'), 'repeated resolution reuses the customer');
select is((select conversation_id from resolved_identity_destinations where label = 'existing'), '91919191-9191-4191-8191-919191919113'::uuid, 'resolver selects the newest existing open conversation by timestamp and id');
select isnt((select conversation_id from resolved_identity_destinations where label = 'existing'), '91919191-9191-4191-8191-919191919111'::uuid, 'resolver never selects a closed conversation');
select is((select count(*)::integer from public.clientes where telefone = '5541998888801'), 1, 'repeated resolution does not duplicate the customer');
select is((select count(*)::integer from public.conversas where cliente_id = (select customer_id from resolved_identity_destinations where label = 'long-name') and status = 'aberta'), 1, 'repeated resolution does not duplicate the open conversation');
reset role;

-- Runtime concurrency is exercised without committing synthetic rows: dblink sessions
-- retain their transactions so the second same-phone call must wait on the first call's
-- advisory lock. A durable one-row count cannot be asserted while preserving rollback:
-- committing either remote transaction would persist synthetic data outside this test's
-- transaction, while rolling it back causes the waiting caller to create its own row.
select dblink_connect('evolution_identity_first', :'runtime_dblink_conninfo');
select dblink_connect('evolution_identity_second', :'runtime_dblink_conninfo');
select dblink_exec('evolution_identity_first', $$begin; set role service_role$$);
select dblink_exec('evolution_identity_first', $sql$do $remote$ begin perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claim', '{"role":"service_role"}', false); end $remote$;$sql$);
select dblink_exec('evolution_identity_second', $$begin; set role service_role$$);
select dblink_exec('evolution_identity_second', $sql$do $remote$ begin perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claim', '{"role":"service_role"}', false); end $remote$;$sql$);
select dblink_send_query('evolution_identity_first', $$select * from public.resolve_evolution_payment_proof_identity_destination('5541998888803', 'Concurrent')$$);
create temporary table first_concurrent_result(customer_id uuid, conversation_id uuid);
insert into first_concurrent_result select * from dblink_get_result('evolution_identity_first') as result(customer_id uuid, conversation_id uuid);
-- Async libpq may expose a trailing empty result; consume it before issuing rollback.
select count(*) from dblink_get_result('evolution_identity_first') as result(customer_id uuid, conversation_id uuid);
select dblink_send_query('evolution_identity_second', $$select * from public.resolve_evolution_payment_proof_identity_destination('5541998888803', 'Concurrent')$$);
select pg_sleep(0.1);
select ok(dblink_is_busy('evolution_identity_second') = 1, 'concurrent same-phone resolver call waits on the transaction advisory lock');
select dblink_exec('evolution_identity_first', 'rollback');
create temporary table second_concurrent_result(customer_id uuid, conversation_id uuid);
insert into second_concurrent_result select * from dblink_get_result('evolution_identity_second') as result(customer_id uuid, conversation_id uuid);
select count(*) from dblink_get_result('evolution_identity_second') as result(customer_id uuid, conversation_id uuid);
select ok((select pg_typeof(customer_id)::text = 'uuid' and pg_typeof(conversation_id)::text = 'uuid' from second_concurrent_result), 'waiting concurrent resolver call completes with UUID-shaped destination ids');
select dblink_exec('evolution_identity_second', 'rollback');
select dblink_disconnect('evolution_identity_first');
select dblink_disconnect('evolution_identity_second');

select * from finish();
rollback;
