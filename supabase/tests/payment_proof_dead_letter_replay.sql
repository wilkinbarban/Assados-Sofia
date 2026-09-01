\ir ../migrations/20260828340000_payment_proof_operator_leases.sql
\ir ../migrations/20260828380000_payment_proof_dead_letter_replay.sql
\ir ../migrations/20260828390000_payment_proof_purge_fencing_and_replay_purge.sql
\ir ../migrations/20260828400000_payment_proof_replay_audit_hardening.sql
begin;
select plan(45);
set local role postgres;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
 ('38383838-3838-4383-8383-383838383801','00000000-0000-0000-0000-000000000000','authenticated','authenticated','replay-supervisor@test',now(),now()),
 ('38383838-3838-4383-8383-383838383802','00000000-0000-0000-0000-000000000000','authenticated','authenticated','replay-admin@test',now(),now()),
 ('38383838-3838-4383-8383-383838383803','00000000-0000-0000-0000-000000000000','authenticated','authenticated','replay-seller@test',now(),now()),
 ('38383838-3838-4383-8383-383838383804','00000000-0000-0000-0000-000000000000','authenticated','authenticated','replay-inactive@test',now(),now()) on conflict do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('38383838-3838-4383-8383-383838383801','Replay supervisor','supervisor',true),('38383838-3838-4383-8383-383838383802','Replay admin','admin',true),('38383838-3838-4383-8383-383838383803','Replay seller','vendedor',true),('38383838-3838-4383-8383-383838383804','Replay inactive','supervisor',false)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;
insert into public.payment_proofs(id,channel,delivery_key,status,original_storage_key,size_bytes) values
 ('38383838-3838-4383-8383-383838383811','web','replay-queue','review','synthetic/replay-queue.pdf',1),
 ('38383838-3838-4383-8383-383838383812','web','replay-outbox','review','synthetic/replay-outbox.pdf',1),
 ('38383838-3838-4383-8383-383838383813','web','replay-pending','review','synthetic/replay-pending.pdf',1),
 ('38383838-3838-4383-8383-383838383814','web','replay-claimed','review','synthetic/replay-claimed.pdf',1)
on conflict do nothing;
insert into private.payment_proof_processing_queue(proof_id,status,attempts,dead_lettered_at,failure_stage,claimed_until,lease_token,completed_at) values
 ('38383838-3838-4383-8383-383838383811','dead_letter',5,now(),'render',null,null,now()-interval '1 hour'),
 ('38383838-3838-4383-8383-383838383813','pending',2,null,'load',null,null,null),
 ('38383838-3838-4383-8383-383838383814','claimed',3,null,'preview',now()+interval '1 hour','38383838-3838-4383-8383-383838383831',null)
on conflict(proof_id) do update set status=excluded.status,attempts=excluded.attempts,dead_lettered_at=excluded.dead_lettered_at,failure_stage=excluded.failure_stage,claimed_until=excluded.claimed_until,lease_token=excluded.lease_token,completed_at=excluded.completed_at;
insert into public.payment_proof_outbox(proof_id,event_type,channel,payload,status,attempts,dead_lettered_at,last_error,claimed_until,lease_token,completed_at) values
 ('38383838-3838-4383-8383-383838383812','replay-outbox','web','{}','dead_letter',5,now(),'operation_failed',null,null,now()-interval '1 hour')
