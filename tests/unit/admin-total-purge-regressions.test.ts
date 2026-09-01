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

  it('deletes every later RESTRICT payment-proof dependent before its proof in both purge paths', () => {
    const migration = read(
      'supabase/migrations/20260828330000_total_purge_payment_proof_dependents.sql',
    )
    const dependents = [
      'public.payment_proof_order_intents',
      'private.payment_proof_operational_failures',
      'private.payment_proof_processing_queue',
    ]

    for (const functionName of [
      'public.executar_sql_purga_total_usuario_admin',
      'public.executar_purga_residual_cliente_admin',
    ]) {
      const start = migration.indexOf(`function ${functionName}`)
      const body = migration.slice(start, migration.indexOf('$$;', start))
      const proofDeletion = body.indexOf('delete from public.payment_proofs')

      expect(start).toBeGreaterThanOrEqual(0)
      expect(proofDeletion).toBeGreaterThanOrEqual(0)
      for (const dependent of dependents) {
        const deletion = body.indexOf(`delete from ${dependent}`)
        expect(deletion).toBeGreaterThanOrEqual(0)
        expect(deletion).toBeLessThan(proofDeletion)
      }
    }

    expect(read('supabase/migrations/20260828230000_payment_proof_order_lock.sql')).toContain(
      'on delete restrict',
    )
    expect(read('supabase/migrations/20260828300000_payment_proof_operational_metrics.sql')).toContain(
      'on delete restrict',
    )
    expect(read('supabase/migrations/20260828320000_payment_proof_processing_queue.sql')).toContain(
      'on delete restrict',
    )
  })
})
