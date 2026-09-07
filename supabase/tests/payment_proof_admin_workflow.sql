select to_regprocedure('public.require_active_payment_proof_financial_authority()') is null as needs_financial_authority \gset
\if :needs_financial_authority
\ir ../migrations/20260903170000_payment_proof_financial_authority.sql
\endif
select to_regprocedure('public.complete_payment_proof_outbox_delivery(bigint,text,text,text,text)') is null as needs_delivery_provenance \gset
\if :needs_delivery_provenance
\ir ../migrations/20260903190000_payment_proof_immutable_delivery_provenance.sql
\endif
begin;select plan(2);set role postgres;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values('31313131-3131-4131-8131-313131313101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','review@test',now(),now(),'','','','') on conflict(id) do update set confirmation_token='',email_change='',email_change_token_new='',recovery_token='';
insert into public.perfis(id,nome,funcao,ativo) values('31313131-3131-4131-8131-313131313101','Reviewer','supervisor',true) on conflict(id) do update set funcao='supervisor',ativo=true;
insert into public.clientes(id,nome,telefone) values('31313131-3131-4131-8131-313131313121','PIX customer','5541999999984') on conflict do nothing;
insert into public.conversas(id,cliente_id,status,ia_ativa) values('31313131-3131-4131-8131-313131313141','31313131-3131-4131-8131-313131313121','aberta',false) on conflict do nothing;
insert into public.pedidos(id,cliente_id,status,status_pagamento,tipo_entrega,meio_pagamento,total_produtos_centavos,taxa_entrega_centavos,total_pedido_centavos) values
('31313131-3131-4131-8131-313131313161','31313131-3131-4131-8131-313131313121','confirmado','pendente','retirada','pix',4200,0,4200),
('31313131-3131-4131-8131-313131313162','31313131-3131-4131-8131-313131313121','confirmado','pendente','retirada','pix',4200,0,4200) on conflict do nothing;reset role;
set role service_role;select set_config('request.jwt.claim.sub','',false);select set_config('request.jwt.claim','{"role":"service_role"}',false);
select * from public.admit_payment_proof_intake('web','admin-flow-v2','31313131-3131-4131-8131-313131313121',null,'proofs/private/admin-v2.pdf',100,'application/pdf','31313131-3131-4131-8131-313131313161','31313131-3131-4131-8131-313131313141',repeat('9',64));
update public.payment_proofs set status='review' where delivery_key='admin-flow-v2';reset role;
set role authenticated;select set_config('request.jwt.claim.sub','31313131-3131-4131-8131-313131313101',false);
do $$declare p uuid;lease text;begin select id into p from public.payment_proofs where delivery_key='admin-flow-v2';
 select lease_token into lease from public.acquire_payment_proof_lease(p);
 perform public.confirm_payment_proof_amount(p,4200,lease);
 if (select status from public.payment_proofs where id=p)<>'admitted' then raise exception 'amount confirmation did not admit';end if;
 if (select count(*) from public.payment_proof_events where proof_id=p and event_type='amount_confirmed')<>1 then raise exception 'amount confirmation audit missing';end if;end $$;reset role;
select pass('authorized amount confirmation admits with append-only audit');
set role service_role;select set_config('request.jwt.claim.sub','',false);select set_config('request.jwt.claim','{"role":"service_role"}',false);
select * from public.admit_payment_proof_intake('web','admin-reject-flow-v2','31313131-3131-4131-8131-313131313121',null,'proofs/private/admin-reject-v2.pdf',100,'application/pdf','31313131-3131-4131-8131-313131313162','31313131-3131-4131-8131-313131313141',repeat('a',64));reset role;
set role authenticated;select set_config('request.jwt.claim.sub','31313131-3131-4131-8131-313131313101',false);
do $$declare p uuid;lease text;begin select id into p from public.payment_proofs where delivery_key='admin-reject-flow-v2';
 select lease_token into lease from public.acquire_payment_proof_lease(p);
 perform public.manage_payment_proof_review(p,'reject',null,lease);
 if (select status from public.payment_proofs where id=p)<>'quarantined' then raise exception 'review did not quarantine';end if;
 if (select purge_after from public.payment_proofs where id=p) is null then raise exception 'quarantine deadline missing';end if;
 if (select count(*) from public.payment_proof_events where proof_id=p and event_type='operator_reviewed' and actor_id='31313131-3131-4131-8131-313131313101')<>1 then raise exception 'operator rejection audit missing';end if;
end $$;reset role;
select pass('authorized reviewer rejects directly into audited quarantine');
select * from finish();rollback;
