create extension if not exists pgtap;
create extension if not exists dblink;
\ir ../migrations/20260910010000_sofia_humanized_timing.sql
\ir ../migrations/20260911020000_sofia_activity_core_a_corrective.sql
select plan(39);

select has_table('public','sofia_conversation_presence','private activity projection exists');
select table_privs_are('public','sofia_conversation_presence','service_role',array[]::text[],'service role has no direct presence access');
select function_privs_are('public','begin_sofia_batch_activity',array['uuid','uuid','integer'],'service_role',array['EXECUTE'],'service role may begin G activity');
select function_privs_are('public','begin_sofia_batch_activity',array['uuid','uuid','integer'],'authenticated',array[]::text[],'authenticated cannot begin G activity');
select function_privs_are('public','renew_sofia_owner_activity',array['uuid','text','uuid','uuid','integer','integer'],'service_role',array['EXECUTE'],'service role may atomically renew G/D/A');
select function_privs_are('public','renew_sofia_owner_activity',array['uuid','text','uuid','uuid','integer','integer'],'authenticated',array[]::text[],'authenticated cannot renew G/D/A');
select function_privs_are('public','adopt_sofia_response_activity',array['uuid','uuid','integer'],'service_role',array['EXECUTE'],'service role may adopt D activity');
select function_privs_are('public','clear_sofia_batch_activity',array['uuid','uuid'],'authenticated',array[]::text[],'authenticated cannot clear activity');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('public.begin_sofia_batch_activity(uuid,uuid,integer)'::regprocedure))>0,'begin serializes activity with its dedicated advisory lock');

