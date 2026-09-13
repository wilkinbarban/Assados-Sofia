create extension if not exists pgtap;
-- The canonical self-hosted clone can already contain the objects this harness replays, so clear
-- them first: each import below stays the single source of truth for the definitions it owns.
drop function if exists public.sofia_activity_service_only();
drop function if exists public.begin_sofia_batch_activity(uuid,uuid,integer);
drop function if exists public.renew_sofia_owner_activity(uuid,text,uuid,uuid,integer,integer);
drop function if exists public.adopt_sofia_response_activity(uuid,uuid,integer);
drop function if exists public.clear_sofia_batch_activity(uuid,uuid);
drop table if exists public.sofia_conversation_presence;
\ir ../migrations/20260911020000_sofia_activity_core_a_corrective.sql
drop function if exists public.sofia_response_pace_minimum_ms(text);
drop function if exists public.complete_sofia_inbound_batch_paced(uuid,uuid,text,integer);
alter table public.sofia_response_outbox drop column if exists pace_not_before;
\ir ../migrations/20260911030000_sofia_pacing_core_b.sql
\ir ../migrations/20260913010000_sofia_timing_and_pacing_correction.sql
select plan(37);

select has_column('public','sofia_response_outbox','pace_not_before','durable pace deadline exists');
select col_type_is('public','sofia_response_outbox','pace_not_before','timestamp with time zone','pace deadline is timestamptz');
select function_privs_are('public','complete_sofia_inbound_batch_paced',array['uuid','uuid','text','integer'],'service_role',array['EXECUTE'],'service role may use paced completion');
select function_privs_are('public','complete_sofia_inbound_batch_paced',array['uuid','uuid','text','integer'],'authenticated',array[]::text[],'browser cannot use paced completion');
select ok(position('interval ''1 millisecond''' in pg_get_functiondef('public.complete_sofia_inbound_batch_paced(uuid,uuid,text,integer)'::regprocedure))>0,'deadline uses millisecond interval arithmetic');
select ok(position('ceil(extract(epoch from' in pg_get_functiondef('public.complete_sofia_inbound_batch_paced(uuid,uuid,text,integer)'::regprocedure))>0,'a paced replay rounds its residual wait up to the millisecond');
select is(position('floor(extract(epoch from' in pg_get_functiondef('public.complete_sofia_inbound_batch_paced(uuid,uuid,text,integer)'::regprocedure)),0,'a paced replay never truncates its residual wait toward the deadline');
select ok(position('ceil(extract(epoch from' in pg_get_functiondef('public.claim_sofia_response_delivery(integer)'::regprocedure))>0,'a delivery claim rounds its durable residual wait up to the millisecond');
select is(position('floor(extract(epoch from' in pg_get_functiondef('public.claim_sofia_response_delivery(integer)'::regprocedure)),0,'a delivery claim never truncates its durable residual wait toward the deadline');

