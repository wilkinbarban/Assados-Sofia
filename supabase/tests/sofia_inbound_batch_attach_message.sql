create extension if not exists pgtap;
\ir ../migrations/20260910010000_sofia_humanized_timing.sql
begin;
select plan(18);

select ok(pg_catalog.to_regrole('service_role') is not null and pg_catalog.to_regrole('anon') is not null and pg_catalog.to_regrole('authenticated') is not null,'required function roles exist');
select ok(exists (select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) privilege where p.oid = 'public.attach_sofia_inbound_message(uuid,uuid,uuid,text)'::regprocedure and privilege.grantee = pg_catalog.to_regrole('service_role')::oid and privilege.privilege_type = 'EXECUTE'),'service role has direct attach EXECUTE');
select ok((select p.prosecdef and (select count(*) = 1 and bool_and(config in ('search_path=', 'search_path=""')) from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as config where config like 'search_path=%') from pg_catalog.pg_proc p where p.oid = 'public.attach_sofia_inbound_message(uuid,uuid,uuid,text)'::regprocedure),'attach remains security definer with a safe empty search path');
select ok(not exists (select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) privilege where p.oid = 'public.attach_sofia_inbound_message(uuid,uuid,uuid,text)'::regprocedure and privilege.grantee in (pg_catalog.to_regrole('anon')::oid, pg_catalog.to_regrole('authenticated')::oid) and privilege.privilege_type = 'EXECUTE'),'anon and authenticated have no direct attach EXECUTE');
select ok(not exists (select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) privilege where p.oid = 'public.attach_sofia_inbound_message(uuid,uuid,uuid,text)'::regprocedure and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'),'PUBLIC cannot attach messages');
insert into public.clientes(id,nome,telefone) values
 ('b1000000-0000-4000-8000-000000000001','Attach','5541991111201'),
 ('b1000000-0000-4000-8000-000000000002','Other','5541991111202');
insert into public.conversas(id,cliente_id) values
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002');
insert into public.mensagens(id,conversa_id,remetente,conteudo,telegram_mensagem_id,data_criacao) values
 ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','cliente','later','telegram:later','2030-01-01 10:00:02+00'),
 ('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','cliente','earlier','telegram:earlier','2030-01-01 10:00:01+00');
create temporary table attached(label text,batch_id uuid,duplicate boolean,scheduled_at timestamptz);
grant select,insert on attached to service_role;
set local role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',true);
insert into attached select 'first',* from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','telegram');
insert into attached select 'duplicate',* from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','telegram');
insert into attached select 'second',* from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','telegram');
reset role;
select is((select count(*)::integer from public.mensagens where conversa_id='b2000000-0000-4000-8000-000000000001'),2,'attach never inserts mensagens');
select is((select count(*)::integer from public.sofia_inbound_batches where conversa_id='b2000000-0000-4000-8000-000000000001'),1,'attachments share one pending conversation batch');
select is((select count(*)::integer from public.sofia_inbound_batch_messages bm join public.sofia_inbound_batches b on b.id=bm.batch_id where b.conversa_id='b2000000-0000-4000-8000-000000000001'),2,'duplicate attach creates no membership');
select ok((select duplicate from attached where label='duplicate'),'repeat attach reports duplicate');
select is((select array_agg(m.conteudo order by bm.message_created_at,bm.message_id) from public.sofia_inbound_batch_messages bm join public.sofia_inbound_batches b on b.id=bm.batch_id join public.mensagens m on m.id=bm.message_id where b.conversa_id='b2000000-0000-4000-8000-000000000001'),array['earlier','later']::text[],'chronology comes from stored message key');
select ok((select abs(extract(epoch from scheduled_process_at-latest_message_at)-10)<0.1 from public.sofia_inbound_batches where conversa_id='b2000000-0000-4000-8000-000000000001'),'database admission time owns ten-second scheduling');
update public.sofia_inbound_batches set first_message_at=clock_timestamp()-interval '19 seconds',latest_message_at=clock_timestamp()-interval '1 second',scheduled_process_at=clock_timestamp()+interval '0.5 seconds' where conversa_id='b2000000-0000-4000-8000-000000000001';
insert into public.mensagens(id,conversa_id,remetente,conteudo,telegram_mensagem_id) values ('b3000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001','cliente','cap','telegram:cap');
set local role service_role;
select * from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','telegram');
reset role;
select ok((select scheduled_process_at<=first_message_at+interval '20 seconds' from public.sofia_inbound_batches where conversa_id='b2000000-0000-4000-8000-000000000001'),'schedule respects twenty-second cap');
update public.sofia_inbound_batches set status='processing',lease_token=gen_random_uuid(),claimed_until=now()+interval '1 minute' where conversa_id='b2000000-0000-4000-8000-000000000001';
insert into public.mensagens(id,conversa_id,remetente,conteudo,whatsapp_mensagem_id) values ('b3000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000001','cliente','after claim','evo-after');
set local role service_role;
select * from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','whatsapp');
reset role;
select is((select count(*)::integer from public.sofia_inbound_batches where conversa_id='b2000000-0000-4000-8000-000000000001' and status='pending'),1,'post-claim arrival creates a new pending batch');
select is((select count(*)::integer from public.mensagens where conversa_id='b2000000-0000-4000-8000-000000000001'),4,'post-claim attach still inserts no message');
set local role service_role;
select throws_ok($$select * from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','telegram')$$,'22023','SOFIA_BATCH_ATTACH_BINDING_INVALID','conversation identity mismatch fails closed');
select throws_ok($$select * from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','whatsapp')$$,'22023','SOFIA_BATCH_ATTACH_CHANNEL_INVALID','channel identity mismatch fails closed');
select throws_ok($$select * from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','telegram')$$,'22023','SOFIA_BATCH_ATTACH_BINDING_INVALID','client identity mismatch fails closed');
reset role;
select set_config('request.jwt.claim','{"role":"authenticated"}',true);
select throws_ok($$select * from public.attach_sofia_inbound_message('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','telegram')$$,'42501','SOFIA_BATCH_SERVICE_ROLE_REQUIRED','authority check precedes input details');
select * from finish();
rollback;
