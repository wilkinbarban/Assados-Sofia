export const EVOLUTION_PAYMENT_PROOF_EXPECTED_RELEASE = 'v2.3.7'
export const EVOLUTION_PAYMENT_PROOF_PROFILE = 'WHATSAPP-BAILEYS|byEvents=false|base64=false|MESSAGES_UPSERT'
export const EVOLUTION_PAYMENT_PROOF_FIXTURE_SHA256 = '02839e9172c87337f44b136ba7c7892921ab653e4eaad469e664c25f74442b17'
export const EVOLUTION_PAYMENT_PROOF_ATTESTATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type EvolutionCompatibilityReason =
  | 'COMPATIBLE'
  | 'CANONICAL_FLAG_DISABLED'
  | 'WHATSAPP_FLAG_DISABLED'
  | 'PROVIDER_NOT_EVOLUTION'
  | 'RELEASE_MISMATCH'
  | 'PROFILE_MISMATCH'
  | 'FIXTURE_MISMATCH'
  | 'ATTESTATION_INVALID'
  | 'ATTESTATION_FUTURE'
  | 'ATTESTATION_STALE'

export type EvolutionPaymentProofCompatibilityInput = {
  canonicalEnabled: string | null | undefined
  whatsappEnabled: string | null | undefined
  primaryProvider: string | null | undefined
  fallbackProvider: string | null | undefined
  operationalAttestation: string | null | undefined
}

type OperationalAttestation = {
  release: string
  profile: string
  fixtureSha256: string
  attestedAt: string
}

function parseStrictAttestation(value: string | null | undefined): OperationalAttestation | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const keys = Object.keys(record).sort()
    if (keys.join(',') !== 'attestedAt,fixtureSha256,profile,release') return null
    if (typeof record.release !== 'string' || typeof record.profile !== 'string'
      || typeof record.fixtureSha256 !== 'string' || typeof record.attestedAt !== 'string') return null
    return record as OperationalAttestation
  } catch {
    return null
  }
}

export function evaluateEvolutionPaymentProofCompatibility(
  input: EvolutionPaymentProofCompatibilityInput,
  now = new Date(),
): { open: boolean; reason: EvolutionCompatibilityReason } {
  if (input.canonicalEnabled !== 'true') return { open: false, reason: 'CANONICAL_FLAG_DISABLED' }
  if (input.whatsappEnabled !== 'true') return { open: false, reason: 'WHATSAPP_FLAG_DISABLED' }

  const provider = input.primaryProvider?.trim() || input.fallbackProvider?.trim() || ''
  if (provider.toLowerCase() !== 'evolution') return { open: false, reason: 'PROVIDER_NOT_EVOLUTION' }

  const attestation = parseStrictAttestation(input.operationalAttestation)
  if (!attestation) return { open: false, reason: 'ATTESTATION_INVALID' }
  if (attestation.release !== EVOLUTION_PAYMENT_PROOF_EXPECTED_RELEASE) return { open: false, reason: 'RELEASE_MISMATCH' }
  if (attestation.profile !== EVOLUTION_PAYMENT_PROOF_PROFILE) return { open: false, reason: 'PROFILE_MISMATCH' }
  if (attestation.fixtureSha256 !== EVOLUTION_PAYMENT_PROOF_FIXTURE_SHA256) return { open: false, reason: 'FIXTURE_MISMATCH' }

  const attestedAt = Date.parse(attestation.attestedAt)
  const nowMs = now.getTime()
  if (!Number.isFinite(attestedAt) || !Number.isFinite(nowMs)) return { open: false, reason: 'ATTESTATION_INVALID' }
  if (attestedAt > nowMs) return { open: false, reason: 'ATTESTATION_FUTURE' }
  if (nowMs - attestedAt > EVOLUTION_PAYMENT_PROOF_ATTESTATION_MAX_AGE_MS) return { open: false, reason: 'ATTESTATION_STALE' }
  return { open: true, reason: 'COMPATIBLE' }
}
