select plan(1);
set role postgres;
insert into public.clientes(id,nome,telefone) values('27272727-2727-4272-8272-272727272721','Intake','5541999999971') on conflict(id) do nothing;
reset role; set role service_role; select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$ declare a record;b record;n integer; begin
 select * into a from public.admit_payment_proof_intake('web','delivery-1','27272727-2727-4272-8272-272727272721',null,'proofs/private/a.pdf',100,'application/pdf');
 select * into b from public.admit_payment_proof_intake('web','delivery-1','27272727-2727-4272-8272-272727272721',null,'proofs/private/a.pdf',100,'application/pdf');
 if a.status<>'received' or a.idempotent or not b.idempotent or a.proof_id<>b.proof_id then raise exception 'delivery replay was not idempotent'; end if;
 select * into a from public.admit_payment_proof_intake('telegram','delivery-1',null,'999','proofs/private/b.pdf',100,'application/pdf');
 if a.status<>'identity_pending' then raise exception 'unknown sender was not pending identity'; end if;
 select count(*) into n from public.payment_proofs where status='identity_pending' and status='admitted';
 if n<>0 then raise exception 'unknown proof became chat-visible'; end if;
end $$;
reset role;
select pass('intake authority proves replay, cross-channel identity, unknown invisibility');
select * from finish();
