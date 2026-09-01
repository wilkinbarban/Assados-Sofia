\ir ../migrations/20260828370000_payment_proof_unresolved_diagnostics.sql
begin;
select plan(15);
set local role postgres;
select set_config('test.unresolved_baseline',jsonb_build_object(
 'processing_queue_dead_letter',(select count(*) from private.payment_proof_processing_queue where status='dead_letter'),
 'outbox_dead_letter',(select count(*) from public.payment_proof_outbox where status='dead_letter'),
 'unresolved_dead_letter',(select count(*) from public.payment_proof_outbox where status='dead_letter')+(select count(*) from private.payment_proof_processing_queue where status='dead_letter'))::text,false);
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
 ('37373737-3737-4373-8373-373737373701','00000000-0000-0000-0000-000000000000','authenticated','authenticated','supervisor-diagnostics@test',now(),now()),
 ('37373737-3737-4373-8373-373737373704','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-diagnostics@test',now(),now()),
 ('37373737-3737-4373-8373-373737373702','00000000-0000-0000-0000-000000000000','authenticated','authenticated','seller-diagnostics@test',now(),now()),
 ('37373737-3737-4373-8373-373737373703','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inactive-diagnostics@test',now(),now()) on conflict do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('37373737-3737-4373-8373-373737373701','Supervisor','supervisor',true),('37373737-3737-4373-8373-373737373704','Admin','admin',true),('37373737-3737-4373-8373-373737373702','Seller','vendedor',true),('37373737-3737-4373-8373-373737373703','Inactive','supervisor',false) on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;
insert into public.payment_proofs(id,channel,delivery_key,status,original_storage_key,size_bytes) values
 ('37373737-3737-4373-8373-373737373711','web','diagnostics-outbox','review','synthetic/outbox.pdf',1),('37373737-3737-4373-8373-373737373712','web','diagnostics-queue','review','synthetic/queue.pdf',1) on conflict do nothing;
