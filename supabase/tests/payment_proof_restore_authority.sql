\ir ../migrations/20260906170000_payment_proof_restore_actor_snapshot.sql
begin;
select plan(28);
set role postgres;

insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
 ('71717171-7171-4171-8171-717171717171','00000000-0000-0000-0000-000000000000','authenticated','authenticated','restore-admin@test',now(),now()),
 ('72727272-7272-4272-8272-727272727272','00000000-0000-0000-0000-000000000000','authenticated','authenticated','restore-supervisor@test',now(),now()),
 ('73737373-7373-4373-8373-737373737373','00000000-0000-0000-0000-000000000000','authenticated','authenticated','restore-seller@test',now(),now()),
 ('74747474-7474-4474-8474-747474747474','00000000-0000-0000-0000-000000000000','authenticated','authenticated','restore-inactive@test',now(),now())
on conflict(id) do update set email=excluded.email,updated_at=excluded.updated_at;

insert into public.perfis(id,nome,funcao,ativo) values
 ('71717171-7171-4171-8171-717171717171','Restore admin','admin',true),
 ('72727272-7272-4272-8272-727272727272','Restore supervisor','supervisor',true),
 ('73737373-7373-4373-8373-737373737373','Restore seller','vendedor',true),
 ('74747474-7474-4474-8474-747474747474','Inactive admin','admin',false)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;

insert into public.clientes(id,nome,telefone) values
 ('75757575-7575-4575-8575-757575757575','Restore customer','5541999999975'),
 ('79797979-7979-4979-8979-797979797979','Other restore customer','5541999999976')
on conflict(id) do nothing;
insert into public.conversas(id,cliente_id,status,ia_ativa) values
 ('76767676-7676-4676-8676-767676767676','75757575-7575-4575-8575-757575757575','aberta',false),
 ('78787878-7878-4787-8878-787878787878','79797979-7979-4979-8979-797979797979','aberta',false)
on conflict(id) do nothing;

insert into public.payment_proofs(id,customer_id,conversation_id,channel,delivery_key,status,original_storage_key,mime_type,size_bytes,quarantined_at,purge_after)
values
 ('81818181-8181-4181-8181-818181818181','75757575-7575-4575-8575-757575757575','76767676-7676-4676-8676-767676767676','web','restore-admin','quarantined','restore/admin.pdf','application/pdf',100,now(),now()+interval '1 hour'),
 ('82828282-8282-4282-8282-828282828282','75757575-7575-4575-8575-757575757575','76767676-7676-4676-8676-767676767676','web','restore-supervisor','quarantined','restore/supervisor.pdf','application/pdf',100,now(),now()+interval '1 hour'),
 ('83838383-8383-4383-8383-838383838383','75757575-7575-4575-8575-757575757575','76767676-7676-4676-8676-767676767676','web','restore-seller','quarantined','restore/seller.pdf','application/pdf',100,now(),now()+interval '1 hour'),
 ('84848484-8484-4484-8484-848484848484','75757575-7575-4575-8575-757575757575','76767676-7676-4676-8676-767676767676','web','restore-inactive','quarantined','restore/inactive.pdf','application/pdf',100,now(),now()+interval '1 hour'),
 ('85858585-8585-4585-8585-858585858585','75757575-7575-4575-8575-757575757575','76767676-7676-4676-8676-767676767676','web','restore-expired','quarantined','restore/expired.pdf','application/pdf',100,now(),now()-interval '1 second'),
 ('86868686-8686-4686-8686-868686868686','75757575-7575-4575-8575-757575757575','76767676-7676-4676-8676-767676767676','web','restore-purging','purging','restore/purging.pdf','application/pdf',100,now(),now()-interval '1 second'),
 ('87878787-8787-4787-8787-878787878787','75757575-7575-4575-8575-757575757575',null,'web','restore-null-destination','quarantined','restore/null-destination.pdf','application/pdf',100,now(),now()+interval '1 hour'),
 ('88888888-8888-4888-8888-888888888888','75757575-7575-4575-8575-757575757575','78787878-7878-4787-8878-787878787878','web','restore-mismatch-destination','quarantined','restore/mismatch-destination.pdf','application/pdf',100,now(),now()+interval '1 hour')
