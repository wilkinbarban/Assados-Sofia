-- Separate committed setup is required: dblink sessions cannot observe the parent
-- pgTAP transaction's uncommitted migration or fixtures.
\ir ../migrations/20260828340000_payment_proof_operator_leases.sql
\ir ../migrations/20260828380000_payment_proof_dead_letter_replay.sql
\ir ../migrations/20260828390000_payment_proof_purge_fencing_and_replay_purge.sql
\ir ../migrations/20260828400000_payment_proof_replay_audit_hardening.sql
select plan(4);

insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
 ('48484848-4848-4483-8483-484848484801','00000000-0000-0000-0000-000000000000','authenticated','authenticated','replay-concurrent-admin@test',now(),now()),
 ('48484848-4848-4483-8483-484848484802','00000000-0000-0000-0000-000000000000','authenticated','authenticated','replay-concurrent-supervisor@test',now(),now())
on conflict do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('48484848-4848-4483-8483-484848484801','Concurrent admin','admin',true),
 ('48484848-4848-4483-8483-484848484802','Concurrent supervisor','supervisor',true)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;
insert into public.payment_proofs(id,channel,delivery_key,status,original_storage_key,size_bytes) values
 ('48484848-4848-4483-8483-484848484811','web','replay-concurrent-a','review','synthetic/replay-concurrent-a.pdf',1),
 ('48484848-4848-4483-8483-484848484812','web','replay-concurrent-b','review','synthetic/replay-concurrent-b.pdf',1)
on conflict do nothing;
insert into private.payment_proof_processing_queue(proof_id,status,attempts,dead_lettered_at,failure_stage,claimed_until,lease_token) values
 ('48484848-4848-4483-8483-484848484811','dead_letter',5,now(),'render',null,null),
 ('48484848-4848-4483-8483-484848484812','dead_letter',5,now(),'render',null,null)
on conflict(proof_id) do update set status='dead_letter',attempts=5,dead_lettered_at=now(),failure_stage='render',claimed_until=null,lease_token=null;

create extension if not exists dblink;
select dblink_connect('replay_concurrent_admin', :'runtime_dblink_conninfo');
select dblink_connect('replay_concurrent_supervisor', :'runtime_dblink_conninfo');
select dblink_exec('replay_concurrent_admin', $$set role authenticated$$);
select dblink_exec('replay_concurrent_admin', 'do $remote$ begin perform set_config(''request.jwt.claim.sub'',''48484848-4848-4483-8483-484848484801'',false); end $remote$');
select dblink_exec('replay_concurrent_supervisor', $$set role authenticated$$);
select dblink_exec('replay_concurrent_supervisor', 'do $remote$ begin perform set_config(''request.jwt.claim.sub'',''48484848-4848-4483-8483-484848484802'',false); end $remote$');
select dblink_send_query('replay_concurrent_admin', $$select public.replay_payment_proof_dead_letter('processing_queue','48484848-4848-4483-8483-484848484811','48484848-4848-4483-8483-484848484821'::uuid)->>'outcome'$$);
select dblink_send_query('replay_concurrent_supervisor', $$select public.replay_payment_proof_dead_letter('processing_queue','48484848-4848-4483-8483-484848484812','48484848-4848-4483-8483-484848484821'::uuid)->>'outcome'$$);
create temp table replay_concurrency_outcomes(outcome text not null);
insert into replay_concurrency_outcomes select * from dblink_get_result('replay_concurrent_admin') as result(outcome text);
insert into replay_concurrency_outcomes select * from dblink_get_result('replay_concurrent_supervisor') as result(outcome text);
select dblink_disconnect('replay_concurrent_admin');
select dblink_disconnect('replay_concurrent_supervisor');

select ok((select count(*)=1 from private.payment_proof_dead_letter_replay_requests where idempotency_key='48484848-4848-4483-8483-484848484821'),'concurrent requests retain exactly one durable idempotency key');
select ok((select array_agg(outcome order by outcome)=array['idempotency_conflict','replayed'] from replay_concurrency_outcomes),'concurrent different fingerprints deterministically resolve to replay and idempotency_conflict without 23505');
select ok((select count(*)=1 from private.payment_proof_processing_queue where proof_id in ('48484848-4848-4483-8483-484848484811','48484848-4848-4483-8483-484848484812') and status='pending'),'only the owning request mutates one target');
select ok((select count(*)=1 and bool_and(outcome='replayed') from private.payment_proof_dead_letter_replay_requests where idempotency_key='48484848-4848-4483-8483-484848484821'),'the durable owner stores its single replay outcome');
select * from finish();
