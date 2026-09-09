create extension if not exists pgtap;
create extension if not exists dblink;
\ir ../migrations/20260909010000_sofia_inbound_batch_admission.sql
\ir ../migrations/20260909020000_sofia_inbound_batch_processing.sql
select plan(52);

select has_table('public','sofia_response_outbox','durable response intents exist');
select table_privs_are('public','sofia_response_outbox','service_role',array[]::text[],'service role has no direct outbox access');
select function_privs_are('public','claim_sofia_inbound_batch',array['integer'],'service_role',array['EXECUTE'],'service role alone may claim');
select function_privs_are('public','claim_sofia_inbound_batch',array['integer'],'authenticated',array[]::text[],'authenticated cannot claim');
select function_privs_are('public','cancel_sofia_inbound_batch',array['uuid','uuid','text'],'service_role',array['EXECUTE'],'service role alone may cancel');
select function_privs_are('public','cancel_sofia_inbound_batch',array['uuid','uuid','text'],'authenticated',array[]::text[],'authenticated cannot cancel');
select function_privs_are('public','fail_sofia_inbound_batch',array['uuid','uuid','text'],'service_role',array['EXECUTE'],'service role alone may fail');
select function_privs_are('public','fail_sofia_inbound_batch',array['uuid','uuid','text'],'authenticated',array[]::text[],'authenticated cannot fail');
select function_privs_are('public','complete_sofia_inbound_batch',array['uuid','uuid','text'],'service_role',array['EXECUTE'],'service role alone may complete');
select function_privs_are('public','complete_sofia_inbound_batch',array['uuid','uuid','text'],'authenticated',array[]::text[],'authenticated cannot complete');
select function_privs_are('public','claim_sofia_response_delivery',array['integer'],'service_role',array['EXECUTE'],'service role alone may claim delivery');
select function_privs_are('public','claim_sofia_response_delivery',array['integer'],'authenticated',array[]::text[],'authenticated cannot claim delivery');
select function_privs_are('public','begin_sofia_response_delivery',array['uuid','uuid'],'service_role',array['EXECUTE'],'service role alone may begin delivery');
select function_privs_are('public','begin_sofia_response_delivery',array['uuid','uuid'],'authenticated',array[]::text[],'authenticated cannot begin delivery');
select function_privs_are('public','record_sofia_response_delivery_failure',array['uuid','text'],'service_role',array['EXECUTE'],'service role alone may record delivery failure');
select function_privs_are('public','record_sofia_response_delivery_failure',array['uuid','text'],'authenticated',array[]::text[],'authenticated cannot record delivery failure');

insert into public.clientes(id,nome,telefone) values
 ('b1000000-0000-4000-8000-000000000001','Claim one','5541992111101'),
 ('b1000000-0000-4000-8000-000000000002','Claim two','5541992111102');
insert into public.conversas(id,cliente_id,ia_ativa,status) values
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',false,'aberta'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002',true,'ia_atendendo');
alter table public.whatsapp_sofia_states disable trigger enforce_sofia_handoff_actor;
insert into public.whatsapp_sofia_states(cliente_id,canal,sofia_dormindo,motivo,silenciada_ate)
 values('b1000000-0000-4000-8000-000000000001','whatsapp',true,'manual',now()+interval '1 hour');
alter table public.whatsapp_sofia_states enable trigger enforce_sofia_handoff_actor;
update public.clientes set automacao_permitida=false,status_whatsapp='opted_out' where id='b1000000-0000-4000-8000-000000000002';
update public.configuracoes_sistema set valor='false' where chave='SOFIA_GLOBAL_TELEGRAM_ENABLED';
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select * from public.enqueue_sofia_inbound_message('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','telegram','one-a','later',null,'2030-01-01 10:00:02+00');
select * from public.enqueue_sofia_inbound_message('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','telegram','one-b','earlier','private/key.jpg','2030-01-01 10:00:01+00');
select * from public.enqueue_sofia_inbound_message('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','whatsapp','two-a','separate',null,now());
update public.sofia_inbound_batches set scheduled_process_at=now()-interval '1 second';

