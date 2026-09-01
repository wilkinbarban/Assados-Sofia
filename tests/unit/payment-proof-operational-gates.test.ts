import { describe, expect, it, vi } from 'vitest'

const variables = {
  canonical: 'PAYMENT_PROOF_CANONICAL_INGEST_ENABLED',
  whatsapp: 'WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED',
  processing: 'PAYMENT_PROOF_PROCESSING_ENABLED',
  reconciliation: 'PAYMENT_PROOF_SELLER_RECONCILIATION_ENABLED',
  replay: 'PAYMENT_PROOF_PRIVILEGED_REPLAY_ENABLED',
  cleanup: 'PAYMENT_PROOF_CLEANUP_ENABLED',
} as const

describe('payment-proof operational startup gates', () => {
  it('allows only documented exact literals and exposes no raw values', async () => {
    const { createPaymentProofOperationalGates } = await import('@/lib/payment-proofs/operational-gates')
    const gates = createPaymentProofOperationalGates({
      [variables.canonical]: 'true',
      [variables.whatsapp]: 'false',
      [variables.processing]: 'TRUE',
      [variables.reconciliation]: undefined,
      [variables.replay]: 1,
      [variables.cleanup]: ' false',
      UNRELATED_FLAG: 'true',
    })

    expect(gates).toEqual({
      canonicalIngest: { effective: true, reason: 'ENABLED' },
      whatsappIngest: { effective: false, reason: 'DISABLED' },
      processing: { effective: false, reason: 'MALFORMED' },
      sellerReconciliation: { effective: false, reason: 'MISSING' },
      privilegedReplay: { effective: false, reason: 'MALFORMED' },
      cleanup: { effective: false, reason: 'MALFORMED' },
    })
    expect(Object.isFrozen(gates)).toBe(true)
    expect(JSON.stringify(gates)).not.toContain('UNRELATED_FLAG')
  })

  it('fails closed for unreadable snapshots and captures process environment once at import', async () => {
    const { createPaymentProofOperationalGates } = await import('@/lib/payment-proofs/operational-gates')
    const unreadable = createPaymentProofOperationalGates(new Proxy({}, { get() { throw new Error('unreadable') } }))
    expect(unreadable.canonicalIngest).toEqual({ effective: false, reason: 'UNREADABLE' })

    const originalCanonical = process.env[variables.canonical]
    try {
      vi.resetModules()
      process.env[variables.canonical] = 'true'
      const first = await import('@/lib/payment-proofs/operational-gates')
      process.env[variables.canonical] = 'false'
      expect(first.paymentProofOperationalGates.canonicalIngest).toEqual({ effective: true, reason: 'ENABLED' })

      vi.resetModules()
      const fresh = await import('@/lib/payment-proofs/operational-gates')
      expect(fresh.paymentProofOperationalGates.canonicalIngest).toEqual({ effective: false, reason: 'DISABLED' })
    } finally {
      if (originalCanonical === undefined) delete process.env[variables.canonical]
      else process.env[variables.canonical] = originalCanonical
    }
  })
})
