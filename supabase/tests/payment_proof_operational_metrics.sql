begin;
select plan(48);

select has_column('public','payment_proof_outbox','dead_lettered_at','dead-letter transition timestamp exists');
select has_function('public','record_payment_proof_operational_failure',array['uuid','text'],'fixed failure recorder exists');
select has_function('public','begin_payment_proof_maintenance',array[]::text[],'heartbeat begin exists');
select has_function('public','finish_payment_proof_maintenance',array['boolean'],'heartbeat finish exists');
select has_function('public','get_payment_proof_operational_metrics',array[]::text[],'aggregate metrics exists');
select function_privs_are('public','complete_payment_proof_maintenance',array['text','text','boolean','text','uuid','integer'],'service_role',array['EXECUTE'],'lease-owned completion RPC remains service-only');
select function_privs_are('public','complete_payment_proof_maintenance',array['text','text','boolean','text','uuid','integer'],'authenticated',array[]::text[],'authenticated cannot execute lease-owned completion RPC');
select function_privs_are('public','dead_letter_payment_proof_outbox',array['bigint','text'],'service_role',array['EXECUTE'],'replacement dead-letter RPC remains service-only');
select function_privs_are('public','dead_letter_payment_proof_outbox',array['bigint','text'],'authenticated',array[]::text[],'authenticated cannot execute replacement dead-letter RPC');
select function_privs_are('public','get_payment_proof_operational_metrics',array[]::text[],'service_role',array['EXECUTE'],'metrics are service-only');
select function_privs_are('public','get_payment_proof_operational_metrics',array[]::text[],'authenticated',array[]::text[],'authenticated cannot read metrics');
select function_privs_are('public','record_payment_proof_operational_failure',array['uuid','text'],'anon',array[]::text[],'anonymous cannot record failures');

update private.payment_proof_maintenance_health set running=false,last_started_at=null,last_finished_at=null,last_success_at=null,consecutive_failures=0 where singleton;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select * from private.payment_proof_maintenance_health$$,'42501',null,'service role cannot directly inspect private heartbeat state');
select throws_ok($$select * from private.payment_proof_operational_failures$$,'42501',null,'service role cannot directly inspect private failure state');
select lives_ok($$select public.begin_payment_proof_maintenance()$$,'service may begin heartbeat');
select ok((public.get_payment_proof_operational_metrics()->'maintenance'->>'running')::boolean,'heartbeat reports running after begin');
select ok(public.get_payment_proof_operational_metrics()->'maintenance'->>'last_started_at' is not null,'heartbeat reports start timestamp');
select lives_ok($$select public.finish_payment_proof_maintenance(false)$$,'service may record failed heartbeat');
select is((public.get_payment_proof_operational_metrics()->'maintenance'->>'running')::boolean,false,'failed finish clears running');
select ok(public.get_payment_proof_operational_metrics()->'maintenance'->>'last_finished_at' is not null,'failed finish reports finish timestamp');
select is((public.get_payment_proof_operational_metrics()->'maintenance'->>'consecutive_failures')::integer,1,'failed finish increments consecutive failures');
select is(public.get_payment_proof_operational_metrics()->'maintenance'->>'last_success_at',null,'failed finish does not invent success timestamp');
select lives_ok($$select public.begin_payment_proof_maintenance();select public.finish_payment_proof_maintenance(true)$$,'healthy heartbeat completes');
select ok(public.get_payment_proof_operational_metrics()->'maintenance'->>'last_success_at' is not null,'successful finish reports success timestamp');
select is((public.get_payment_proof_operational_metrics()->'maintenance'->>'consecutive_failures')::integer,0,'success resets consecutive failures');
select is((public.get_payment_proof_operational_metrics()->'maintenance'->>'age_seconds')::bigint,0::bigint,'fresh heartbeat success has zero age seconds');
select throws_ok($$select public.record_payment_proof_operational_failure(gen_random_uuid(),'network')$$,'22023','PAYMENT_PROOF_OPERATIONAL_STAGE_INVALID','failure stage is allowlisted');
reset role;

-- The migration owner is the authorized fixture role for private state; service_role
-- remains unable to inspect either private table directly.
truncate table private.payment_proof_operational_failures, public.payment_proof_outbox, public.payment_proof_events, public.payment_proof_hash_tombstones, public.payment_proofs restart identity cascade;
insert into public.payment_proofs(id,channel,delivery_key,status,original_storage_key,preview_storage_key,size_bytes,quarantined_at,purge_after) values
 ('91919191-9191-4191-8191-919191919101','web','metrics-received','received','synthetic/received.pdf',null,1,null,null),
 ('91919191-9191-4191-8191-919191919102','web','metrics-quarantine-expired','quarantined','synthetic/expired.pdf','synthetic/expired-preview.pdf',1,now()-interval '2 days',now()-interval '1 day'),
 ('91919191-9191-4191-8191-919191919103','web','metrics-purge-success','purging','synthetic/success.pdf','synthetic/success-preview.pdf',1,now()-interval '2 days',now()-interval '1 day'),
 ('91919191-9191-4191-8191-919191919104','web','metrics-purge-failure','purging','synthetic/failure.pdf','synthetic/failure-preview.pdf',1,now()-interval '2 days',now()-interval '1 day'),
 ('91919191-9191-4191-8191-919191919105','web','metrics-outbox','review','synthetic/outbox.pdf',null,1,null,null);
