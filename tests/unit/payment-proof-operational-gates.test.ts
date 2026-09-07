import { describe, expect, it, vi } from 'vitest'

const variables = {
  canonical: 'PAYMENT_PROOF_CANONICAL_INGEST_ENABLED',
  whatsapp: 'WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED',
  processing: 'PAYMENT_PROOF_PROCESSING_ENABLED',
  reconciliation: 'PAYMENT_PROOF_SELLER_RECONCILIATION_ENABLED',
  replay: 'PAYMENT_PROOF_PRIVILEGED_REPLAY_ENABLED',
  cleanup: 'PAYMENT_PROOF_CLEANUP_ENABLED',
  telegram: 'TELEGRAM_PAYMENT_PROOF_INGEST_ENABLED',
  restore: 'PAYMENT_PROOF_RESTORE_ENABLED',
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
      [variables.telegram]: 'true',
      [variables.restore]: 'true',
      UNRELATED_FLAG: 'true',
    })

    expect(gates).toEqual({
      canonicalIngest: { effective: true, reason: 'ENABLED' },
      whatsappIngest: { effective: false, reason: 'DISABLED' },
      processing: { effective: false, reason: 'MALFORMED' },
      sellerReconciliation: { effective: false, reason: 'MISSING' },
      privilegedReplay: { effective: false, reason: 'MALFORMED' },
      cleanup: { effective: false, reason: 'MALFORMED' },
      telegramIngest: { effective: true, reason: 'ENABLED' },
      restore: { effective: true, reason: 'ENABLED' },
    })
    expect(Object.isFrozen(gates)).toBe(true)
    expect(JSON.stringify(gates)).not.toContain('UNRELATED_FLAG')
  })

  it('fails closed for unreadable snapshots and captures process environment once at import', async () => {
    const { createPaymentProofOperationalGates } = await import('@/lib/payment-proofs/operational-gates')
    const unreadable = createPaymentProofOperationalGates(new Proxy({}, { get() { throw new Error('unreadable') } }))
    expect(unreadable.canonicalIngest).toEqual({ effective: false, reason: 'UNREADABLE' })
    expect(unreadable.telegramIngest).toEqual({ effective: false, reason: 'UNREADABLE' })

    const originalCanonical = process.env[variables.canonical]
    const originalTelegram = process.env[variables.telegram]
    const originalRestore = process.env[variables.restore]
    try {
      vi.resetModules()
      process.env[variables.canonical] = 'true'
      process.env[variables.telegram] = 'true'
      process.env[variables.restore] = 'true'
      const first = await import('@/lib/payment-proofs/operational-gates')
      process.env[variables.canonical] = 'false'
      process.env[variables.telegram] = 'false'
      process.env[variables.restore] = 'false'
      expect(first.paymentProofOperationalGates.canonicalIngest).toEqual({ effective: true, reason: 'ENABLED' })
      expect(first.paymentProofOperationalGates.telegramIngest).toEqual({ effective: true, reason: 'ENABLED' })
      expect(first.paymentProofOperationalGates.restore).toEqual({ effective: true, reason: 'ENABLED' })

      vi.resetModules()
      const fresh = await import('@/lib/payment-proofs/operational-gates')
      expect(fresh.paymentProofOperationalGates.canonicalIngest).toEqual({ effective: false, reason: 'DISABLED' })
      expect(fresh.paymentProofOperationalGates.telegramIngest).toEqual({ effective: false, reason: 'DISABLED' })
      expect(fresh.paymentProofOperationalGates.restore).toEqual({ effective: false, reason: 'DISABLED' })
    } finally {
      if (originalCanonical === undefined) delete process.env[variables.canonical]
      else process.env[variables.canonical] = originalCanonical
      if (originalTelegram === undefined) delete process.env[variables.telegram]
      else process.env[variables.telegram] = originalTelegram
      if (originalRestore === undefined) delete process.env[variables.restore]
      else process.env[variables.restore] = originalRestore
    }
  })
})
