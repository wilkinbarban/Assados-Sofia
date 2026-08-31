import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EVOLUTION_PAYMENT_PROOF_EXPECTED_RELEASE,
  EVOLUTION_PAYMENT_PROOF_FIXTURE_SHA256,
  EVOLUTION_PAYMENT_PROOF_PROFILE,
  evaluateEvolutionPaymentProofCompatibility,
} from '@/lib/whatsapp/evolution-payment-proof-compatibility'
import { createPaymentProofOperationalGates } from '@/lib/payment-proofs/operational-gates'

const NOW = new Date('2026-08-28T12:00:00.000Z')
const attestation = {
  release: EVOLUTION_PAYMENT_PROOF_EXPECTED_RELEASE,
  profile: EVOLUTION_PAYMENT_PROOF_PROFILE,
  fixtureSha256: EVOLUTION_PAYMENT_PROOF_FIXTURE_SHA256,
  attestedAt: '2026-08-25T12:00:00.000Z',
}
const ready = {
  canonicalEnabled: 'true',
  whatsappEnabled: 'true',
  primaryProvider: 'evolution',
  fallbackProvider: 'meta',
  operationalAttestation: JSON.stringify(attestation),
}

describe('Evolution v2.3.7 payment-proof compatibility gate', () => {
  it('recomputes the raw sanitized fixture digest against the immutable pin', () => {
    const fixture = readFileSync('tests/fixtures/evolution/messages-upsert-document-v2.3.7.sanitized.json')
    expect(createHash('sha256').update(fixture).digest('hex')).toBe(EVOLUTION_PAYMENT_PROOF_FIXTURE_SHA256)
    const text = fixture.toString('utf8')
    expect(text).toContain('sanitized-message-id')
    expect(text).not.toContain('base64')
  })

  it('opens only when every necessary compatibility condition is exact', () => {
    expect(evaluateEvolutionPaymentProofCompatibility(ready, NOW)).toEqual({ open: true, reason: 'COMPATIBLE' })
  })

  it('consumes centralized canonical and WhatsApp operational states without weakening attestation checks', () => {
    const gates = createPaymentProofOperationalGates({
      PAYMENT_PROOF_CANONICAL_INGEST_ENABLED: 'true',
      WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED: 'true',
    })
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, gates }, NOW)).toEqual({ open: true, reason: 'COMPATIBLE' })
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, gates, operationalAttestation: null }, NOW)).toEqual({ open: false, reason: 'ATTESTATION_INVALID' })
  })

  it('fails closed rather than throwing when supplied gates are incomplete at runtime', () => {
    const gates = { canonicalIngest: { effective: true, reason: 'ENABLED' } }
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, gates: gates as never }, NOW)).toEqual({ open: false, reason: 'WHATSAPP_FLAG_DISABLED' })
  })

  it.each([
    ['canonicalEnabled', 'TRUE', 'CANONICAL_FLAG_DISABLED'],
    ['whatsappEnabled', '1', 'WHATSAPP_FLAG_DISABLED'],
    ['primaryProvider', 'meta', 'PROVIDER_NOT_EVOLUTION'],
  ] as const)('fails closed for %s', (key, value, reason) => {
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, [key]: value }, NOW)).toEqual({ open: false, reason })
  })

  it.each([
    ['release', '2.3.7', 'RELEASE_MISMATCH'],
    ['profile', 'WHATSAPP-BAILEYS', 'PROFILE_MISMATCH'],
    ['fixtureSha256', '0'.repeat(64), 'FIXTURE_MISMATCH'],
    ['attestedAt', 'not-a-date', 'ATTESTATION_INVALID'],
  ] as const)('rejects operational attestation claims that differ from pinned constants: %s', (key, value, reason) => {
    const operationalAttestation = JSON.stringify({ ...attestation, [key]: value })
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, operationalAttestation }, NOW)).toEqual({ open: false, reason })
  })

  it('requires one strict operational attestation object with no missing or additional claims', () => {
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, operationalAttestation: null }, NOW).reason).toBe('ATTESTATION_INVALID')
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, operationalAttestation: JSON.stringify({ ...attestation, extra: true }) }, NOW).reason).toBe('ATTESTATION_INVALID')
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, operationalAttestation: JSON.stringify({ ...attestation, profile: undefined }) }, NOW).reason).toBe('ATTESTATION_INVALID')
  })

  it('uses the primary provider alias before the fallback alias', () => {
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, primaryProvider: '', fallbackProvider: 'evolution' }, NOW).open).toBe(true)
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, primaryProvider: 'meta', fallbackProvider: 'evolution' }, NOW).reason).toBe('PROVIDER_NOT_EVOLUTION')
  })

  it('rejects stale and future operational attestations', () => {
    const stale = JSON.stringify({ ...attestation, attestedAt: '2026-08-21T11:59:59.999Z' })
    const future = JSON.stringify({ ...attestation, attestedAt: '2026-08-28T12:00:00.001Z' })
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, operationalAttestation: stale }, NOW).reason).toBe('ATTESTATION_STALE')
    expect(evaluateEvolutionPaymentProofCompatibility({ ...ready, operationalAttestation: future }, NOW).reason).toBe('ATTESTATION_FUTURE')
  })
})
