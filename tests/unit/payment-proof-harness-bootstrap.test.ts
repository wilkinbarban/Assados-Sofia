import { readFileSync, readdirSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { describe, expect, it } from 'vitest'

const testsDir = join(process.cwd(), 'supabase/tests')
const harnesses = [
  ...readdirSync(testsDir).filter((name) => name.startsWith('payment_proof_') && name.endsWith('.sql')),
  'manual_external_payment.sql',
  'admin_user_dual_deletion.sql',
]
const forwardMigrationImports = new Map([
  ['payment_proof_dead_letter_replay.sql', ['20260828340000_payment_proof_operator_leases.sql', '20260828380000_payment_proof_dead_letter_replay.sql']],
  ['payment_proof_leased_amount_confirmation.sql', ['20260828340000_payment_proof_operator_leases.sql', '20260828360000_payment_proof_leased_amount_confirmation.sql']],
  ['payment_proof_observability_replay.sql', ['20260828370000_payment_proof_unresolved_diagnostics.sql']],
  ['payment_proof_operational_metrics.sql', ['20260828370000_payment_proof_unresolved_diagnostics.sql']],
  ['payment_proof_order_lock.sql', ['20260828340000_payment_proof_operator_leases.sql']],
  ['payment_proof_processing_queue.sql', ['20260828390000_payment_proof_purge_fencing_and_replay_purge.sql']],
  ['payment_proof_reconciliation.sql', ['20260828340000_payment_proof_operator_leases.sql', '20260828350000_payment_proof_exact_reconciliation_fingerprint.sql']],
  ['admin_user_dual_deletion.sql', [
    '20260827090000_residual_client_purge.sql',
    '20260827100000_residual_manifest_alias_fix.sql',
    '20260827101000_residual_job_retention_fix.sql',
    '20260828230000_payment_proof_order_lock.sql',
    '20260828300000_payment_proof_operational_metrics.sql',
    '20260828320000_payment_proof_processing_queue.sql',
    '20260828183000_total_purge_sales_receipt_authority.sql',
    '20260828330000_total_purge_payment_proof_dependents.sql',
    '20260828340000_payment_proof_operator_leases.sql',
    '20260828380000_payment_proof_dead_letter_replay.sql',
    '20260828390000_payment_proof_purge_fencing_and_replay_purge.sql',
  ]],
])
const importPattern = /^\s*\\ir?\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:--.*)?$/gm

function migrationImports(sql: string) {
  return [...sql.matchAll(importPattern)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((path) => normalize(path).split('/').includes('migrations'))
    .map((path) => normalize(path).split('/').pop())
}

function isAllowedSuiteImport(suite: string, migration: string) {
  return forwardMigrationImports.get(suite)?.includes(migration) ?? false
}

describe('payment proof SQL harness bootstrap', () => {
  it.each(harnesses)('%s imports only its explicitly allowlisted forward migrations', (name) => {
    const sql = readFileSync(join(testsDir, name), 'utf8')
    expect(migrationImports(sql)).toEqual(forwardMigrationImports.get(name) ?? [])
  })

  it('allows only the isolated payment-proof forward migrations 34 through 39', () => {
    const allowed = new Set(
      [...forwardMigrationImports.entries()]
        .filter(([suite]) => suite !== 'admin_user_dual_deletion.sql')
        .flatMap(([, migrations]) => migrations),
    )
    expect([...allowed]).toEqual(expect.arrayContaining([
      '20260828340000_payment_proof_operator_leases.sql',
      '20260828350000_payment_proof_exact_reconciliation_fingerprint.sql',
      '20260828360000_payment_proof_leased_amount_confirmation.sql',
      '20260828370000_payment_proof_unresolved_diagnostics.sql',
      '20260828380000_payment_proof_dead_letter_replay.sql',
      '20260828390000_payment_proof_purge_fencing_and_replay_purge.sql',
    ]))
    expect([...allowed].every((name) => /^202608283[4-9]0000_/.test(name))).toBe(true)
    expect([...allowed]).not.toContain('20260826170000_payment_proof_chat_projection.sql')
  })

  it('rejects arbitrary, historical, and cross-suite migration imports', () => {
    expect(isAllowedSuiteImport('payment_proof_reconciliation.sql', '20260826170000_payment_proof_chat_projection.sql')).toBe(false)
    expect(isAllowedSuiteImport('payment_proof_reconciliation.sql', 'arbitrary.sql')).toBe(false)
    expect(isAllowedSuiteImport('payment_proof_reconciliation.sql', '20260828380000_payment_proof_dead_letter_replay.sql')).toBe(false)
    expect(isAllowedSuiteImport('payment_proof_reconciliation.sql', '20260828350000_payment_proof_exact_reconciliation_fingerprint.sql')).toBe(true)
    expect(isAllowedSuiteImport('payment_proof_processing_queue.sql', '20260828390000_payment_proof_purge_fencing_and_replay_purge.sql')).toBe(true)
    expect(isAllowedSuiteImport('admin_user_dual_deletion.sql', '20260828390000_payment_proof_purge_fencing_and_replay_purge.sql')).toBe(true)
  })

  it('detects indented, quoted, and trailing-comment migration imports', () => {
    expect(migrationImports('  \\ir "../migrations/example.sql" -- required')).toEqual(['example.sql'])
    expect(migrationImports("\t\\i '../migrations/other.sql'")).toEqual(['other.sql'])
  })
})
