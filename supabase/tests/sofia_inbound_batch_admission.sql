create extension if not exists pgtap;
create extension if not exists dblink;
\ir ../migrations/20260909010000_sofia_inbound_batch_admission.sql
begin;
select plan(27);

select has_table('public', 'sofia_inbound_batches', 'durable Sofia batches exist');
select has_table('public', 'sofia_inbound_batch_messages', 'durable immutable membership exists');
select table_privs_are('public', 'sofia_inbound_batches', 'service_role', array[]::text[], 'service role has no direct batch-table privileges');
select table_privs_are('public', 'sofia_inbound_batch_messages', 'authenticated', array[]::text[], 'authenticated has no membership-table privileges');
select function_privs_are('public', 'enqueue_sofia_inbound_message', array['uuid','uuid','text','text','text','text','timestamp with time zone'], 'service_role', array['EXECUTE'], 'service role alone may enqueue');
select function_privs_are('public', 'enqueue_sofia_inbound_message', array['uuid','uuid','text','text','text','text','timestamp with time zone'], 'authenticated', array[]::text[], 'authenticated cannot enqueue');

insert into public.clientes(id,nome,telefone) values ('a1000000-0000-4000-8000-000000000001','Batch test','5541991111101');
insert into public.conversas(id,cliente_id) values ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim','{"role":"service_role"}',true);
create temporary table admission_results(label text primary key,message_id uuid,batch_id uuid,duplicate boolean,scheduled_at timestamptz);
insert into admission_results select 'first',* from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','telegram','delivery-1','first',null,'2030-01-01 10:00:04+00');
insert into admission_results select 'duplicate',* from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','telegram','delivery-1','ignored',null,'2030-01-01 10:00:02+00');
insert into admission_results select 'second',* from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','telegram','delivery-2','second',null,'2030-01-01 10:00:00+00');
reset role;

select is((select count(*)::integer from public.sofia_inbound_batches),1,'admissions share one pending batch');
select is((select count(*)::integer from public.mensagens where conversa_id='a2000000-0000-4000-8000-000000000001'),2,'messages persist immediately and retry deduplicates');
select ok((select duplicate from admission_results where label='duplicate'),'delivery retry reports duplicate');
select is((select message_id from admission_results where label='duplicate'),(select message_id from admission_results where label='first'),'delivery retry returns original binding');
select is((select array_agg(m.conteudo order by bm.message_created_at,bm.message_id) from public.sofia_inbound_batch_messages bm join public.mensagens m on m.id=bm.message_id),array['second','first']::text[],'provider chronology is stable despite out-of-order admission');
select is((select bm.message_created_at from public.sofia_inbound_batch_messages bm join public.mensagens m on m.id=bm.message_id where m.conteudo='second'),(select m.data_criacao from public.mensagens m where m.conteudo='second'),'membership persists the message chronology key');
select ok((select abs(extract(epoch from scheduled_process_at-latest_message_at)-5) < 0.1 from public.sofia_inbound_batches),'latest trusted admission resets the five-second silence window');
select ok((select first_message_at < '2029-01-01'::timestamptz from public.sofia_inbound_batches),'provider timestamp does not control scheduling time');

update public.sofia_inbound_batches set first_message_at=t,latest_message_at=t+interval '18 seconds',scheduled_process_at=t+interval '20 seconds' from (select clock_timestamp()-interval '19 seconds' t) trusted;
set local role service_role;
insert into admission_results select 'cap',* from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','telegram','delivery-3','cap',null,'2030-01-01 10:00:19+00');
reset role;
select is((select scheduled_process_at-first_message_at from public.sofia_inbound_batches),interval '20 seconds','continuous arrivals respect the trusted twenty-second cap');
select throws_ok($$update public.sofia_inbound_batch_messages set message_created_at=now()$$,'55000','SOFIA_BATCH_MEMBERSHIP_IMMUTABLE','membership chronology cannot be rewritten');
select throws_ok($$update public.sofia_inbound_batches set lease_token=gen_random_uuid()$$,'23514',null,'half leases violate batch state constraints');
select throws_ok($$update public.sofia_inbound_batches set status='completed',completed_at=now(),last_error='wrong state'$$,'23514',null,'terminal metadata cannot cross states');

update public.sofia_inbound_batches set status='processing',lease_token=gen_random_uuid(),claimed_until=now()+interval '1 minute';
set local role service_role;
insert into admission_results select 'post-claim',* from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','telegram','delivery-4','after claim',null,'2030-01-01 10:00:21+00');
reset role;
select is((select count(*)::integer from public.sofia_inbound_batches where status='pending'),1,'arrival after claim creates one new pending batch');
select is((select count(*)::integer from public.sofia_inbound_batch_messages where message_id=(select message_id from admission_results where label='post-claim')),1,'message membership is globally unique');

