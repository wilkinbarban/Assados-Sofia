begin;
\ir ../migrations/20260828340000_payment_proof_operator_leases.sql
\ir ../migrations/20260828360000_payment_proof_leased_amount_confirmation.sql
select plan(34);
set role postgres;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
 ('63636363-6363-4363-8363-636363636301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','amount-admin@test',now(),now()),
 ('63636363-6363-4363-8363-636363636302','00000000-0000-0000-0000-000000000000','authenticated','authenticated','amount-supervisor@test',now(),now()),
 ('63636363-6363-4363-8363-636363636303','00000000-0000-0000-0000-000000000000','authenticated','authenticated','amount-seller@test',now(),now()),
 ('63636363-6363-4363-8363-636363636304','00000000-0000-0000-0000-000000000000','authenticated','authenticated','amount-inactive@test',now(),now()),
 ('63636363-6363-4363-8363-636363636305','00000000-0000-0000-0000-000000000000','authenticated','authenticated','amount-client@test',now(),now())
on conflict do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('63636363-6363-4363-8363-636363636301','Amount Admin','admin',true),
 ('63636363-6363-4363-8363-636363636302','Amount Supervisor','supervisor',true),
 ('63636363-6363-4363-8363-636363636303','Amount Seller','vendedor',true),
 ('63636363-6363-4363-8363-636363636304','Amount Inactive','vendedor',false)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;
insert into public.clientes(id,nome,telefone,usuario_id) values
 ('63636363-6363-4363-8363-636363636321','Amount Customer','5541999996321','63636363-6363-4363-8363-636363636305')
on conflict(id) do update set usuario_id=excluded.usuario_id;
insert into public.payment_proofs(id,customer_id,channel,delivery_key,status,original_storage_key,size_bytes) values
 ('63636363-6363-4363-8363-636363636341','63636363-6363-4363-8363-636363636321','web','amount-active','review','proofs/private/amount-active.pdf',100),
 ('63636363-6363-4363-8363-636363636342',null,'web','amount-no-customer','review','proofs/private/amount-no-customer.pdf',100),
 ('63636363-6363-4363-8363-636363636343','63636363-6363-4363-8363-636363636321','web','amount-terminal','quarantined','proofs/private/amount-terminal.pdf',100),
 ('63636363-6363-4363-8363-636363636344','63636363-6363-4363-8363-636363636321','web','amount-supervisor','review','proofs/private/amount-supervisor.pdf',100),
 ('63636363-6363-4363-8363-636363636345','63636363-6363-4363-8363-636363636321','web','amount-seller','review','proofs/private/amount-seller.pdf',100),
 ('63636363-6363-4363-8363-636363636346','63636363-6363-4363-8363-636363636321','web','amount-expired','review','proofs/private/amount-expired.pdf',100),
 ('63636363-6363-4363-8363-636363636347','63636363-6363-4363-8363-636363636321','web','amount-received','received','proofs/private/amount-received.pdf',100),
 ('63636363-6363-4363-8363-636363636348','63636363-6363-4363-8363-636363636321','web','amount-identity-pending','identity_pending','proofs/private/amount-identity-pending.pdf',100),
 ('63636363-6363-4363-8363-636363636349','63636363-6363-4363-8363-636363636321','web','amount-processing','processing','proofs/private/amount-processing.pdf',100),
 ('63636363-6363-4363-8363-636363636350','63636363-6363-4363-8363-636363636321','web','amount-duplicate','duplicate','proofs/private/amount-duplicate.pdf',100),
 ('63636363-6363-4363-8363-636363636351','63636363-6363-4363-8363-636363636321','web','amount-purged','purged','proofs/private/amount-purged.pdf',100)
on conflict do nothing;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','63636363-6363-4363-8363-636363636305',false);
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636341',4200,'nope')$$,'42501','PAYMENT_PROOF_OPERATOR_REQUIRED','cliente cannot confirm amount');
select set_config('request.jwt.claim.sub','63636363-6363-4363-8363-636363636304',false);
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636341',4200,'nope')$$,'42501','PAYMENT_PROOF_OPERATOR_REQUIRED','inactive seller cannot confirm amount');

