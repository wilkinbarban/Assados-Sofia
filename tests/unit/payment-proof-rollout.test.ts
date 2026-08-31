import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const intake = readFileSync('apps/web/src/lib/payment-proofs/canonical-intake.ts', 'utf8')
const compose = readFileSync('docker-compose.yml', 'utf8')
const gateVariables = [
  'PAYMENT_PROOF_CANONICAL_INGEST_ENABLED',
  'WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED',
  'PAYMENT_PROOF_PROCESSING_ENABLED',
  'PAYMENT_PROOF_SELLER_RECONCILIATION_ENABLED',
  'PAYMENT_PROOF_PRIVILEGED_REPLAY_ENABLED',
  'PAYMENT_PROOF_CLEANUP_ENABLED',
]

describe('canonical proof rollout', () => {
  it('is flag gated and fail closed for unsafe whatsapp', () => {
    expect(intake).toContain('PAYMENT_PROOF_CANONICAL_INGEST_ENABLED')
    expect(intake).toContain('WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED')
    expect(intake).toMatch(/input\.channel\s*===\s*['"]whatsapp['"]/)
  })

  it('declares maintenance runtime', () => {
    expect(compose).toContain('PAYMENT_PROOF_MAINTENANCE_SECRET')
  })

  it.each(gateVariables)('declares %s closed by default in Compose', (key) => {
    expect(compose).toContain(`${key}=${'${'}${key}:-false}`)
  })
})