on conflict(id) do update set customer_id=excluded.customer_id,conversation_id=excluded.conversation_id,status=excluded.status,quarantined_at=excluded.quarantined_at,purge_after=excluded.purge_after;
update public.payment_proofs set purge_lease_token=gen_random_uuid(),purge_claimed_until=now()+interval '1 minute',purge_attempt=1 where id='86868686-8686-4686-8686-868686868686';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','72727272-7272-4272-8272-727272727272',false);
do $$ begin
  perform public.restore_payment_proof('82828282-8282-4282-8282-828282828282','supervisor must not restore');
  raise exception 'supervisor restore unexpectedly succeeded';
exception when sqlstate '42501' then null; end $$;
reset role; set role postgres;
select is((select status from public.payment_proofs where id='82828282-8282-4282-8282-828282828282'),'quarantined','supervisor denial preserves protected state');
select is((select count(*) from public.payment_proof_events where proof_id='82828282-8282-4282-8282-828282828282'),0::bigint,'supervisor denial has no event');
select is((select count(*) from public.payment_proof_outbox where proof_id='82828282-8282-4282-8282-828282828282'),0::bigint,'supervisor denial has no outbox');
reset role; set role authenticated;

select set_config('request.jwt.claim.sub','73737373-7373-4373-8373-737373737373',false);
do $$ begin
  perform public.restore_payment_proof('83838383-8383-4383-8383-838383838383','seller must not restore');
  raise exception 'seller restore unexpectedly succeeded';
exception when sqlstate '42501' then null; end $$;
reset role; set role postgres;
select is((select status from public.payment_proofs where id='83838383-8383-4383-8383-838383838383'),'quarantined','seller denial preserves protected state');
select is((select count(*) from public.payment_proof_outbox where proof_id='83838383-8383-4383-8383-838383838383'),0::bigint,'seller denial has no outbox');
reset role; set role authenticated;

select set_config('request.jwt.claim.sub','74747474-7474-4474-8474-747474747474',false);
do $$ begin
  perform public.restore_payment_proof('84848484-8484-4484-8484-848484848484','inactive admin must not restore');
  raise exception 'inactive admin restore unexpectedly succeeded';
exception when sqlstate '42501' then null; end $$;
reset role; set role postgres;
select is((select status from public.payment_proofs where id='84848484-8484-4484-8484-848484848484'),'quarantined','inactive admin denial preserves protected state');
select is((select count(*) from public.payment_proof_outbox where proof_id='84848484-8484-4484-8484-848484848484'),0::bigint,'inactive admin denial has no outbox');
reset role; set role authenticated;

select set_config('request.jwt.claim.sub','71717171-7171-4171-8171-717171717171',false);
do $$ begin
  perform public.restore_payment_proof('87878787-8787-4787-8787-878787878787','null destination must reject');
  raise exception 'null destination restore unexpectedly succeeded';
exception when sqlstate '23514' then null; end $$;
reset role; set role postgres;
select is((select status from public.payment_proofs where id='87878787-8787-4787-8787-878787878787'),'quarantined','null destination denial preserves proof state');
select is((select count(*) from public.payment_proof_events where proof_id='87878787-8787-4787-8787-878787878787'),0::bigint,'null destination denial has no event');
select is((select count(*) from public.payment_proof_outbox where proof_id='87878787-8787-4787-8787-878787878787'),0::bigint,'null destination denial has no outbox');
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','71717171-7171-4171-8171-717171717171',false);
do $$ begin
  perform public.restore_payment_proof('88888888-8888-4888-8888-888888888888','mismatched destination must reject');
  raise exception 'mismatched destination restore unexpectedly succeeded';
exception when sqlstate '23514' then null; end $$;
reset role; set role postgres;
select is((select status from public.payment_proofs where id='88888888-8888-4888-8888-888888888888'),'quarantined','mismatched destination denial preserves proof state');
select is((select count(*) from public.payment_proof_events where proof_id='88888888-8888-4888-8888-888888888888'),0::bigint,'mismatched destination denial has no event');
select is((select count(*) from public.payment_proof_outbox where proof_id='88888888-8888-4888-8888-888888888888'),0::bigint,'mismatched destination denial has no outbox');
reset role; set role authenticated;

