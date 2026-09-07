export const PAYMENT_PROOF_OPERATIONAL_GATE_ENV_KEYS = [
  'PAYMENT_PROOF_CANONICAL_INGEST_ENABLED',
  'WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED',
  'TELEGRAM_PAYMENT_PROOF_INGEST_ENABLED',
  'PAYMENT_PROOF_PROCESSING_ENABLED',
  'PAYMENT_PROOF_SELLER_RECONCILIATION_ENABLED',
  'PAYMENT_PROOF_PRIVILEGED_REPLAY_ENABLED',
  'PAYMENT_PROOF_CLEANUP_ENABLED',
  'PAYMENT_PROOF_RESTORE_ENABLED',
] as const

type PaymentProofOperationalGateEnvKey = typeof PAYMENT_PROOF_OPERATIONAL_GATE_ENV_KEYS[number]
export type PaymentProofOperationalGateReason = 'ENABLED' | 'DISABLED' | 'MISSING' | 'MALFORMED' | 'UNREADABLE'
export type PaymentProofOperationalGate = Readonly<{ effective: boolean; reason: PaymentProofOperationalGateReason }>
export type PaymentProofOperationalGates = Readonly<{
  canonicalIngest: PaymentProofOperationalGate
  whatsappIngest: PaymentProofOperationalGate
  telegramIngest: PaymentProofOperationalGate
  processing: PaymentProofOperationalGate
  sellerReconciliation: PaymentProofOperationalGate
  privilegedReplay: PaymentProofOperationalGate
  cleanup: PaymentProofOperationalGate
  restore: PaymentProofOperationalGate
}>

type EnvironmentSnapshot = Record<string, unknown>

function evaluateOperationalGate(environment: EnvironmentSnapshot, key: PaymentProofOperationalGateEnvKey): PaymentProofOperationalGate {
  let value: unknown
  try {
    value = environment[key]
  } catch {
    return Object.freeze({ effective: false, reason: 'UNREADABLE' as const })
  }
  if (value === undefined) return Object.freeze({ effective: false, reason: 'MISSING' as const })
  if (value === 'true') return Object.freeze({ effective: true, reason: 'ENABLED' as const })
  if (value === 'false') return Object.freeze({ effective: false, reason: 'DISABLED' as const })
  return Object.freeze({ effective: false, reason: 'MALFORMED' as const })
}

/** Evaluates only the six allowlisted values from a supplied startup environment snapshot. */
export function createPaymentProofOperationalGates(environment: EnvironmentSnapshot): PaymentProofOperationalGates {
  return Object.freeze({
    canonicalIngest: evaluateOperationalGate(environment, 'PAYMENT_PROOF_CANONICAL_INGEST_ENABLED'),
    whatsappIngest: evaluateOperationalGate(environment, 'WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED'),
    telegramIngest: evaluateOperationalGate(environment, 'TELEGRAM_PAYMENT_PROOF_INGEST_ENABLED'),
    processing: evaluateOperationalGate(environment, 'PAYMENT_PROOF_PROCESSING_ENABLED'),
    sellerReconciliation: evaluateOperationalGate(environment, 'PAYMENT_PROOF_SELLER_RECONCILIATION_ENABLED'),
    privilegedReplay: evaluateOperationalGate(environment, 'PAYMENT_PROOF_PRIVILEGED_REPLAY_ENABLED'),
    cleanup: evaluateOperationalGate(environment, 'PAYMENT_PROOF_CLEANUP_ENABLED'),
    restore: evaluateOperationalGate(environment, 'PAYMENT_PROOF_RESTORE_ENABLED'),
  })
}

/** Captured once during Web-process module initialization; later process.env mutations are inert. */
export const paymentProofOperationalGates = createPaymentProofOperationalGates(process.env)