insert into public.clientes(id,nome,telefone) values ('cb100000-0000-4000-8000-000000000001','Core B','5541993333301');
insert into public.conversas(id,cliente_id,ia_ativa,status) values ('cb200000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001',true,'ia_atendendo');
insert into public.sofia_inbound_batches(id,conversa_id,cliente_id,canal,first_message_at,latest_message_at,scheduled_process_at,status,lease_token,claimed_until) values
 ('cb300000-0000-4000-8000-000000000001','cb200000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001','telegram',now(),now(),now(),'processing','cb400000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 minute'),
 ('cb300000-0000-4000-8000-000000000002','cb200000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001','telegram',now(),now(),now(),'processing','cb400000-0000-4000-8000-000000000002',clock_timestamp()+interval '1 minute'),
 ('cb300000-0000-4000-8000-000000000003','cb200000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001','telegram',now(),now(),now(),'processing','cb400000-0000-4000-8000-000000000003',clock_timestamp()+interval '1 minute'),
 ('cb300000-0000-4000-8000-000000000004','cb200000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001','telegram',now(),now(),now(),'processing','cb400000-0000-4000-8000-000000000004',clock_timestamp()+interval '1 minute'),
 ('cb300000-0000-4000-8000-000000000005','cb200000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001','telegram',now(),now(),now(),'processing','cb400000-0000-4000-8000-000000000005',clock_timestamp()+interval '1 minute');
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select throws_ok($$select public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000001','cb400000-0000-4000-8000-000000000001','reply',null)$$,'22023','SOFIA_BATCH_ELAPSED_INVALID','NULL elapsed fails closed');
select throws_ok($$select public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000001','cb400000-0000-4000-8000-000000000001','reply',-1)$$,'22023','SOFIA_BATCH_ELAPSED_INVALID','negative elapsed fails closed');
select is(public.sofia_response_pace_minimum_ms(repeat('a',100)),3000,'100 ASCII UTF-16 units add 1000 milliseconds');
select is(public.sofia_response_pace_minimum_ms(repeat('a',500)),6000,'500 UTF-16 units reach the six-second cap');
select is(public.sofia_response_pace_minimum_ms(E'\U0001F600'),2020,'an astral emoji counts as two UTF-16 code units');
select is(public.sofia_response_pace_minimum_ms(E'\u00a0' || repeat('a',100) || E'\uFEFF'),3000,'ECMAScript whitespace does not count toward pacing');
select is((public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000003','cb400000-0000-4000-8000-000000000003','maximum',2147483647)->>'remaining_ms')::integer,2070,'maximum int32 elapsed no longer shortens the visible paced remainder');
update public.sofia_response_outbox set status='attempted',attempted_at=clock_timestamp() where batch_id='cb300000-0000-4000-8000-000000000003';

create temporary table paced as select public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000001','cb400000-0000-4000-8000-000000000001','reply',0) payload;
select is((select (payload->>'remaining_ms')::integer from paced),2050,'paced completion returns DB-derived initial remainder');
select ok((select pace_not_before > clock_timestamp() from public.sofia_response_outbox where batch_id='cb300000-0000-4000-8000-000000000001'),'new paced intent gets a future deadline');
select is((select status from public.sofia_inbound_batches where id='cb300000-0000-4000-8000-000000000001'),'completed','paced completion retains baseline batch completion');

select public.complete_sofia_inbound_batch('cb300000-0000-4000-8000-000000000002','cb400000-0000-4000-8000-000000000002','legacy');
select is(public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000002','cb400000-0000-4000-8000-000000000002','legacy',0),null::jsonb,'paced replay cannot revive a completed baseline batch');
select is((select pace_not_before from public.sofia_response_outbox where batch_id='cb300000-0000-4000-8000-000000000002'),null::timestamptz,'paced replay never annotates a preexisting baseline intent');

create temporary table early_claim as select public.claim_sofia_response_delivery(60) payload;
select is((select payload->>'batch_id' from early_claim),'cb300000-0000-4000-8000-000000000001','delivery may claim paced work before it is due');
select ok((select (payload->>'remaining_ms')::integer between 1 and 3000 from early_claim),'a claim exposes the durable residual wait of a paced intent');
select ok(not public.begin_sofia_response_delivery('cb300000-0000-4000-8000-000000000001',(select (payload->>'lease_token')::uuid from early_claim)),'final authority rejects an early paced delivery');
select is((select status from public.sofia_response_outbox where batch_id='cb300000-0000-4000-8000-000000000001'),'claimed','early begin preserves delivery claim for pacing');
update public.sofia_response_outbox set pace_not_before=clock_timestamp()-interval '1 millisecond' where batch_id='cb300000-0000-4000-8000-000000000001';
select ok(public.begin_sofia_response_delivery('cb300000-0000-4000-8000-000000000001',(select (payload->>'lease_token')::uuid from early_claim)),'due paced delivery consumes the existing final authority');

create temporary table legacy_claim as select public.claim_sofia_response_delivery(60) payload;
select ok((select payload ? 'remaining_ms' from legacy_claim),'a claim always exposes the paced remainder key');
select is((select payload->>'remaining_ms' from legacy_claim),null::text,'a NULL deadline reports a NULL remainder');
select ok(public.begin_sofia_response_delivery('cb300000-0000-4000-8000-000000000002',(select (payload->>'lease_token')::uuid from legacy_claim)),'NULL deadline preserves baseline delivery behavior');

-- The reported remainder is a ceiling. Sleeping exactly it must satisfy the strict pace deadline;
-- a truncated remainder leaves the intent claimed for the full lease after a rejected early begin.
create temporary table ceil_paced as select public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000005','cb400000-0000-4000-8000-000000000005','replay',0) payload;
select is((select (payload->>'remaining_ms')::integer from ceil_paced),2060,'a sixth character of response text extends the visible delay');
update public.sofia_response_outbox set pace_not_before=clock_timestamp()+interval '300.6 milliseconds' where batch_id='cb300000-0000-4000-8000-000000000005';
create temporary table ceil_claim as select public.claim_sofia_response_delivery(60) payload;
select is((select payload->>'batch_id' from ceil_claim),'cb300000-0000-4000-8000-000000000005','the paced intent is the only claimable delivery');
select ok((select (payload->>'remaining_ms')::double precision >= (extract(epoch from ((payload->>'pace_not_before')::timestamptz-clock_timestamp()))*1000)::double precision from ceil_claim),'a claim never reports less than the remaining durable deadline');
select pg_sleep((select (payload->>'remaining_ms')::double precision from ceil_claim)/1000.0);
select ok(public.begin_sofia_response_delivery('cb300000-0000-4000-8000-000000000005',(select (payload->>'lease_token')::uuid from ceil_claim)),'sleeping exactly the claimed remainder satisfies the strict pace deadline');
-- A paced replay is only observable while its batch still holds a live lease, so the fixture restores
-- the processing state the claim path would hold. Returning from 'completed' to 'processing' must
-- clear completed_at, exactly as the claim path and the other batch suites do, because the batch
-- state constraints pair status='completed' with completed_at is not null in both directions.
update public.sofia_inbound_batches set status='processing',completed_at=null,lease_token='cb400000-0000-4000-8000-000000000005',claimed_until=clock_timestamp()+interval '1 minute' where id='cb300000-0000-4000-8000-000000000005';
update public.sofia_response_outbox set pace_not_before=clock_timestamp()+interval '300.6 milliseconds' where batch_id='cb300000-0000-4000-8000-000000000005';
create temporary table ceil_replay as select public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000005','cb400000-0000-4000-8000-000000000005','replay',0) payload;
select ok((select payload ? 'remaining_ms' from ceil_replay),'a paced replay exposes the durable remainder key');
select ok((select (payload->>'remaining_ms')::double precision >= (extract(epoch from ((payload->>'pace_not_before')::timestamptz-clock_timestamp()))*1000)::double precision from ceil_replay),'a paced replay never reports less than the remaining durable deadline');
select is((public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000004','cb400000-0000-4000-8000-000000000004','maximum',0)->>'remaining_ms')::integer,2070,'zero elapsed and maximum int32 elapsed agree on the visible delay');
select set_config('request.jwt.claim','{"role":"anon"}',false);
select throws_ok($$select public.complete_sofia_inbound_batch_paced('cb300000-0000-4000-8000-000000000001',null,'reply',0)$$,'42501','SOFIA_BATCH_SERVICE_ROLE_REQUIRED','paced wrapper checks authority first');
select * from finish();