select dblink_connect('claim_a',:'runtime_dblink_conninfo');
select dblink_connect('claim_b',:'runtime_dblink_conninfo');
select dblink_exec('claim_a',$$set role service_role; set request.jwt.claim = '{"role":"service_role"}'; begin$$);
select dblink_exec('claim_b',$$set role service_role; set request.jwt.claim = '{"role":"service_role"}'; begin$$);
select dblink_send_query('claim_a','select public.claim_sofia_inbound_batch(30)');
select dblink_send_query('claim_b','select public.claim_sofia_inbound_batch(30)');
create temporary table claims(payload jsonb);
insert into claims select payload from dblink_get_result('claim_a') as r(payload jsonb);
select * from dblink_get_result('claim_a',false) as drained(value text);
insert into claims select payload from dblink_get_result('claim_b') as r(payload jsonb);
select * from dblink_get_result('claim_b',false) as drained(value text);
select is((select count(*)::integer from claims where payload is not null),2,'SKIP LOCKED gives workers distinct due batches');
select is((select count(distinct payload->>'batch_id')::integer from claims where payload is not null),2,'contention never duplicates a claim');
select dblink_exec('claim_a','commit'); select dblink_exec('claim_b','commit');
select dblink_disconnect('claim_a'); select dblink_disconnect('claim_b');
select is((select attempt from public.sofia_inbound_batches where conversa_id='b2000000-0000-4000-8000-000000000001'),1,'claim increments the fence attempt');
select is((select payload->'eligibility'->>'ia_ativa' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000001'),'false','claim snapshots current IA eligibility input');
select is((select payload->'eligibility'->>'db_eligible' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000001'),'false','pause or handoff fails DB eligibility');
select is((select payload->'eligibility'->>'whatsapp_sleeping' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000001'),null,'Telegram ignores WhatsApp sleep state');
select is((select payload->'eligibility'->>'db_eligible' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000002'),'false','opt-out and disabled automation fail DB eligibility');
select is((select payload->'eligibility'->>'requires_runtime_policy_check' from claims limit 1),'true','claim requires runtime business-hours policy verification');
select is((select payload->'eligibility'->>'eligible' from claims limit 1),'false','claim never represents partial DB eligibility as final eligibility');
select is((select payload->'eligibility'->>'global_enabled' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000001'),'false','Telegram claim resolves its disabled global flag');
select is((select payload->'eligibility'->>'global_enabled' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000002'),'true','WhatsApp claim resolves its enabled global flag');
select is((select payload->'members'->0->>'content' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000001'),'earlier','claimed members are frozen in chronological order');
select ok((select payload::text not like '%private/key.jpg%' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000001'),'claim exposes attachment state without private locator');

create temporary table first_claim as select id,lease_token from public.sofia_inbound_batches where conversa_id='b2000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select ok(not public.cancel_sofia_inbound_batch((select id from first_claim),gen_random_uuid(),'opt_out'),'stale cancellation fence is rejected');
select ok(public.cancel_sofia_inbound_batch((select id from first_claim),(select lease_token from first_claim),'opt_out'),'matching fence cancels terminally');
select throws_ok($$select public.cancel_sofia_inbound_batch((select id from first_claim),(select lease_token from first_claim),'raw reason')$$,'22023','SOFIA_BATCH_CANCEL_REASON_INVALID','cancellation reasons are bounded');
select is(public.claim_sofia_inbound_batch(30),null::jsonb,'terminal cancellation is never reclaimed while no other work is due');

update public.sofia_inbound_batches set claimed_until=now()-interval '1 second',scheduled_process_at=now()-interval '1 second' where conversa_id='b2000000-0000-4000-8000-000000000002';
create temporary table recovered as select public.claim_sofia_inbound_batch(30) payload;
select is((select (payload->>'attempt')::integer from recovered),2,'expired lease without intent is recovered with a new attempt');
select isnt((select payload->>'lease_token' from recovered),(select payload->>'lease_token' from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000002'),'recovery rotates the lease token');

select is((select public.complete_sofia_inbound_batch((payload->>'batch_id')::uuid,(select (payload->>'lease_token')::uuid from claims where payload->>'conversa_id'='b2000000-0000-4000-8000-000000000002'),'one response') from recovered),null::jsonb,'pre-recovery lease cannot complete recovered work');
select is((select public.complete_sofia_inbound_batch((payload->>'batch_id')::uuid,gen_random_uuid(),'one response') from recovered),null::jsonb,'wrong completion fence is rejected');
update public.sofia_inbound_batches set claimed_until=now()-interval '1 second' where id=(select (payload->>'batch_id')::uuid from recovered);
select is((select public.complete_sofia_inbound_batch((payload->>'batch_id')::uuid,(payload->>'lease_token')::uuid,'one response') from recovered),null::jsonb,'expired completion fence is rejected');
update public.sofia_inbound_batches set claimed_until=now()+interval '30 seconds' where id=(select (payload->>'batch_id')::uuid from recovered);
create temporary table completed as select public.complete_sofia_inbound_batch((payload->>'batch_id')::uuid,(payload->>'lease_token')::uuid,'one response') payload from recovered;
select is((select count(*)::integer from public.mensagens where external_id like 'sofia-batch:%'),1,'completion persists exactly one IA message');
select is((select count(*)::integer from public.sofia_response_outbox),1,'completion persists exactly one response intent');
select is((select public.complete_sofia_inbound_batch((payload->>'batch_id')::uuid,(payload->>'lease_token')::uuid,'one response') from recovered),null::jsonb,'completed work cannot replay through a stale fence');
update public.sofia_inbound_batches set status='processing',completed_at=null,lease_token=gen_random_uuid(),claimed_until=now()+interval '30 seconds',scheduled_process_at=now()-interval '1 second' where id=(select (payload->>'batch_id')::uuid from recovered);
create temporary table intent_lease as select lease_token from public.sofia_inbound_batches where id=(select (payload->>'batch_id')::uuid from recovered);
select is((select public.complete_sofia_inbound_batch((payload->>'batch_id')::uuid,(payload->>'lease_token')::uuid,'one response') from recovered),null::jsonb,'prior completion lease cannot reuse an intent after ownership changes');
select is(public.complete_sofia_inbound_batch((select (payload->>'batch_id')::uuid from recovered),(select lease_token from intent_lease),'one response'),(select payload from completed),'active exact fence may replay its immutable intent');
select throws_ok($$select public.complete_sofia_inbound_batch((select (payload->>'batch_id')::uuid from recovered),(select lease_token from intent_lease),'different')$$,'23505','SOFIA_BATCH_RESPONSE_CONFLICT','active response binding conflict fails closed');
update public.sofia_inbound_batches set claimed_until=now()-interval '1 second' where id=(select (payload->>'batch_id')::uuid from recovered);
select is(public.complete_sofia_inbound_batch((select (payload->>'batch_id')::uuid from recovered),(select lease_token from intent_lease),'one response'),null::jsonb,'expired intent-owning fence cannot replay');
select is(public.claim_sofia_inbound_batch(30),null::jsonb,'expired lease with a durable intent is finalized, not regenerated');
select is((select status from public.sofia_inbound_batches where id=(select (payload->>'batch_id')::uuid from recovered)),'completed','intent-backed recovery restores terminal completion');

create temporary table delivery as select public.claim_sofia_response_delivery(30) payload;
select ok((select public.begin_sofia_response_delivery((payload->>'batch_id')::uuid,(payload->>'lease_token')::uuid) from delivery),'matching delivery fence begins one external attempt');
select ok(not (select public.begin_sofia_response_delivery((payload->>'batch_id')::uuid,(payload->>'lease_token')::uuid) from delivery),'attempt transition cannot repeat');
select is(public.claim_sofia_response_delivery(30),null::jsonb,'attempted intent is never reclaimed');
select ok((select public.record_sofia_response_delivery_failure((payload->>'batch_id')::uuid,'provider_unavailable') from delivery),'attempt failure is durably terminal');
select throws_ok($$select public.fail_sofia_inbound_batch(gen_random_uuid(),gen_random_uuid(),'raw')$$,'22023','SOFIA_BATCH_FAILURE_INVALID','batch failures use bounded tokens');
select * from finish();
