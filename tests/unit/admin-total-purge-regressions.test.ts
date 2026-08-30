import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('admin total purge regressions', () => {
  it('does not revoke the active administrator session after password verification', () => {
    const source = read('apps/web/src/app/actions/admin.ts')
    const verifier = source.slice(
      source.indexOf('async function verifyCurrentAdminPassword'),
      source.indexOf('/** Performs the durable total-purge workflow.'),
    )

    expect(verifier).toContain('persistSession: false')
    expect(verifier).toContain('signInWithPassword')
    expect(verifier).not.toContain('signOut')
  })

  it('ships a forward cleanup for invalid Auth fixtures and the leaked admin-flow proof', () => {
    const migration = read('supabase/migrations/20260828210000_admin_purge_runtime_cleanup.sql')

    expect(migration).toContain("confirmation_token = coalesce(confirmation_token, '')")
    expect(migration).toContain("delivery_key = 'admin-flow'")
    expect(migration).toContain("'31313131-3131-4131-8131-313131313121'::uuid")
  })

  it('creates the payment-proof admin Auth fixture with non-null GoTrue tokens', () => {
    const harness = read('supabase/tests/payment_proof_admin_workflow.sql')

    expect(harness).toContain('confirmation_token,email_change,email_change_token_new,recovery_token')
    expect(harness).toMatch(/'review@test',now\(\),now\(\),'','','',''/)
    expect(harness.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
