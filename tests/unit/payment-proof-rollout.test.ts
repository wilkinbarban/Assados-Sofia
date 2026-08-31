import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const intake = readFileSync('apps/web/src/lib/payment-proofs/canonical-intake.ts', 'utf8')
const compose = readFileSync('docker-compose.yml', 'utf8')
const operations = readFileSync('docs/payment-proof-operations.md', 'utf8')
const gateVariables = [
  'PAYMENT_PROOF_CANONICAL_INGEST_ENABLED',
  'WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED',
  'PAYMENT_PROOF_PROCESSING_ENABLED',
  'PAYMENT_PROOF_SELLER_RECONCILIATION_ENABLED',
  'PAYMENT_PROOF_PRIVILEGED_REPLAY_ENABLED',
  'PAYMENT_PROOF_CLEANUP_ENABLED',
]

describe('canonical proof rollout', () => {
  it('uses central immutable effective gates and fails closed for unsafe WhatsApp', () => {
    expect(intake).toContain("from './operational-gates'")
    expect(intake).toContain('paymentProofOperationalGates.canonicalIngest.effective')
    expect(intake).toContain('paymentProofOperationalGates.whatsappIngest.effective')
    expect(intake).toMatch(/input\.channel\s*===\s*['"]whatsapp['"]/)
    expect(intake).not.toContain('PAYMENT_PROOF_CANONICAL_INGEST_ENABLED')
    expect(intake).not.toContain('WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED')
  })

  it('declares maintenance runtime', () => {
    expect(compose).toContain('PAYMENT_PROOF_MAINTENANCE_SECRET')
  })

  it.each(gateVariables)('declares %s closed by default in Compose', (key) => {
    expect(compose).toContain(`${key}=${'${'}${key}:-false}`)
  })

  it('documents closed, sequential readiness without executing production operations', () => {
    expect(operations).toContain('## Rollout readiness')
    expect(operations).toMatch(/Stage 0.*closed baseline/i)
    expect(operations).toMatch(/canonical.*WhatsApp.*separately/i)
    expect(operations).toMatch(/replay.*cleanup.*closed/i)
    expect(operations).toMatch(/readiness only/i)
    expect(operations).toMatch(/not executed automatically/i)
    expect(operations).toMatch(/Web recreation/i)
    expect(operations).toMatch(/verification rollback/i)
  })
})