insert into public.clientes(id,nome,telefone) values ('ca100000-0000-4000-8000-000000000001','Core A','5541992222201');
insert into public.conversas(id,cliente_id,ia_ativa,status) values ('ca200000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001',true,'ia_atendendo');
insert into public.sofia_inbound_batches(id,conversa_id,cliente_id,canal,first_message_at,latest_message_at,scheduled_process_at,status,lease_token,claimed_until) values
 ('ca300000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','telegram',now(),now(),now(),'processing','ca400000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 minute'),
 ('ca300000-0000-4000-8000-000000000002','ca200000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','telegram',now(),now(),now(),'processing','ca400000-0000-4000-8000-000000000002',clock_timestamp()+interval '1 minute');
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select throws_ok($$select public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000001','ca400000-0000-4000-8000-000000000001',null)$$,'22023','SOFIA_ACTIVITY_TTL_INVALID','NULL activity TTL fails closed');
select throws_ok($$select public.renew_sofia_owner_activity('ca300000-0000-4000-8000-000000000001','generation',gen_random_uuid(),gen_random_uuid(),null,30)$$,'22023','SOFIA_ACTIVITY_RENEWAL_INVALID','NULL renewal TTL fails closed');

-- The owner transaction holds the exact conversation lock before the competing
-- batch starts. This makes the race deterministic: the contender must wait,
-- then observe the committed live activity and return null without deadlocking.
select dblink_connect('sofia_core_a_owner', :'runtime_dblink_conninfo');
select dblink_connect('sofia_core_a_contender', :'runtime_dblink_conninfo');
select dblink_exec('sofia_core_a_owner', $$set request.jwt.claim = '{"role":"service_role"}'$$);
select dblink_exec('sofia_core_a_contender', $$set request.jwt.claim = '{"role":"service_role"}'$$);
select dblink_exec('sofia_core_a_owner', $$begin$$);
select dblink_exec('sofia_core_a_owner', $$do $remote$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sofia-activity:ca200000-0000-4000-8000-000000000001', 91022)); end $remote$ $$);
select dblink_send_query('sofia_core_a_contender', $$select public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000002','ca400000-0000-4000-8000-000000000002',30)$$);
select is(dblink_is_busy('sofia_core_a_contender'), 1, 'competing batch waits on the same-conversation advisory lock');
select dblink_exec('sofia_core_a_owner', $$do $remote$ begin perform public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000001','ca400000-0000-4000-8000-000000000001',30); end $remote$ $$);
select dblink_exec('sofia_core_a_owner', $$commit$$);
create temporary table concurrent_activity_outcome as
  select * from dblink_get_result('sofia_core_a_contender') as result(payload jsonb);
select dblink_disconnect('sofia_core_a_owner');
select dblink_disconnect('sofia_core_a_contender');
select is((select payload from concurrent_activity_outcome), null::jsonb, 'competing batch returns null after the live owner commits');
select ok(
  (select source_batch_id = 'ca300000-0000-4000-8000-000000000001'::uuid and status = 'composing' from public.sofia_conversation_presence)
  and not ('sofia_core_a_owner' = any(coalesce(dblink_get_connections(), array[]::text[])))
  and not ('sofia_core_a_contender' = any(coalesce(dblink_get_connections(), array[]::text[]))),
  'owner wins and both concurrent transactions finish cleanly without deadlock'
);
create temporary table g1 as select public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000001','ca400000-0000-4000-8000-000000000001',30) payload;
select ok((select payload->>'attempt_id' is not null from g1),'begin creates opaque A under G');
select is((select (public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000001','ca400000-0000-4000-8000-000000000001',30)->>'attempt_id')::uuid),(select (payload->>'attempt_id')::uuid from g1),'same G begin is idempotent');
select is(public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000002','ca400000-0000-4000-8000-000000000002',30),null::jsonb,'live cross-batch activity is excluded');
create temporary table g1_before as select claimed_until,(select expires_at from public.sofia_conversation_presence) expires_at from public.sofia_inbound_batches where id='ca300000-0000-4000-8000-000000000001';
select is(public.renew_sofia_owner_activity('ca300000-0000-4000-8000-000000000001','generation','ca400000-0000-4000-8000-000000000001',gen_random_uuid(),60,30),null::jsonb,'wrong A cannot renew G');
select is((select claimed_until from public.sofia_inbound_batches where id='ca300000-0000-4000-8000-000000000001'),(select claimed_until from g1_before),'wrong A changes no G lease');
select is((select expires_at from public.sofia_conversation_presence),(select expires_at from g1_before),'wrong A changes no activity expiry');
create temporary table g1_renewed as select public.renew_sofia_owner_activity('ca300000-0000-4000-8000-000000000001','generation','ca400000-0000-4000-8000-000000000001',(select (payload->>'attempt_id')::uuid from g1),60,30) payload;
select is((select (payload->>'attempt_id')::uuid from g1_renewed),(select (payload->>'attempt_id')::uuid from g1),'matching G/A renewal preserves A');
select ok((select claimed_until>(select claimed_until from g1_before) from public.sofia_inbound_batches where id='ca300000-0000-4000-8000-000000000001'),'matching G/A renewal extends G atomically');
select ok((select expires_at>(select expires_at from g1_before) from public.sofia_conversation_presence),'matching G/A renewal extends activity atomically');
update public.sofia_conversation_presence set expires_at=clock_timestamp()-interval '1 second';
create temporary table g2 as select public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000002','ca400000-0000-4000-8000-000000000002',30) payload;
select isnt((select (payload->>'attempt_id')::uuid from g2),(select (payload->>'attempt_id')::uuid from g1),'fresh G rotates A after expiry');
select ok(not public.clear_sofia_batch_activity('ca300000-0000-4000-8000-000000000001',(select (payload->>'attempt_id')::uuid from g1)),'stale G/A cannot clear newer activity');
select ok(public.clear_sofia_batch_activity('ca300000-0000-4000-8000-000000000002',(select (payload->>'attempt_id')::uuid from g2)),'matching batch/A clears activity');
select ok((select status='idle' and owner_kind is null and owner_token is null and attempt_id is null and source_batch_id is null and expires_at is null from public.sofia_conversation_presence),'clear creates explicit idle state');

update public.sofia_inbound_batches set status='processing',lease_token='ca400000-0000-4000-8000-000000000003',claimed_until=clock_timestamp()+interval '1 minute' where id='ca300000-0000-4000-8000-000000000001';
create temporary table generation_for_delivery as select public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000001','ca400000-0000-4000-8000-000000000003',30) payload;
insert into public.mensagens(id,conversa_id,remetente,conteudo,external_id) values ('ca500000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001','ia','durable','core-a-intent');
update public.sofia_inbound_batches set status='completed',completed_at=clock_timestamp(),lease_token=null,claimed_until=null where id='ca300000-0000-4000-8000-000000000001';
insert into public.sofia_response_outbox(batch_id,conversa_id,canal,message_id,response_text,status,lease_token,claimed_until) values ('ca300000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001','telegram','ca500000-0000-4000-8000-000000000001','durable','claimed','ca600000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 minute');
create temporary table d1 as select public.adopt_sofia_response_activity('ca300000-0000-4000-8000-000000000001','ca600000-0000-4000-8000-000000000001',30) payload;
select isnt((select (payload->>'attempt_id')::uuid from d1),(select (payload->>'attempt_id')::uuid from generation_for_delivery),'adoption rotates G A to D A');
select is((select status from public.sofia_response_outbox where batch_id='ca300000-0000-4000-8000-000000000001'),'claimed','adoption preserves final-send authority as claimed');
select is((select (public.adopt_sofia_response_activity('ca300000-0000-4000-8000-000000000001','ca600000-0000-4000-8000-000000000001',30)->>'attempt_id')::uuid),(select (payload->>'attempt_id')::uuid from d1),'same D adoption is idempotent');
select is(public.adopt_sofia_response_activity('ca300000-0000-4000-8000-000000000001',gen_random_uuid(),30),null::jsonb,'wrong D cannot adopt activity');
create temporary table d1_before as select claimed_until,(select expires_at from public.sofia_conversation_presence) expires_at from public.sofia_response_outbox where batch_id='ca300000-0000-4000-8000-000000000001';
select is(public.renew_sofia_owner_activity('ca300000-0000-4000-8000-000000000001','delivery','ca600000-0000-4000-8000-000000000001',gen_random_uuid(),60,30),null::jsonb,'wrong A cannot renew D');
select is((select claimed_until from public.sofia_response_outbox where batch_id='ca300000-0000-4000-8000-000000000001'),(select claimed_until from d1_before),'wrong A changes no D lease');
select is((select (public.renew_sofia_owner_activity('ca300000-0000-4000-8000-000000000001','delivery','ca600000-0000-4000-8000-000000000001',(select (payload->>'attempt_id')::uuid from d1),60,30)->>'attempt_id')::uuid),(select (payload->>'attempt_id')::uuid from d1),'matching D/A renewal preserves A');
select ok((select claimed_until>(select claimed_until from d1_before) from public.sofia_response_outbox where batch_id='ca300000-0000-4000-8000-000000000001'),'matching D/A renewal extends D atomically');
update public.sofia_response_outbox set lease_token='ca600000-0000-4000-8000-000000000002',claimed_until=clock_timestamp()+interval '1 minute' where batch_id='ca300000-0000-4000-8000-000000000001';
create temporary table d2 as select public.adopt_sofia_response_activity('ca300000-0000-4000-8000-000000000001','ca600000-0000-4000-8000-000000000002',30) payload;
select isnt((select (payload->>'attempt_id')::uuid from d2),(select (payload->>'attempt_id')::uuid from d1),'fresh D rotates A');
select ok(not public.clear_sofia_batch_activity('ca300000-0000-4000-8000-000000000001',(select (payload->>'attempt_id')::uuid from d1)),'stale D/A cannot clear newer activity');
select ok(public.clear_sofia_batch_activity('ca300000-0000-4000-8000-000000000001',(select (payload->>'attempt_id')::uuid from d2)),'matching D/A clears activity');
select set_config('request.jwt.claim','{"role":"anon"}',false);
select throws_ok($$select public.begin_sofia_batch_activity('ca300000-0000-4000-8000-000000000001',null,null)$$,'42501','SOFIA_ACTIVITY_SERVICE_ROLE_REQUIRED','authority is checked before activity input');
select * from finish();