insert into public.payment_proof_outbox(proof_id,event_type,channel,payload,status,attempts,next_attempt_at) values
 ('91919191-9191-4191-8191-919191919105','synthetic-auto-dead','web','{}','pending',4,now()),
 ('91919191-9191-4191-8191-919191919101','synthetic-manual-dead','web','{}','pending',1,now());
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$declare job jsonb;begin
 job:=public.claim_payment_proof_maintenance(60,'outbox');
 perform set_config('test.auto_outbox_id',job->>'id',false);
 perform set_config('test.auto_outbox_token',job->>'lease_token',false);
 perform set_config('test.auto_outbox_attempt',job->>'attempt',false);
 job:=public.claim_payment_proof_maintenance(60,'outbox');
 perform set_config('test.manual_outbox_id',job->>'id',false);
end$$;
select ok(public.complete_payment_proof_maintenance('outbox',current_setting('test.auto_outbox_id'),false,'sensitive arbitrary worker detail',current_setting('test.auto_outbox_token')::uuid,current_setting('test.auto_outbox_attempt')::integer),'lease owner may complete automatic terminal failure');
select ok(public.dead_letter_payment_proof_outbox(current_setting('test.manual_outbox_id')::bigint,'different sensitive worker detail'),'permanent dead-letter completes');
reset role;
select ok((select bool_and(dead_lettered_at is not null) from public.payment_proof_outbox),'automatic and permanent dead-letter transitions set timestamps');
select is((select string_agg(last_error,',' order by id) from public.payment_proof_outbox),'operation_failed,operation_failed','arbitrary errors are replaced by fixed operation_failed');
select ok(not exists(select 1 from public.payment_proof_outbox where last_error like '%sensitive%'),'arbitrary error detail is not persisted');
reset role;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select ok(public.complete_payment_proof_maintenance('purge','91919191-9191-4191-8191-919191919103',true,'ignored success detail',null,null),'successful purge completes through current completion API');
select ok(public.complete_payment_proof_maintenance('purge','91919191-9191-4191-8191-919191919104',false,'sensitive storage provider detail',null,null),'failed purge completes with retry through current completion API');
reset role;
select is((select status from public.payment_proofs where delivery_key='metrics-purge-success'),'purged','successful purge has exact fixed status');
select is((select event_type||'/'||result_status from public.payment_proof_events where proof_id='91919191-9191-4191-8191-919191919103'),'purged/purged','successful purge emits exact fixed event and result');
select is((select event_type||'/'||coalesce(reason,'') from public.payment_proof_events where proof_id='91919191-9191-4191-8191-919191919104'),'purge_failed/storage_delete_failed','failed purge emits exact fixed failure event and reason');
select ok((select status='quarantined' and purge_after>now() and preview_storage_key is not null from public.payment_proofs where delivery_key='metrics-purge-failure'),'failed purge returns to quarantine with retry semantics');
select ok(not exists(select 1 from public.payment_proof_events where coalesce(reason,'') like '%sensitive%'),'purge failure does not persist arbitrary error detail');

truncate table private.payment_proof_operational_failures, public.payment_proof_outbox, public.payment_proof_events, public.payment_proof_hash_tombstones, public.payment_proofs restart identity cascade;
insert into public.payment_proofs(id,channel,delivery_key,status,original_storage_key,size_bytes,quarantined_at,purge_after) values
 ('92929292-9292-4292-8292-929292929101','web','metric-received','received','synthetic/a.pdf',1,null,null),
 ('92929292-9292-4292-8292-929292929102','web','metric-quarantined','quarantined','synthetic/b.pdf',1,now()-interval '2 days',now()-interval '1 day');
insert into public.payment_proof_outbox(proof_id,event_type,channel,status,attempts,dead_lettered_at) values
 ('92929292-9292-4292-8292-929292929101','metric-pending','web','pending',0,null),
 ('92929292-9292-4292-8292-929292929102','metric-dead','web','dead_letter',5,now());
insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason)
 values('92929292-9292-4292-8292-929292929102','purge_failed','worker','purging','quarantined','storage_delete_failed');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select ok(public.record_payment_proof_operational_failure('92929292-9292-4292-8292-929292929101','render') and public.record_payment_proof_operational_failure('92929292-9292-4292-8292-929292929102','classifier'),'fixed failure counters accept seeded stages');
select is(public.get_payment_proof_operational_metrics()->'lifecycle','{"received":1,"identity_pending":0,"processing":0,"review":0,"admitted":0,"quarantined":1,"purging":0,"duplicate":0,"purged":0}'::jsonb,'lifecycle metrics use fixed values and zero-filled keys');
select is(public.get_payment_proof_operational_metrics()->'outbox','{"pending":1,"claimed":0,"completed":0,"dead_letter":1,"attempts":{"zero":1,"one":0,"two":0,"three_to_four":0,"five_plus":1},"dead_letter_last_60m":1}'::jsonb,'outbox and attempt metrics use fixed values and zero-filled keys');
select is(public.get_payment_proof_operational_metrics()->'quarantine','{"total":1,"expired":1}'::jsonb,'quarantine metrics expose fixed aggregate values');
select is(public.get_payment_proof_operational_metrics()->'purge','{"failures_last_60m":1}'::jsonb,'purge metrics expose fixed aggregate values');
select is(public.get_payment_proof_operational_metrics()->'failures','{"render_last_60m":1,"classifier_last_60m":1}'::jsonb,'failure metrics expose fixed aggregate values');
select ok(public.get_payment_proof_operational_metrics() ?& array['lifecycle','outbox','quarantine','purge','failures','maintenance'],'metrics has fixed top-level keys');
select is((select count(*)::integer from jsonb_object_keys(public.get_payment_proof_operational_metrics())),6,'metrics has no dynamic top-level dimensions');
select ok(not (public.get_payment_proof_operational_metrics()::text ~ '(92929292|synthetic/|delivery_key|proof_id|customer_id|last_error|event_type|channel)'),'metrics omit identifiers, data, errors, and dynamic dimensions');

select * from finish();
rollback;
