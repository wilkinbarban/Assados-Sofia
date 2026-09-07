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

  it('documents the current strict-stop posture and sequential authorized rollout without automatic operations', () => {
    expect(operations).toContain('## Current production posture')
    expect(operations).toMatch(/all 8 operational gates are closed[\s\S]*strict stop/i)
    expect(operations).toMatch(/Canonical intake[\s\S]*false[\s\S]*Processing[\s\S]*false[\s\S]*Seller reconciliation[\s\S]*false[\s\S]*Cleanup[\s\S]*false[\s\S]*Privileged replay[\s\S]*false/i)
    expect(operations).toMatch(/all payment-proof capabilities are currently closed[\s\S]*canonical intake is not an exception/i)
    expect(operations).toMatch(/Telegram admission requires both[\s\S]*TELEGRAM_PAYMENT_PROOF_INGEST_ENABLED[\s\S]*canonical intake[\s\S]*no new live Telegram exercise is authorized/i)
    expect(operations).toMatch(/Evolution is the only production WhatsApp payment-proof authority[\s\S]*WhatsApp Cloud payment media remains non-admitting/i)
    expect(operations).toMatch(/No deployment, recreation, gate opening, replay, restore, purge, cleanup, or permanent enablement is automatic/i)
    expect(operations).toMatch(/Web-only recreation/i)
    expect(operations).toMatch(/rollback readiness/i)
  })
})
