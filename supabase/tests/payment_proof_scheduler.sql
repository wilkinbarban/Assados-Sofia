select plan(1);set role postgres;
delete from public.payment_proof_hash_tombstones
where canonical_proof_id='55555555-5555-4555-8555-555555555501'
   or sha256=repeat('b',64);
delete from public.payment_proofs where id='55555555-5555-4555-8555-555555555501';
update public.payment_proof_outbox
set status='completed',completed_at=coalesce(completed_at,now()),claimed_until=null
where status in('pending','claimed') and next_attempt_at<=now();
insert into public.payment_proofs(id,channel,delivery_key,status,original_storage_key,size_bytes,quarantined_at,purge_after,sha256)values('55555555-5555-4555-8555-555555555501','web','purge','quarantined','private/a.pdf',10,now()-interval'11 days',now()-interval'1 day',repeat('b',64));
insert into public.payment_proof_hash_tombstones values(repeat('b',64),'55555555-5555-4555-8555-555555555501',now());reset role;
set role service_role;select set_config('request.jwt.claims','{"role":"service_role"}',false);
do $$declare j jsonb;begin select public.claim_payment_proof_maintenance(60)into j;if j->>'kind'<>'purge' then raise exception 'not purge';end if;perform public.complete_payment_proof_maintenance('purge',j->>'id',true,null);if not exists(select 1 from public.payment_proof_hash_tombstones where sha256=repeat('b',64)) then raise exception 'tombstone lost';end if;end$$;reset role;select pass('expired quarantine purges while tombstone remains');select * from finish();
