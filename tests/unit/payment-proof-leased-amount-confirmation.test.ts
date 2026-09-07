import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260828360000_payment_proof_leased_amount_confirmation.sql',
  'utf8',
)

describe('leased payment-proof amount confirmation', () => {
  it('exposes only the authenticated leased confirmation boundary', () => {
    expect(migration).toContain('create function public.confirm_payment_proof_amount(')
    expect(migration).toContain('security definer set search_path=\'\'')
    expect(migration).toMatch(/grant execute on function public\.confirm_payment_proof_amount\(uuid,integer,text\) to authenticated/)
    expect(migration).toMatch(/revoke all on function public\.confirm_payment_proof_amount_authorized\(uuid,integer,public\.tipo_funcao\) from public,anon,authenticated/)
  })

  it('locks profile, lease, then proof and records an immutable role snapshot', () => {
    const wrapper = migration.indexOf('create function public.confirm_payment_proof_amount(')
    const role = migration.indexOf('require_active_payment_proof_actor_role()', wrapper)
    const lease = migration.indexOf('assert_payment_proof_lease(p_proof_id,p_lease_token)', wrapper)
    const internal = migration.indexOf('create function public.confirm_payment_proof_amount_authorized(')
    const proof = migration.indexOf('from public.payment_proofs where id=p_proof_id for update', internal)
    expect(role).toBeGreaterThan(wrapper)
    expect(lease).toBeGreaterThan(role)
    expect(proof).toBeGreaterThan(internal)
    expect(migration).toContain("'amount_confirmed'")
    expect(migration).toContain('actor_role,source,previous_status,result_status,metadata')
    expect(migration).toContain("jsonb_build_object('confirmed_cents',p_confirmed_cents)")
  })

  it('admits only customer-bound review proofs with exact idempotency', () => {
    expect(migration).toContain("if proof.status<>'review' then")
    expect(migration).not.toContain("proof.status not in ('received','identity_pending','processing','review')")
    expect(migration).toContain("PAYMENT_PROOF_CUSTOMER_REQUIRED")
    expect(migration).toContain("PAYMENT_PROOF_CONFIRMATION_INVALID_STATE")
    expect(migration).toContain("PAYMENT_PROOF_AMOUNT_REQUIRED")
    expect(migration).toContain("PAYMENT_PROOF_AMOUNT_CONFLICT")
    expect(migration).toMatch(/if proof\.status='admitted' then\s+if proof\.confirmed_cents=p_confirmed_cents then return false;end if/)
    expect(migration).toContain("set status='admitted',confirmed_cents=p_confirmed_cents,updated_at=now()")
  })

  it('ships a harness that imports the current financial authority boundary and rejects every non-review lifecycle state', () => {
    const harness = readFileSync('supabase/tests/payment_proof_leased_amount_confirmation.sql', 'utf8')
    expect(harness).toContain('\\ir ../migrations/20260903170000_payment_proof_financial_authority.sql')
    for (const status of ['received', 'identity_pending', 'processing', 'quarantined', 'duplicate', 'purged']) {
      expect(harness).toContain(`'${status}'`)
    }
    expect(harness).toContain('PAYMENT_PROOF_CONFIRMATION_INVALID_STATE')
  })
})
