select to_regprocedure('public.dispose_payment_proof_processing_dead_letter_missing_original(text,text,uuid)') is null as needs_disposition \gset
\if :needs_disposition
\ir ../migrations/20260907120000_payment_proof_dead_letter_missing_original_disposition.sql
\endif
begin;
select plan(16);
set role postgres;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values('71717171-7171-4171-8171-717171717101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dead-letter-disposer@test',now(),now(),'','','','')
on conflict(id) do update set confirmation_token='',email_change='',email_change_token_new='',recovery_token='';
insert into public.perfis(id,nome,funcao,ativo)
values('71717171-7171-4171-8171-717171717101','Dead letter disposer','supervisor',true)
on conflict(id) do update set funcao='supervisor',ativo=true;
insert into public.clientes(id,nome,telefone)
values('71717171-7171-4171-8171-717171717121','Disposition customer','5541999999717') on conflict do nothing;
insert into public.conversas(id,cliente_id,status,ia_ativa)
values('71717171-7171-4171-8171-717171717131','71717171-7171-4171-8171-717171717121','aberta',false)
on conflict do nothing;
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos)
values
('71717171-7171-4171-8171-717171717141','71717171-7171-4171-8171-717171717121','confirmado','pendente','retirada','pix',100,0,100),
('71717171-7171-4171-8171-717171717142','71717171-7171-4171-8171-717171717121','confirmado','pendente','retirada','pix',100,0,100)
on conflict do nothing;
reset role;
set role service_role;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim','{"role":"service_role"}',false);
select * from public.admit_payment_proof_intake('web','dead-letter-disposition-review','71717171-7171-4171-8171-717171717121',null,'proofs/private/missing-review.pdf',100,'application/pdf','71717171-7171-4171-8171-717171717141','71717171-7171-4171-8171-717171717131',repeat('7',64));
select * from public.admit_payment_proof_intake('web','dead-letter-disposition-purged','71717171-7171-4171-8171-717171717121',null,'proofs/private/missing-purged.pdf',100,'application/pdf','71717171-7171-4171-8171-717171717142','71717171-7171-4171-8171-717171717131',repeat('8',64));
reset role;
set role postgres;
update public.payment_proofs set status='review' where delivery_key='dead-letter-disposition-review';
update public.payment_proofs set status='purged',quarantined_at=now()-interval '11 days',purge_after=now()-interval '1 day'
 where delivery_key='dead-letter-disposition-purged';
insert into private.payment_proof_processing_queue(
 proof_id,status,attempts,dead_lettered_at,failure_stage,claimed_until,lease_token,completed_at
)
select id,'dead_letter',5,now()-interval '1 hour','load',null,null,null
from public.payment_proofs
where delivery_key in('dead-letter-disposition-review','dead-letter-disposition-purged')
on conflict(proof_id) do update set
 status='dead_letter',attempts=5,dead_lettered_at=excluded.dead_lettered_at,
 failure_stage='load',claimed_until=null,lease_token=null,completed_at=null;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','71717171-7171-4171-8171-717171717101',false);
select is(
 public.dispose_payment_proof_processing_dead_letter_missing_original(
  (select id::text from public.payment_proofs where delivery_key='dead-letter-disposition-review'),
  'historical_dead_letter_missing_original','71717171-7171-4171-8171-717171717201'
 )->>'outcome','quarantined_and_abandoned','review dead letter is quarantined and abandoned');
select is(
 public.dispose_payment_proof_processing_dead_letter_missing_original(
  (select id::text from public.payment_proofs where delivery_key='dead-letter-disposition-purged'),
  'historical_dead_letter_missing_original','71717171-7171-4171-8171-717171717202'
 )->>'outcome','abandoned_purged','purged dead letter is abandoned without reopening proof');
select is(
 public.dispose_payment_proof_processing_dead_letter_missing_original(
  (select id::text from public.payment_proofs where delivery_key='dead-letter-disposition-review'),
  'historical_dead_letter_missing_original','71717171-7171-4171-8171-717171717201'
 )->>'outcome','quarantined_and_abandoned','same idempotency key returns prior opaque outcome');
select throws_ok(
 $$select public.dispose_payment_proof_processing_dead_letter_missing_original(
  (select id::text from public.payment_proofs where delivery_key='dead-letter-disposition-purged'),
  'historical_dead_letter_missing_original','71717171-7171-4171-8171-717171717201')$$,
 '23505','PAYMENT_PROOF_PROCESSING_MAINTENANCE_IDEMPOTENCY_CONFLICT','idempotency key cannot be rebound');
reset role;
set role postgres;
select is((select status from public.payment_proofs where delivery_key='dead-letter-disposition-review'),'quarantined','review proof entered quarantine');
select ok((select quarantined_at is not null and purge_after between now()+interval '9 days 23 hours' and now()+interval '10 days 1 hour' from public.payment_proofs where delivery_key='dead-letter-disposition-review'),'quarantine has a ten-day retention window');
select is((select status from private.payment_proof_processing_queue where proof_id=(select id from public.payment_proofs where delivery_key='dead-letter-disposition-review')),'abandoned','review queue is terminally abandoned');
select is((select status from public.payment_proofs where delivery_key='dead-letter-disposition-purged'),'purged','purged proof remains purged');
select is((select status from private.payment_proof_processing_queue where proof_id=(select id from public.payment_proofs where delivery_key='dead-letter-disposition-purged')),'abandoned','purged queue is terminally abandoned');
select is((select count(*)::integer from public.payment_proof_events where proof_id=(select id from public.payment_proofs where delivery_key='dead-letter-disposition-review') and event_type='processing_dead_letter_disposed'),1,'review transition has one immutable lifecycle event');
select is((select count(*)::integer from public.payment_proof_events where proof_id=(select id from public.payment_proofs where delivery_key='dead-letter-disposition-purged') and event_type='processing_dead_letter_disposed'),0,'purged disposition emits no quarantine event');
select is((select count(*)::integer from public.payment_proof_outbox where proof_id=(select id from public.payment_proofs where delivery_key='dead-letter-disposition-review') and event_type='payment_proof_rejected'),1,'review transition creates one fixed-message outbox notification');
select is((select count(*)::integer from public.payment_proof_outbox where proof_id=(select id from public.payment_proofs where delivery_key='dead-letter-disposition-purged') and event_type='payment_proof_rejected'),0,'purged disposition creates no notification');
select is((select count(*)::integer from private.payment_proof_processing_maintenance_audit where idempotency_key in('71717171-7171-4171-8171-717171717201','71717171-7171-4171-8171-717171717202')),2,'one immutable audit row exists per disposition');
select ok((select bool_and(reason_code='historical_dead_letter_missing_original' and prior_queue_status='dead_letter' and prior_proof_status in('review','purged')) from private.payment_proof_processing_maintenance_audit where idempotency_key in('71717171-7171-4171-8171-717171717201','71717171-7171-4171-8171-717171717202')),'audit retains bounded prior state and reason');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','71717171-7171-4171-8171-717171717101',false);
select is(
 public.dispose_payment_proof_processing_dead_letter_missing_original('not-a-uuid','historical_dead_letter_missing_original','71717171-7171-4171-8171-717171717203')->>'outcome',
 'invalid_request','invalid target is rejected opaquely');
select * from finish();
rollback;