on conflict(proof_id,event_type) do update set status='dead_letter',attempts=5,dead_lettered_at=now(),last_error='operation_failed',claimed_until=null,lease_token=null,completed_at=now()-interval '1 hour';
select has_function('public','replay_payment_proof_dead_letter',array['text','text','uuid'],'replay RPC exists');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383801',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383801","role":"authenticated"}',true);
select is(public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383811','38383838-3838-4383-8383-383838383821'::uuid)->>'outcome','replayed','supervisor replays eligible queue dead letter');
reset role;
set local role postgres;
select ok((select status='pending' and attempts=0 and failure_stage is null and claimed_until is null and lease_token is null and completed_at is null and dead_lettered_at is null from private.payment_proof_processing_queue where proof_id='38383838-3838-4383-8383-383838383811'),'queue replay clears dead-letter, lease, completion, and failure fields');
select is((select status from public.payment_proofs where id='38383838-3838-4383-8383-383838383811'),'review','queue replay does not change proof state');
select ok((select actor_id='38383838-3838-4383-8383-383838383801'::uuid and actor_role='supervisor' and previous_status='dead_letter' and result_status='replayed' from public.payment_proof_events where proof_id='38383838-3838-4383-8383-383838383811' and event_type='dead_letter_replay' order by id limit 1),'first queue audit records locked actor, role, outcome, and prior status');
select ok((select actor_id='38383838-3838-4383-8383-383838383801'::uuid and actor_role='supervisor' and outcome='replayed' and source='processing_queue' and target_id=request_fingerprint from private.payment_proof_dead_letter_replay_requests where idempotency_key='38383838-3838-4383-8383-383838383821'),'queue ledger records actor, role, sanitized target, and outcome');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383801',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383801","role":"authenticated"}',true);
select is(public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383811','38383838-3838-4383-8383-383838383821'::uuid)->>'outcome','replayed','same queue request returns its safe prior outcome');
reset role;
set local role postgres;
select is((select count(*)::integer from private.payment_proof_dead_letter_replay_requests where idempotency_key='38383838-3838-4383-8383-383838383821'),1,'same queue request retains one idempotency key');
select is((select count(*)::integer from public.payment_proof_events where proof_id='38383838-3838-4383-8383-383838383811' and event_type='dead_letter_replay'),2,'replay and safe repeat are both audited');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383801',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383801","role":"authenticated"}',true);
select is(public.replay_payment_proof_dead_letter('outbox',(select id::text from public.payment_proof_outbox where proof_id='38383838-3838-4383-8383-383838383812'),'38383838-3838-4383-8383-383838383822'::uuid)->>'outcome','replayed','supervisor replays eligible outbox dead letter');
reset role;
set local role postgres;
select ok((select status='pending' and attempts=0 and last_error is null and claimed_until is null and lease_token is null and completed_at is null and dead_lettered_at is null from public.payment_proof_outbox where proof_id='38383838-3838-4383-8383-383838383812'),'outbox replay clears dead-letter, lease, completion, and error fields');
select is((select previous_status from public.payment_proof_events where proof_id='38383838-3838-4383-8383-383838383812' and event_type='dead_letter_replay' order by id limit 1),'dead_letter','first outbox audit records prior locked status');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383801',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383801","role":"authenticated"}',true);
select is(public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383813','38383838-3838-4383-8383-383838383823'::uuid)->>'outcome','ineligible','pending target is safely ineligible');
reset role;
set local role postgres;
select ok((select status='pending' and attempts=2 and failure_stage='load' and claimed_until is null and lease_token is null from private.payment_proof_processing_queue where proof_id='38383838-3838-4383-8383-383838383813'),'pending target preserves state and lease fields');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383801',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383801","role":"authenticated"}',true);
select is(public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383814','38383838-3838-4383-8383-383838383824'::uuid)->>'outcome','ineligible','claimed target is safely ineligible');
reset role;
set local role postgres;
select ok((select status='claimed' and attempts=3 and failure_stage='preview' and claimed_until>now() and lease_token='38383838-3838-4383-8383-383838383831'::uuid from private.payment_proof_processing_queue where proof_id='38383838-3838-4383-8383-383838383814'),'claimed target preserves state and active lease');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383801',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383801","role":"authenticated"}',true);
select is(public.replay_payment_proof_dead_letter('wat','bad','38383838-3838-4383-8383-383838383825'::uuid)->>'outcome','invalid_request','invalid source and target have a fixed safe outcome');
select is(public.replay_payment_proof_dead_letter('outbox','999999999','38383838-3838-4383-8383-383838383826'::uuid)->>'outcome','ineligible','missing target is safely ineligible');
select is(public.replay_payment_proof_dead_letter('outbox','999999999','38383838-3838-4383-8383-383838383826'::uuid)->>'outcome','ineligible','same missing request is idempotent');
select is(public.replay_payment_proof_dead_letter('outbox','9223372036854775808','38383838-3838-4383-8383-383838383830'::uuid)->>'outcome','invalid_request','out-of-range bigint target is invalid_request');
select is(public.replay_payment_proof_dead_letter('outbox','9223372036854775808','38383838-3838-4383-8383-383838383830'::uuid)->>'outcome','invalid_request','same out-of-range bigint request is idempotent');
reset role;
set local role postgres;
select ok((select outcome='invalid_request' and proof_id is null and source='invalid_request' and target_id=request_fingerprint from private.payment_proof_dead_letter_replay_requests where idempotency_key='38383838-3838-4383-8383-383838383825'),'invalid request with usable key is durably sanitized');
select ok((select outcome='ineligible' and proof_id is null and target_id=request_fingerprint from private.payment_proof_dead_letter_replay_requests where idempotency_key='38383838-3838-4383-8383-383838383826'),'missing target with usable key is durably sanitized');
select is((select count(*)::integer from private.payment_proof_dead_letter_replay_requests where idempotency_key='38383838-3838-4383-8383-383838383826'),1,'same missing request retains one durable key');
select ok((select outcome='invalid_request' and proof_id is null and source='invalid_request' and target_id=request_fingerprint from private.payment_proof_dead_letter_replay_requests where idempotency_key='38383838-3838-4383-8383-383838383830'),'out-of-range bigint is durably sanitized');
select is((select count(*)::integer from private.payment_proof_dead_letter_replay_requests where idempotency_key='38383838-3838-4383-8383-383838383830'),1,'same out-of-range bigint request retains one durable key');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383801',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383801","role":"authenticated"}',true);
select is(public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383811','38383838-3838-4383-8383-383838383822'::uuid)->>'outcome','idempotency_conflict','key reuse for a different canonical target conflicts');
reset role;
set local role postgres;
select ok((select status='pending' and attempts=0 and failure_stage is null and claimed_until is null and lease_token is null from private.payment_proof_processing_queue where proof_id='38383838-3838-4383-8383-383838383811') and (select count(*)=1 from private.payment_proof_dead_letter_replay_requests where idempotency_key='38383838-3838-4383-8383-383838383822'),'conflict leaves target untouched and retains one original key');
select is((select count(*)::integer from private.payment_proof_dead_letter_replay_requests),7,'private immutable ledger retains one row for each keyed request');
select ok(not exists(select 1 from pg_constraint where conrelid='private.payment_proof_dead_letter_replay_requests'::regclass and contype='u' and pg_get_constraintdef(oid) like '%request_fingerprint%'),'request fingerprint is not a uniqueness key');
select ok(not exists(select 1 from information_schema.columns where table_schema='private' and table_name='payment_proof_dead_letter_replay_requests' and column_name~'(error|payload|token|secret)'),'request ledger has no raw error, payload, token, or secret column');
select ok(not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in('payment_proof_processing_queue','payment_proof_outbox') and t.tgname ilike '%replay%'),'replay has no automatic trigger');
select ok(not has_table_privilege('authenticated','private.payment_proof_dead_letter_replay_requests','select'),'authenticated has no ledger select grant');
select ok(not has_table_privilege('authenticated','private.payment_proof_dead_letter_replay_requests','insert'),'authenticated has no ledger insert grant');
select ok(not has_table_privilege('service_role','private.payment_proof_dead_letter_replay_requests','select'),'service role has no ledger select grant');
select function_privs_are('public','replay_payment_proof_dead_letter',array['text','text','uuid'],'authenticated',array['EXECUTE'],'authenticated has RPC execute');
select function_privs_are('public','replay_payment_proof_dead_letter',array['text','text','uuid'],'anon',array[]::text[],'anon has no RPC execute');
select function_privs_are('public','replay_payment_proof_dead_letter',array['text','text','uuid'],'service_role',array[]::text[],'service role has no RPC execute');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383803',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383803","role":"authenticated"}',true);
select throws_ok($$select public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383811','38383838-3838-4383-8383-383838383826'::uuid)$$,'42501','PAYMENT_PROOF_REPLAY_FORBIDDEN','seller is denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','38383838-3838-4383-8383-383838383804',true);
select set_config('request.jwt.claims','{"sub":"38383838-3838-4383-8383-383838383804","role":"authenticated"}',true);
select throws_ok($$select public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383811','38383838-3838-4383-8383-383838383827'::uuid)$$,'42501','PAYMENT_PROOF_REPLAY_FORBIDDEN','inactive user is denied');
reset role;
set local role anon;
select throws_ok($$select public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383811','38383838-3838-4383-8383-383838383828'::uuid)$$,'42501',null,'anonymous user is denied');
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.replay_payment_proof_dead_letter('processing_queue','38383838-3838-4383-8383-383838383811','38383838-3838-4383-8383-383838383829'::uuid)$$,'42501',null,'service role with cleared local identity and claims is denied');
reset role;
set local role postgres;
select ok((select bool_and(metadata ?& array['idempotency_key','outcome']) and bool_and(not (metadata ?| array['source','target_id','error'])) from public.payment_proof_events where event_type='dead_letter_replay'),'every replay event is a sanitized DTO');
select ok(not exists(select 1 from private.payment_proof_dead_letter_replay_requests where target_id<>request_fingerprint),'ledger does not retain raw targets');
select ok(not exists(select 1 from pg_indexes where schemaname='private' and tablename='payment_proof_dead_letter_replay_requests' and indexdef like '%request_fingerprint%'), 'no request-fingerprint index is created');
select * from finish();
rollback;