insert into public.payment_proof_outbox(proof_id,event_type,channel,payload,status,attempts,dead_lettered_at) values('37373737-3737-4373-8373-373737373711','diagnostics','web','{}','dead_letter',5,now()-interval '2 hours') on conflict(proof_id,event_type) do update set status='dead_letter',dead_lettered_at=excluded.dead_lettered_at;
insert into private.payment_proof_processing_queue(proof_id,status,attempts,dead_lettered_at) values('37373737-3737-4373-8373-373737373712','dead_letter',5,now()-interval '1 hour') on conflict(proof_id) do update set status='dead_letter',attempts=5,dead_lettered_at=excluded.dead_lettered_at;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','37373737-3737-4373-8373-373737373701',false);
select is((public.get_payment_proof_unresolved_diagnostics()->>'unresolved_dead_letter')::integer,(current_setting('test.unresolved_baseline')::jsonb->>'unresolved_dead_letter')::integer+2,'supervisor receives both unresolved sources above the baseline');
select is((public.get_payment_proof_unresolved_diagnostics()->>'processing_queue_dead_letter')::integer,(current_setting('test.unresolved_baseline')::jsonb->>'processing_queue_dead_letter')::integer+1,'queue count adds the fixture to the baseline');
select is((public.get_payment_proof_unresolved_diagnostics()->>'outbox_dead_letter')::integer,(current_setting('test.unresolved_baseline')::jsonb->>'outbox_dead_letter')::integer+1,'outbox count adds the fixture to the baseline');
select ok((public.get_payment_proof_unresolved_diagnostics()->>'oldest_unresolved_dead_letter_age_seconds')::bigint>=3600,'oldest unresolved age is reported');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','37373737-3737-4373-8373-373737373704',false);
select is((public.get_payment_proof_unresolved_diagnostics()->>'unresolved_dead_letter')::integer,(current_setting('test.unresolved_baseline')::jsonb->>'unresolved_dead_letter')::integer+2,'active admin can call diagnostics successfully');
reset role;
set local role postgres;
select set_config('test.privileged_queue_snapshot',(select row(proof_id,status,attempts,dead_lettered_at)::text from private.payment_proof_processing_queue where proof_id='37373737-3737-4373-8373-373737373712'),false);
select set_config('test.privileged_outbox_snapshot',(select row(proof_id,event_type,status,attempts,dead_lettered_at)::text from public.payment_proof_outbox where proof_id='37373737-3737-4373-8373-373737373711'),false);
set local role authenticated;
select set_config('request.jwt.claim.sub','37373737-3737-4373-8373-373737373702',false);
select throws_ok($$select public.get_payment_proof_unresolved_diagnostics()$$,'42501','PAYMENT_PROOF_DIAGNOSTICS_FORBIDDEN','seller is denied dry diagnostics');
reset role;
select ok((select row(proof_id,status,attempts,dead_lettered_at)::text from private.payment_proof_processing_queue where proof_id='37373737-3737-4373-8373-373737373712')=current_setting('test.privileged_queue_snapshot') and (select row(proof_id,event_type,status,attempts,dead_lettered_at)::text from public.payment_proof_outbox where proof_id='37373737-3737-4373-8373-373737373711')=current_setting('test.privileged_outbox_snapshot'),'seller denial leaves queue and outbox unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub','37373737-3737-4373-8373-373737373703',false);
select throws_ok($$select public.get_payment_proof_unresolved_diagnostics()$$,'42501','PAYMENT_PROOF_DIAGNOSTICS_FORBIDDEN','inactive staff is denied dry diagnostics');
reset role;
select ok((select row(proof_id,status,attempts,dead_lettered_at)::text from private.payment_proof_processing_queue where proof_id='37373737-3737-4373-8373-373737373712')=current_setting('test.privileged_queue_snapshot') and (select row(proof_id,event_type,status,attempts,dead_lettered_at)::text from public.payment_proof_outbox where proof_id='37373737-3737-4373-8373-373737373711')=current_setting('test.privileged_outbox_snapshot'),'inactive denial leaves queue and outbox unchanged');
set local role anon;
select throws_ok($$select public.get_payment_proof_unresolved_diagnostics()$$,'42501',null,'anonymous caller is denied dry diagnostics at the privilege boundary');
reset role;
select ok((select row(proof_id,status,attempts,dead_lettered_at)::text from private.payment_proof_processing_queue where proof_id='37373737-3737-4373-8373-373737373712')=current_setting('test.privileged_queue_snapshot') and (select row(proof_id,event_type,status,attempts,dead_lettered_at)::text from public.payment_proof_outbox where proof_id='37373737-3737-4373-8373-373737373711')=current_setting('test.privileged_outbox_snapshot'),'anonymous denial leaves queue and outbox unchanged');
select ok(not exists(select 1 from information_schema.columns where table_schema='private' and table_name='payment_proof_alert_delivery_failures' and column_name~'(error|payload|token|chat|text|content)'),'failure ledger has no raw delivery detail');
set local role postgres;
insert into private.payment_proof_admin_alert_outbox(family,kind,generation,count,severity) values('dead_letter_growth','initial',999,2,2) on conflict(family,generation,kind) do nothing;
select set_config('test.alert_id',(select id::text from private.payment_proof_admin_alert_outbox where family='dead_letter_growth' and generation=999),false);
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select ok(public.record_payment_proof_alert_delivery_failure(current_setting('test.alert_id')::bigint),'service records bounded sanitized failure');
select ok(public.record_payment_proof_alert_delivery_failure(current_setting('test.alert_id')::bigint),'repeat recording is cooldown deduplicated');
reset role;
set local role postgres;
select is((select count(*)::integer from private.payment_proof_alert_delivery_failures where alert_id=current_setting('test.alert_id')::bigint),1,'failure ledger stores one sanitized row per alert');
reset role;
select * from finish();rollback;
