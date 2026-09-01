-- Repair malformed local fixtures that make GoTrue Admin user listing fail.
update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  recovery_token = coalesce(recovery_token, '')
where
  confirmation_token is null
  or email_change is null
  or email_change_token_new is null
  or recovery_token is null;

-- Remove the single known residue from the old non-transactional pgTAP run.
-- Scope it to the exact fixture identity so no real customer proof is touched.
do $$
declare
  fixture_proof_id uuid;
begin
  select id
  into fixture_proof_id
  from public.payment_proofs
  where delivery_key = 'admin-flow'
    and customer_id = '31313131-3131-4131-8131-313131313121'::uuid
    and original_storage_key = 'proofs/private/admin.pdf'
  limit 1;

  if fixture_proof_id is null then
    return;
  end if;

  perform set_config('app.total_user_purge', 'on', true);
  delete from public.payment_proof_legacy_backfills
  where canonical_payment_proof_id = fixture_proof_id
     or duplicate_payment_proof_id = fixture_proof_id;
  update public.payment_proof_hash_tombstones
  set canonical_proof_id = null
  where canonical_proof_id = fixture_proof_id;
  delete from public.payment_proof_outbox where proof_id = fixture_proof_id;
  delete from public.payment_proof_advisory_attempts where proof_id = fixture_proof_id;
  delete from public.payment_proof_render_attempts where proof_id = fixture_proof_id;
  delete from public.payment_proof_order_links where proof_id = fixture_proof_id;
  delete from public.payment_proof_reconciliations where proof_id = fixture_proof_id;
  delete from public.payment_proof_chat_projections where proof_id = fixture_proof_id;
  delete from public.mensagens where payment_proof_id = fixture_proof_id;
  delete from public.payment_proof_events where proof_id = fixture_proof_id;
  delete from public.payment_proofs where id = fixture_proof_id;
end
$$;