insert into public.clientes(id,nome,telefone) values ('a1000000-0000-4000-8000-000000000003','Cascade','5541991111103');
insert into public.conversas(id,cliente_id) values ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003');
select dblink_connect('sofia_a',:'runtime_dblink_conninfo');
select dblink_connect('sofia_b',:'runtime_dblink_conninfo');
select dblink_exec('sofia_a',$$insert into public.clientes(id,nome,telefone) values ('a1000000-0000-4000-8000-000000000002','Concurrent','5541991111102'); insert into public.conversas(id,cliente_id) values ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002')$$);
select dblink_exec('sofia_a',$$set role service_role; set request.jwt.claim = '{"role":"service_role"}'$$);
select dblink_exec('sofia_b',$$set role service_role; set request.jwt.claim = '{"role":"service_role"}'$$);
select dblink_send_query('sofia_a',$$select * from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','whatsapp','race-1','alpha',null,'2030-02-01 10:00:02+00')$$);
select dblink_send_query('sofia_b',$$select * from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','whatsapp','race-2','beta',null,'2030-02-01 10:00:01+00')$$);
select * from dblink_get_result('sofia_a') as r(message_id uuid,batch_id uuid,duplicate boolean,scheduled_at timestamptz);
select * from dblink_get_result('sofia_a',false) as drained(value text);
select * from dblink_get_result('sofia_b') as r(message_id uuid,batch_id uuid,duplicate boolean,scheduled_at timestamptz);
select * from dblink_get_result('sofia_b',false) as drained(value text);
select is((select count(*)::integer from public.sofia_inbound_batches where conversa_id='a2000000-0000-4000-8000-000000000002' and status='pending'),1,'concurrent distinct arrivals converge on one pending batch');
select is((select array_agg(m.conteudo order by bm.message_created_at,bm.message_id) from public.sofia_inbound_batch_messages bm join public.sofia_inbound_batches b on b.id=bm.batch_id join public.mensagens m on m.id=bm.message_id where b.conversa_id='a2000000-0000-4000-8000-000000000002'),array['beta','alpha']::text[],'concurrent membership uses provider chronology rather than lock order');
select dblink_send_query('sofia_a',$$select * from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','whatsapp','race-1','ignored',null,'2030-02-01 10:00:02+00')$$);
select dblink_send_query('sofia_b',$$select * from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','whatsapp','race-3','gamma',null,'2030-02-01 10:00:03+00')$$);
select * from dblink_get_result('sofia_a') as r(message_id uuid,batch_id uuid,duplicate boolean,scheduled_at timestamptz);
select * from dblink_get_result('sofia_a',false) as drained(value text);
select * from dblink_get_result('sofia_b') as r(message_id uuid,batch_id uuid,duplicate boolean,scheduled_at timestamptz);
select * from dblink_get_result('sofia_b',false) as drained(value text);
select is((select count(*)::integer from public.sofia_inbound_batch_messages bm join public.sofia_inbound_batches b on b.id=bm.batch_id where b.conversa_id='a2000000-0000-4000-8000-000000000002'),3,'concurrent duplicate versus new adds only new membership');
select dblink_disconnect('sofia_a');
select dblink_disconnect('sofia_b');

set local role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',true);
select throws_ok($$insert into public.sofia_inbound_batches(conversa_id,cliente_id,canal,first_message_at,latest_message_at,scheduled_process_at) values ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','telegram',now(),now(),now())$$,'42501',null,'service role cannot bypass the RPC with direct writes');
select throws_ok($$select * from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','telegram','infinite','bad',null,'infinity')$$,'22023','SOFIA_BATCH_ADMISSION_INVALID','non-finite provider timestamps are rejected');
reset role;
select set_config('request.jwt.claim','{"role":"anon"}',true);
select throws_ok($$select * from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','email','bad','bad',null,now())$$,'42501','SOFIA_BATCH_SERVICE_ROLE_REQUIRED','authority is checked before input details');

set local role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',true);
select * from public.enqueue_sofia_inbound_message('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','telegram','cascade','owned',null,now());
reset role;
delete from public.conversas where id='a2000000-0000-4000-8000-000000000003';
select is((select count(*)::integer from public.sofia_inbound_batches where conversa_id='a2000000-0000-4000-8000-000000000003'),0,'conversation deletion cascades owned queue state');

select * from finish();
rollback;
