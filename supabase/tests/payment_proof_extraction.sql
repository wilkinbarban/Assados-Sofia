
select plan(1);
set role postgres;
insert into public.clientes(id,nome,telefone) values
('29292929-2929-4292-8292-292929292921','Extraction customer','5541999999982') on conflict do nothing;
reset role;
set role service_role;
select set_config('request.jwt.claim','{"role":"service_role"}',false);
do $$
declare p record; first_event bigint; replay_event bigint;
begin
 select * into p from public.admit_payment_proof_intake(
  'web','extract-one','29292929-2929-4292-8292-292929292921',null,
  'proofs/private/extract-one.pdf',100,'application/pdf');
 select public.record_payment_proof_advisory(
  p.proof_id,'attempt-one','accepted',true,0.91,4200,'payment_markers_present','test/model'
 ) into first_event;
 select public.record_payment_proof_advisory(
  p.proof_id,'attempt-one','accepted',true,0.91,4200,'payment_markers_present','test/model'
 ) into replay_event;
 if first_event<>replay_event then raise exception 'advisory replay was not idempotent';end if;
 if (select count(*) from public.payment_proof_events where proof_id=p.proof_id and event_type='advisory_extracted')<>1
 then raise exception 'advisory audit was not append-once';end if;
 if (select status from public.payment_proofs where id=p.proof_id)<>'review'
 then raise exception 'high confidence suggestion approved or admitted proof';end if;
 if (select confirmed_cents from public.payment_proofs where id=p.proof_id) is not null
 then raise exception 'advisory extraction confirmed payment amount';end if;
 begin
  perform public.record_payment_proof_advisory(
   p.proof_id,'attempt-one','rejected',false,0.99,null,'not_payment_proof','test/model');
  raise exception 'changed replay unexpectedly succeeded';
 exception when unique_violation then null; end;
end $$;
reset role;
select pass('advisory extraction is service-only, append-once, idempotent, and never approves payments');
select * from finish();
