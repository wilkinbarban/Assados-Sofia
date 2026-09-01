
select plan(1);

set role postgres;
insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
values ('28282828-2828-4282-8282-282828282801', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proof-admin@test', now(), now())
on conflict (id) do nothing;
insert into public.perfis(id, nome, funcao, ativo)
values ('28282828-2828-4282-8282-282828282801', 'Proof admin', 'admin', true)
on conflict (id) do update set funcao = excluded.funcao, ativo = excluded.ativo;
insert into public.clientes(id, nome, telefone)
values ('28282828-2828-4282-8282-282828282821', 'Lifecycle customer', '5541999999981')
on conflict (id) do nothing;
reset role;

set role service_role;
select set_config('request.jwt.claim', '{"role":"service_role"}', false);
do $$
declare
  canonical record;
  duplicate_intake record;
  duplicate_hash record;
  deadline timestamptz;
  queued integer;
begin
  select * into canonical from public.admit_payment_proof_intake(
    'web', 'lifecycle-canonical', '28282828-2828-4282-8282-282828282821', null,
    'proofs/private/lifecycle-canonical.pdf', 100, 'application/pdf'
  );
  select * into duplicate_intake from public.admit_payment_proof_intake(
    'telegram', 'lifecycle-duplicate', '28282828-2828-4282-8282-282828282821', null,
    'proofs/private/lifecycle-duplicate.pdf', 100, 'application/pdf'
  );
  perform * from public.register_payment_proof_hash(canonical.proof_id, repeat('a', 64));
  select * into duplicate_hash from public.register_payment_proof_hash(duplicate_intake.proof_id, repeat('a', 64));
  if duplicate_hash.canonical_proof_id <> canonical.proof_id or not duplicate_hash.duplicate then
    raise exception 'global hash claim did not select one canonical proof';
  end if;
  select count(*) into queued from public.payment_proof_outbox
    where proof_id = duplicate_intake.proof_id and event_type = 'payment_proof_duplicate';
  if queued <> 1 then raise exception 'duplicate notification was not idempotently queued'; end if;
  select public.quarantine_payment_proof(canonical.proof_id, 'invalid proof') into deadline;
  if deadline <= now() + interval '9 days' or deadline > now() + interval '10 days 1 minute' then
    raise exception 'quarantine deadline is not server-owned ten days';
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '28282828-2828-4282-8282-282828282899', false);
do $$
begin
  begin
    perform public.restore_payment_proof(
      (select id from public.payment_proofs where channel = 'web' and delivery_key = 'lifecycle-canonical'),
      'unauthorized correction'
    );
    raise exception 'non-admin restore unexpectedly succeeded';
  exception when insufficient_privilege then
    if sqlerrm <> 'PAYMENT_PROOF_ADMIN_REQUIRED' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', '28282828-2828-4282-8282-282828282801', false);
do $$
declare
  restored boolean;
  proof_status text;
  queued integer;
begin
  select public.restore_payment_proof(id, 'admin correction') into restored
  from public.payment_proofs where channel = 'web' and delivery_key = 'lifecycle-canonical';
  if not restored then raise exception 'admin restore did not succeed'; end if;
  select status into proof_status from public.payment_proofs where channel = 'web' and delivery_key = 'lifecycle-canonical';
  if proof_status <> 'review' then raise exception 'restored proof did not return to review'; end if;
  select count(*) into queued from public.payment_proof_outbox
    where proof_id = (select id from public.payment_proofs where channel = 'web' and delivery_key = 'lifecycle-canonical')
      and event_type = 'payment_proof_restored';
  if queued <> 1 then raise exception 'restore correction notice was not queued once'; end if;
end $$;
reset role;

select pass('payment proof lifecycle atomically deduplicates, quarantines, and restores with idempotent outbox notices');
select * from finish();
