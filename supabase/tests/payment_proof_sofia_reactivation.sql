select to_regprocedure('public.reactivate_sofia_after_terminal_payment_proof(uuid)') is null as needs_sofia_reactivation \gset
\if :needs_sofia_reactivation
\ir ../migrations/20260908180000_payment_proof_sofia_reactivation.sql
\endif

begin;
select plan(5);

insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
  ('f6000000-0000-4000-8000-000000000030','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sofia-reactivation@test',now(),now())
on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
  ('f6000000-0000-4000-8000-000000000030','Sofia reactivation reviewer','supervisor',true)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;

insert into public.clientes(id,nome,telefone) values
  ('f6000000-0000-4000-8000-000000000001','Terminal customer','5541999000001'),
  ('f6000000-0000-4000-8000-000000000002','Manual customer','5541999000002'),
  ('f6000000-0000-4000-8000-000000000003','Cooldown customer','5541999000003'),
  ('f6000000-0000-4000-8000-000000000004','Review customer','5541999000004')
on conflict do nothing;

insert into public.conversas(id,cliente_id,status,ia_ativa) values
  ('f6000000-0000-4000-8000-000000000011','f6000000-0000-4000-8000-000000000001','aberta',false),
  ('f6000000-0000-4000-8000-000000000012','f6000000-0000-4000-8000-000000000002','aberta',false),
  ('f6000000-0000-4000-8000-000000000013','f6000000-0000-4000-8000-000000000003','aberta',false),
  ('f6000000-0000-4000-8000-000000000014','f6000000-0000-4000-8000-000000000004','aberta',false)
on conflict do nothing;

insert into public.payment_proofs(id,customer_id,channel,delivery_key,status,original_storage_key,size_bytes,confirmed_cents) values
  ('f6000000-0000-4000-8000-000000000021','f6000000-0000-4000-8000-000000000001','web','sofia-terminal-reconciled','admitted','proofs/private/terminal.pdf',10,100),
  ('f6000000-0000-4000-8000-000000000022','f6000000-0000-4000-8000-000000000002','web','sofia-terminal-manual','quarantined','proofs/private/manual.pdf',10,100),
  ('f6000000-0000-4000-8000-000000000023','f6000000-0000-4000-8000-000000000003','web','sofia-terminal-cooldown','quarantined','proofs/private/cooldown.pdf',10,100),
  ('f6000000-0000-4000-8000-000000000024','f6000000-0000-4000-8000-000000000004','web','sofia-nonterminal-review','review','proofs/private/review.pdf',10,100)
on conflict do nothing;

select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000030',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.whatsapp_sofia_states(cliente_id,canal,sofia_dormindo,motivo,origem,silenciada_ate) values
  ('f6000000-0000-4000-8000-000000000001','whatsapp',true,'handoff_phrase','operator',null),
  ('f6000000-0000-4000-8000-000000000002','whatsapp',true,'manual','operator',null),
  ('f6000000-0000-4000-8000-000000000003','whatsapp',true,'cooldown_operador','operator',now()+interval '1 hour'),
  ('f6000000-0000-4000-8000-000000000004','whatsapp',true,'handoff_phrase','operator',null)
on conflict(cliente_id,canal) do update set sofia_dormindo=excluded.sofia_dormindo,motivo=excluded.motivo,origem=excluded.origem,silenciada_ate=excluded.silenciada_ate;

insert into public.payment_proof_reconciliations(proof_id,actor_id,idempotency_key,confirmed_cents,actor_role,request_fingerprint)
values ('f6000000-0000-4000-8000-000000000021','f6000000-0000-4000-8000-000000000030','f6000000-0000-4000-8000-000000000031',100,'supervisor','terminal-reconciliation');
select ok(
  (select not sofia_dormindo and motivo is null from public.whatsapp_sofia_states where cliente_id='f6000000-0000-4000-8000-000000000001')
  and (select ia_ativa from public.conversas where id='f6000000-0000-4000-8000-000000000011'),
  'canonical reconciliation atomically reactivates Sofia and open conversations'
);

insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason)
values ('f6000000-0000-4000-8000-000000000022','operator_reviewed','operator','review','quarantined','reject');
select ok((select sofia_dormindo and motivo='manual' from public.whatsapp_sofia_states where cliente_id='f6000000-0000-4000-8000-000000000002'),'terminal rejection preserves a manual Sofia pause');

insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason)
values ('f6000000-0000-4000-8000-000000000023','operator_reviewed','operator','review','quarantined','reject');
select ok(
  (select sofia_dormindo and motivo='cooldown_operador' and silenciada_ate>now() from public.whatsapp_sofia_states where cliente_id='f6000000-0000-4000-8000-000000000003')
  and not (select ia_ativa from public.conversas where id='f6000000-0000-4000-8000-000000000013'),
  'terminal rejection preserves an active operator cooldown'
);

insert into public.payment_proof_events(proof_id,event_type,source,previous_status,result_status,reason)
values ('f6000000-0000-4000-8000-000000000024','operator_reviewed','operator','review','review','identify');
select ok((select sofia_dormindo from public.whatsapp_sofia_states where cliente_id='f6000000-0000-4000-8000-000000000004'),'nonterminal review leaves Sofia asleep');
select ok(not exists(select 1 from pg_proc where oid='public.reactivate_sofia_after_terminal_payment_proof(uuid)'::regprocedure and has_function_privilege('authenticated',oid,'EXECUTE')),'Sofia reactivation helper is not an authenticated financial authority');

select * from finish();
rollback;
