\ir ../migrations/20260903180000_evolution_payment_proof_identity_destination.sql
\ir ../migrations/20260903190000_payment_proof_immutable_delivery_provenance.sql
\ir ../migrations/20260903193000_whatsapp_payment_proof_inbound_window.sql
\ir ../migrations/20260903194000_evolution_atomic_identity_admission.sql

begin;
select plan(22);

select ok(has_function_privilege('service_role', 'public.admit_and_enqueue_evolution_payment_proof(text,text,text,text,bigint,text,uuid,text)', 'EXECUTE'), 'service role can execute atomic Evolution admission');
select ok(not has_function_privilege('anon', 'public.admit_and_enqueue_evolution_payment_proof(text,text,text,text,bigint,text,uuid,text)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.admit_and_enqueue_evolution_payment_proof(text,text,text,text,bigint,text,uuid,text)', 'EXECUTE'), 'browser roles cannot execute atomic Evolution admission');

set role service_role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim', '{"role":"service_role"}', false);
create temporary table evolution_atomic_results(label text primary key, proof_id uuid, customer_id uuid, conversation_id uuid, idempotent boolean, duplicate boolean);
create temporary table evolution_atomic_evidence(customer_id uuid primary key, inbound_at timestamptz not null);
insert into evolution_atomic_results select 'accepted', proof_id, customer_id, conversation_id, idempotent, duplicate from public.admit_and_enqueue_evolution_payment_proof('5541998888811', 'Atomic customer', 'evolution:atomic:accepted', 'proofs/private/atomic-accepted.pdf', 6, 'application/pdf', null, repeat('a', 64));

select is((select count(*)::integer from public.clientes where telefone = '5541998888811'), 1, 'successful admission creates one customer');
select is((select count(*)::integer from public.conversas where id = (select conversation_id from evolution_atomic_results where label = 'accepted')), 1, 'successful admission creates one bound conversation');
select is((select count(*)::integer from public.payment_proofs where id = (select proof_id from evolution_atomic_results where label = 'accepted') and customer_id = (select customer_id from evolution_atomic_results where label = 'accepted') and conversation_id = (select conversation_id from evolution_atomic_results where label = 'accepted')), 1, 'successful admission binds proof to returned identity');
select ok((select ultima_interacao_recebida_em is not null from public.clientes where id = (select customer_id from evolution_atomic_results where label = 'accepted')), 'successful admission advances inbound evidence');
insert into evolution_atomic_evidence select id, ultima_interacao_recebida_em from public.clientes where id = (select customer_id from evolution_atomic_results where label = 'accepted');
select is((select channel from public.payment_proofs where id = (select proof_id from evolution_atomic_results where label = 'accepted')), 'whatsapp', 'successful admission records WhatsApp proof channel');
select is((select conversation_id from public.payment_proofs where id = (select proof_id from evolution_atomic_results where label = 'accepted')), (select conversation_id from evolution_atomic_results where label = 'accepted'), 'successful admission records the resolved WhatsApp destination');
select is((select event_type from public.payment_proof_events where proof_id = (select proof_id from evolution_atomic_results where label = 'accepted') order by created_at asc limit 1), 'intake_received', 'successful admission records the payment-proof intake event');

insert into public.clientes(id, nome, telefone) values ('81818181-8181-4181-8181-818181818181', 'Seed', '5541998888812');
insert into public.conversas(id, cliente_id, status, ia_ativa) values ('82828282-8282-4282-8282-828282828282', '81818181-8181-4181-8181-818181818181', 'aberta', false);
insert into public.payment_proofs(customer_id, conversation_id, channel, delivery_key, sender_reference, status, original_storage_key, mime_type, size_bytes, sha256) values ('81818181-8181-4181-8181-818181818181', '82828282-8282-4282-8282-828282828282', 'whatsapp', 'evolution:atomic:conflict', '5541998888812', 'received', 'proofs/private/seed.pdf', 'application/pdf', 6, repeat('b', 64));
select throws_ok($$select * from public.admit_and_enqueue_evolution_payment_proof('5541998888813', 'Orphan prohibited', 'evolution:atomic:conflict', 'proofs/private/conflict.pdf', 6, 'application/pdf', null, repeat('c', 64))$$, '23505', 'PAYMENT_PROOF_DELIVERY_CONFLICT', 'delivery provenance conflict fails atomically');
select is((select count(*)::integer from public.clientes where telefone = '5541998888813'), 0, 'conflict leaves no customer orphan');
select is((select count(*)::integer from public.conversas c join public.clientes customer on customer.id = c.cliente_id where customer.telefone = '5541998888813'), 0, 'conflict leaves no conversation orphan');
select ok((select ultima_interacao_recebida_em is null from public.clientes where telefone = '5541998888812'), 'conflict does not advance existing identity inbound evidence');

select throws_ok($$select * from public.admit_and_enqueue_evolution_payment_proof('5541998888814', 'Invalid prohibited', 'evolution:atomic:invalid', 'proofs/private/invalid.pdf', 6, 'image/png', null, repeat('d', 64))$$, '22023', 'PAYMENT_PROOF_INTAKE_INVALID', 'invalid admission fails atomically');
select is((select count(*)::integer from public.clientes where telefone = '5541998888814'), 0, 'invalid admission leaves no customer orphan');
select is((select count(*)::integer from public.conversas c join public.clientes customer on customer.id = c.cliente_id where customer.telefone = '5541998888814'), 0, 'invalid admission leaves no conversation orphan');

insert into evolution_atomic_results select 'retry', proof_id, customer_id, conversation_id, idempotent, duplicate from public.admit_and_enqueue_evolution_payment_proof('5541998888811', 'Changed', 'evolution:atomic:accepted', 'proofs/private/atomic-accepted.pdf', 6, 'application/pdf', null, repeat('a', 64));
select is((select customer_id from evolution_atomic_results where label = 'retry'), (select customer_id from evolution_atomic_results where label = 'accepted'), 'exact retry returns the same customer');
select is((select proof_id from evolution_atomic_results where label = 'retry'), (select proof_id from evolution_atomic_results where label = 'accepted'), 'exact retry returns the same proof');
select is((select ultima_interacao_recebida_em from public.clientes where id = (select customer_id from evolution_atomic_results where label = 'accepted')), (select inbound_at from evolution_atomic_evidence where customer_id = (select customer_id from evolution_atomic_results where label = 'accepted')), 'exact retry does not advance inbound evidence');
select is((select count(*)::integer from public.payment_proof_outbox where proof_id = (select proof_id from evolution_atomic_results where label = 'accepted')), 0, 'exact replay creates no duplicate outbox message');
insert into evolution_atomic_results select 'duplicate', proof_id, customer_id, conversation_id, idempotent, duplicate from public.admit_and_enqueue_evolution_payment_proof('5541998888811', 'Atomic customer', 'evolution:atomic:duplicate', 'proofs/private/atomic-duplicate.pdf', 6, 'application/pdf', null, repeat('a', 64));
select ok((select duplicate from evolution_atomic_results where label = 'duplicate'), 'duplicate SHA admission is marked duplicate');
select ok((select channel = 'whatsapp' and conversation_id = (select conversation_id from evolution_atomic_results where label = 'accepted') and event_type = 'payment_proof_duplicate' and payload->>'message_key' = 'payment_proof_already_received' from public.payment_proof_outbox where proof_id = (select proof_id from evolution_atomic_results where label = 'duplicate')), 'duplicate SHA creates the correct WhatsApp destination, event, and message key');

reset role;
select * from finish();
rollback;