select set_config('request.jwt.claim.sub','71717171-7171-4171-8171-717171717171',false);
select ok(public.restore_payment_proof('81818181-8181-4181-8181-818181818181','authorized restore'),'active admin restores proof');
reset role; set role postgres;
select is((select status from public.payment_proofs where id='81818181-8181-4181-8181-818181818181'),'review','restore result is review');
select is((select purge_after from public.payment_proofs where id='81818181-8181-4181-8181-818181818181'),null::timestamptz,'restore clears retention deadline');
select is((select quarantined_at from public.payment_proofs where id='81818181-8181-4181-8181-818181818181'),null::timestamptz,'restore clears quarantine timestamp');
select is((select conversation_id from public.payment_proof_outbox where proof_id='81818181-8181-4181-8181-818181818181' and event_type='payment_proof_restored'),'76767676-7676-4676-8676-767676767676'::uuid,'restore outbox targets deterministic conversation');
select is((select payload->>'message_key' from public.payment_proof_outbox where proof_id='81818181-8181-4181-8181-818181818181' and event_type='payment_proof_restored'),'payment_proof_restored_under_review','restore outbox keeps correction key');
select is((select actor_role::text from public.payment_proof_events where proof_id='81818181-8181-4181-8181-818181818181' and event_type='restored'),'admin','restored event snapshots admin role');
update public.perfis set funcao='vendedor' where id='71717171-7171-4171-8171-717171717171';
select is((select actor_role::text from public.payment_proof_events where proof_id='81818181-8181-4181-8181-818181818181' and event_type='restored'),'admin','restored event remains admin after profile mutation');
-- Re-establish the test actor so subsequent assertions exercise state guards, not role denial.
update public.perfis set funcao='admin' where id='71717171-7171-4171-8171-717171717171';
select is((select count(*) from public.payment_proof_events where proof_id='81818181-8181-4181-8181-818181818181' and event_type='restored'),1::bigint,'exactly one restored event');
select is((select count(*) from public.payment_proof_outbox where proof_id='81818181-8181-4181-8181-818181818181' and event_type='payment_proof_restored'),1::bigint,'exactly one restored outbox');
reset role; set role authenticated;

select set_config('request.jwt.claim.sub','71717171-7171-4171-8171-717171717171',false);
do $$ begin
  perform public.restore_payment_proof('81818181-8181-4181-8181-818181818181','repeat must reject');
  raise exception 'repeat restore unexpectedly succeeded';
exception when sqlstate '23514' then null; end $$;
reset role; set role postgres;
select is((select status from public.payment_proofs where id='81818181-8181-4181-8181-818181818181'),'review','repeat restore preserves review state');
select is((select count(*) from public.payment_proof_events where proof_id='81818181-8181-4181-8181-818181818181' and event_type='restored'),1::bigint,'repeat restore does not append event');
select is((select count(*) from public.payment_proof_outbox where proof_id='81818181-8181-4181-8181-818181818181' and event_type='payment_proof_restored'),1::bigint,'repeat restore does not append outbox');
reset role; set role authenticated;

-- Expired and genuinely in-progress purging states are rejected without mutation.
do $$ begin
  perform public.restore_payment_proof('85858585-8585-4585-8585-858585858585','expired');
  raise exception 'expired restore unexpectedly succeeded';
exception when sqlstate '23514' then null; end $$;
do $$ begin
  perform public.restore_payment_proof('86868686-8686-4686-8686-868686868686','purging');
  raise exception 'purging restore unexpectedly succeeded';
exception when sqlstate '23514' then null; end $$;
reset role; set role postgres;
select is((select status from public.payment_proofs where id='85858585-8585-4585-8585-858585858585'),'quarantined','expired denial preserves state');
select is((select status from public.payment_proofs where id='86868686-8686-4686-8686-868686868686'),'purging','purging denial preserves in-progress state');

select * from finish();
rollback;
