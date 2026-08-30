select plan(1);
set role postgres;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
 ('26262626-2626-4262-8262-262626262601','00000000-0000-0000-0000-000000000000','authenticated','authenticated','proof-a@test',now(),now()),
 ('26262626-2626-4262-8262-262626262602','00000000-0000-0000-0000-000000000000','authenticated','authenticated','proof-b@test',now(),now()),
 ('26262626-2626-4262-8262-262626262603','00000000-0000-0000-0000-000000000000','authenticated','authenticated','proof-seller@test',now(),now()) on conflict(id) do nothing;
insert into public.perfis(id,nome,funcao,ativo) values
 ('26262626-2626-4262-8262-262626262601','A','cliente',true),
 ('26262626-2626-4262-8262-262626262602','B','cliente',true),
 ('26262626-2626-4262-8262-262626262603','Seller','vendedor',true)
on conflict(id) do update set funcao=excluded.funcao,ativo=excluded.ativo;
delete from public.payment_proof_events where proof_id='26262626-2626-4262-8262-262626262611';
delete from public.payment_proofs where id='26262626-2626-4262-8262-262626262611';
delete from public.clientes where id in ('26262626-2626-4262-8262-262626262621','26262626-2626-4262-8262-262626262622');
insert into public.clientes(id,usuario_id,nome,telefone) values
 ('26262626-2626-4262-8262-262626262621','26262626-2626-4262-8262-262626262601','A','5541999999961'),
 ('26262626-2626-4262-8262-262626262622','26262626-2626-4262-8262-262626262602','B','5541999999962');
insert into public.payment_proofs(id,customer_id,channel,delivery_key,status,original_storage_key,size_bytes)
values('26262626-2626-4262-8262-262626262611','26262626-2626-4262-8262-262626262621','web','delivery-a','admitted','proofs/a.pdf',100);
insert into public.payment_proof_events(proof_id,event_type,source,result_status)
values('26262626-2626-4262-8262-262626262611','created','web','admitted');
reset role;

do $$ declare n integer; begin
 set local role authenticated;
 perform set_config('request.jwt.claim.sub','26262626-2626-4262-8262-262626262602',true);
 select count(*) into n from public.payment_proofs;
 if n<>0 then raise exception 'cross-client proof leaked'; end if;
 perform set_config('request.jwt.claim.sub','26262626-2626-4262-8262-262626262603',true);
 select count(*) into n from public.payment_proofs where id='26262626-2626-4262-8262-262626262611';
 if n<>1 then raise exception 'seller could not read admitted proof metadata'; end if;
 begin
  insert into public.payment_proofs(customer_id,channel,delivery_key,original_storage_key,size_bytes)
  values('26262626-2626-4262-8262-262626262621','web','forged','forged.pdf',1);
  raise exception 'direct payment proof write unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set role postgres;
do $$ begin
 begin
  update public.payment_proof_events set reason='tamper' where proof_id='26262626-2626-4262-8262-262626262611';
  raise exception 'immutable event mutation succeeded';
 exception when insufficient_privilege then
  if sqlerrm<>'PAYMENT_PROOF_EVENT_IMMUTABLE' then raise; end if;
 end;
end $$;
reset role;
select pass('payment proof foundation enforces cross-client and staff RLS, direct-write denial, and immutable audit');
select * from finish();
