\ir ../migrations/20260828390000_payment_proof_purge_fencing_and_replay_purge.sql
select plan(18);
delete from private.payment_proof_processing_queue where proof_id in('55555555-5555-4555-8555-555555555520','55555555-5555-4555-8555-555555555521');
delete from public.payment_proof_hash_tombstones where canonical_proof_id in('55555555-5555-4555-8555-555555555520','55555555-5555-4555-8555-555555555521');
delete from public.payment_proofs where id in('55555555-5555-4555-8555-555555555520','55555555-5555-4555-8555-555555555521');
insert into public.payment_proofs(id,channel,delivery_key,status,original_storage_key,preview_storage_key,size_bytes,sha256)values
('55555555-5555-4555-8555-555555555520','telegram','queue-test','received','proofs/private/telegram/q.pdf',null,10,repeat('c',64)),
('55555555-5555-4555-8555-555555555521','telegram','queue-backfill','received','proofs/private/telegram/b.pdf',null,10,repeat('d',64));
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select extensions.ok(public.enqueue_payment_proof_processing('55555555-5555-4555-8555-555555555520'),'enqueue');
select extensions.ok(public.enqueue_payment_proof_processing('55555555-5555-4555-8555-555555555520'),'idempotent enqueue');
select extensions.is((select count(*)::integer from private.payment_proof_processing_queue where proof_id='55555555-5555-4555-8555-555555555520'),1,'unique proof job');
do $$declare a jsonb;b jsonb;begin
 select public.claim_payment_proof_maintenance(10,'processing') into a;
 update private.payment_proof_processing_queue set claimed_until=now()-interval'1 second' where proof_id='55555555-5555-4555-8555-555555555520';
 select public.claim_payment_proof_maintenance(10,'processing') into b;
 perform set_config('test.lease_a',a->>'lease_token',false);perform set_config('test.lease_b',b->>'lease_token',false);
end$$;
select extensions.isnt(current_setting('test.lease_a'),current_setting('test.lease_b'),'reclaim uses random ownership token');
select extensions.is(public.complete_payment_proof_maintenance('processing','55555555-5555-4555-8555-555555555520',false,'load',current_setting('test.lease_a')::uuid,1),false,'stale A cannot complete B');
select extensions.is(public.complete_payment_proof_maintenance('processing','55555555-5555-4555-8555-555555555520',false,'load',current_setting('test.lease_b')::uuid,2),true,'exact token and attempt completes');
select extensions.is((public.get_payment_proof_delivery_state('telegram','queue-test')->>'state'),'queued','replay state repairs completed attempt to pending queue');
select extensions.is((public.get_payment_proof_delivery_state('telegram','missing')->>'state'),'missing','replay missing enum');
select extensions.ok(coalesce(public.claim_payment_proof_maintenance(10,'outbox')->>'kind','outbox')='outbox','explicit outbox budget progresses independently even with aggregate fixtures');
select extensions.ok(coalesce(public.claim_payment_proof_maintenance(10,'purge')->>'kind','purge')='purge','explicit purge budget progresses independently even with aggregate fixtures');
update public.payment_proofs set status='quarantined',quarantined_at=now(),purge_after=now()-interval '1 second',purge_lease_token=null,purge_claimed_until=null,purge_attempt=0 where id='55555555-5555-4555-8555-555555555521';
do $$declare a jsonb;b jsonb;begin
 select public.claim_payment_proof_maintenance(10,'purge') into a;
 update public.payment_proofs set purge_claimed_until=now()-interval '1 second' where id='55555555-5555-4555-8555-555555555521';
 select public.claim_payment_proof_maintenance(10,'purge') into b;
 perform set_config('test.purge_lease_a',a->>'lease_token',false);perform set_config('test.purge_lease_b',b->>'lease_token',false);
end$$;
select extensions.isnt(current_setting('test.purge_lease_a'),current_setting('test.purge_lease_b'),'expired purge reclaim uses random ownership token');
select extensions.is(public.complete_payment_proof_maintenance('purge','55555555-5555-4555-8555-555555555521',true,null,current_setting('test.purge_lease_a')::uuid,1),false,'stale purge claimant cannot complete reclaimed attempt');
select extensions.is(public.complete_payment_proof_maintenance('purge','55555555-5555-4555-8555-555555555521',true,null,current_setting('test.purge_lease_b')::uuid,2),true,'exact purge token and attempt completes');
select extensions.is((select status from public.payment_proofs where id='55555555-5555-4555-8555-555555555521'),'purged','exact purge completion transitions proof');
select extensions.throws_ok($$select public.complete_payment_proof_maintenance('purge','55555555-5555-4555-8555-555555555521',true,null)$$,'42883',null,'tokenless completion overload is absent');
update private.payment_proof_processing_queue set status='claimed',attempts=5,next_attempt_at=now(),claimed_until=now()-interval'1 second',lease_token=gen_random_uuid() where proof_id='55555555-5555-4555-8555-555555555520';
select public.claim_payment_proof_maintenance(10,'processing');
select extensions.is((select status from private.payment_proof_processing_queue where proof_id='55555555-5555-4555-8555-555555555520'),'dead_letter','expired fifth attempt dead letters');
select extensions.is((select status from public.payment_proofs where id='55555555-5555-4555-8555-555555555520'),'review','dead letter is manual-review safe');
select extensions.throws_ok($$select public.enqueue_payment_proof_processing('00000000-0000-0000-0000-000000000000')$$,'23514','PAYMENT_PROOF_NOT_QUEUEABLE','invalid proof rejected');
reset role;select * from extensions.finish();