create temporary table amount_tokens(actor_id uuid,token text); grant all on amount_tokens to authenticated;
select set_config('request.jwt.claim.sub','63636363-6363-4363-8363-636363636301',false);
insert into amount_tokens select '63636363-6363-4363-8363-636363636301',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636341');
select lives_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636341',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'admin confirms an eligible proof');
select is((select status from public.payment_proofs where id='63636363-6363-4363-8363-636363636341'),'admitted','confirmation admits proof');
select is((select confirmed_cents from public.payment_proofs where id='63636363-6363-4363-8363-636363636341'),4200,'confirmation stores exact positive cents');
select is((select actor_id from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636341' and event_type='amount_confirmed'),'63636363-6363-4363-8363-636363636301'::uuid,'audit preserves actor');
select is((select actor_role from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636341' and event_type='amount_confirmed'),'admin'::public.tipo_funcao,'audit preserves locked role');
select is((select previous_status from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636341' and event_type='amount_confirmed'),'review','audit preserves previous status');
select is((select result_status from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636341' and event_type='amount_confirmed'),'admitted','audit preserves result status');
select is((select (metadata->>'confirmed_cents')::integer from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636341' and event_type='amount_confirmed'),4200,'audit preserves amount metadata');
select lives_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636341',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'same admitted amount is a no-op');
select is((select count(*)::integer from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636341' and event_type='amount_confirmed'),1,'no-op has no duplicate event');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636341',4201,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'23505','PAYMENT_PROOF_AMOUNT_CONFLICT','different admitted amount conflicts');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636342',4200,'missing')$$,'42501','PAYMENT_PROOF_LEASE_NOT_OWNED','wrong lease leaves customerless proof unchanged');

select set_config('request.jwt.claim.sub','63636363-6363-4363-8363-636363636302',false);
insert into amount_tokens select '63636363-6363-4363-8363-636363636302',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636342');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636342',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636302' order by ctid desc limit 1))$$,'23514','PAYMENT_PROOF_CUSTOMER_REQUIRED','missing customer is denied');
insert into amount_tokens select '63636363-6363-4363-8363-636363636302',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636344');
select lives_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636344',4300,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636302' order by ctid desc limit 1))$$,'supervisor confirms an eligible proof');
select is((select actor_role from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636344' and event_type='amount_confirmed'),'supervisor'::public.tipo_funcao,'supervisor role snapshot is immutable');
select set_config('request.jwt.claim.sub','63636363-6363-4363-8363-636363636303',false);
insert into amount_tokens select '63636363-6363-4363-8363-636363636303',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636345');
select lives_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636345',4400,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636303'))$$,'seller confirms an eligible proof');
select is((select actor_role from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636345' and event_type='amount_confirmed'),'vendedor'::public.tipo_funcao,'seller role snapshot is immutable');
select set_config('request.jwt.claim.sub','63636363-6363-4363-8363-636363636302',false);
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636344',0,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636302' order by ctid desc limit 1))$$,'22023','PAYMENT_PROOF_AMOUNT_REQUIRED','zero amount is denied');
select set_config('request.jwt.claim.sub','63636363-6363-4363-8363-636363636301',false);
insert into amount_tokens select '63636363-6363-4363-8363-636363636301',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636343');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636343',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'23514','PAYMENT_PROOF_CONFIRMATION_INVALID_STATE','quarantined proof is denied');
select is((select confirmed_cents from public.payment_proofs where id='63636363-6363-4363-8363-636363636343'),null::integer,'quarantined proof remains unchanged');
insert into amount_tokens select '63636363-6363-4363-8363-636363636301',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636347');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636347',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'23514','PAYMENT_PROOF_CONFIRMATION_INVALID_STATE','received proof is denied');
select is((select status from public.payment_proofs where id='63636363-6363-4363-8363-636363636347'),'received','received proof remains unchanged');
insert into amount_tokens select '63636363-6363-4363-8363-636363636301',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636348');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636348',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'23514','PAYMENT_PROOF_CONFIRMATION_INVALID_STATE','identity-pending proof is denied');
select is((select status from public.payment_proofs where id='63636363-6363-4363-8363-636363636348'),'identity_pending','identity-pending proof remains unchanged');
insert into amount_tokens select '63636363-6363-4363-8363-636363636301',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636349');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636349',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'23514','PAYMENT_PROOF_CONFIRMATION_INVALID_STATE','processing proof is denied');
select is((select status from public.payment_proofs where id='63636363-6363-4363-8363-636363636349'),'processing','processing proof remains unchanged');
insert into amount_tokens select '63636363-6363-4363-8363-636363636301',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636350');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636350',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'23514','PAYMENT_PROOF_CONFIRMATION_INVALID_STATE','duplicate proof is denied');
select is((select status from public.payment_proofs where id='63636363-6363-4363-8363-636363636350'),'duplicate','duplicate proof remains unchanged');
insert into amount_tokens select '63636363-6363-4363-8363-636363636301',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636351');
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636351',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'23514','PAYMENT_PROOF_CONFIRMATION_INVALID_STATE','purged proof is denied');
select is((select status from public.payment_proofs where id='63636363-6363-4363-8363-636363636351'),'purged','purged proof remains unchanged');
insert into amount_tokens select '63636363-6363-4363-8363-636363636301',lease_token from public.acquire_payment_proof_lease('63636363-6363-4363-8363-636363636346');
set role postgres;update public.payment_proof_leases set acquired_at=now()-interval '10 minutes',expires_at=now()-interval '1 second' where proof_id='63636363-6363-4363-8363-636363636346';reset role;set role authenticated;
select set_config('request.jwt.claim.sub','63636363-6363-4363-8363-636363636301',false);
select throws_ok($$select public.confirm_payment_proof_amount('63636363-6363-4363-8363-636363636346',4200,(select token from amount_tokens where actor_id='63636363-6363-4363-8363-636363636301' order by ctid desc limit 1))$$,'42501','PAYMENT_PROOF_LEASE_EXPIRED','expired lease is denied');
select is((select count(*)::integer from public.payment_proof_events where proof_id='63636363-6363-4363-8363-636363636346'),0,'expired lease leaves events unchanged');
reset role;
select * from finish();
rollback;
