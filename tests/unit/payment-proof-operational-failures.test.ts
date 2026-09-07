import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  classify: vi.fn(),
  gates: { canonicalIngest: { effective: true, reason: 'ENABLED' as const }, whatsappIngest: { effective: true, reason: 'ENABLED' as const } },
}))
vi.mock('@/lib/payment-proofs/render-png', () => ({ renderPaymentProofPageOne: mocks.render }))
vi.mock('@/lib/payment-proofs/advisory-extraction', () => ({ classifyPaymentProof: mocks.classify }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: mocks.gates }))

import { processCanonicalPaymentProof } from '@/lib/payment-proofs/canonical-intake'

function input(admission: { data: { proof_id: string; duplicate: boolean } | null; error: unknown } = { data: { proof_id: 'proof-1', duplicate: false }, error: null }) {
  const rpc = vi.fn(async (name: string) => name === 'admit_and_enqueue_payment_proof'
    ? admission
    : { data: true, error: null })
  const upload = vi.fn().mockResolvedValue({ error: null })
  const remove = vi.fn().mockResolvedValue({ error: null })
  return {
    value: { channel: 'web' as const, deliveryId: 'delivery', bytes: new Uint8Array(Buffer.from('%PDF-x')), mimeType: 'application/pdf', db: { rpc }, storage: { upload, remove } },
    rpc,
    remove,
  }
}

function expectNoProcessingSideEffects(rpc: ReturnType<typeof vi.fn>) {
  expect(mocks.render).not.toHaveBeenCalled()
  expect(mocks.classify).not.toHaveBeenCalled()
  expect(rpc.mock.calls.filter(([name]) => name === 'record_payment_proof_operational_failure')).toHaveLength(0)
}

describe('payment-proof operational failure recording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts atomic admission without invoking worker-owned processing or failure recording', async () => {
    const { value, rpc } = input()

    await expect(processCanonicalPaymentProof(value)).resolves.toEqual({
      status: 'accepted', proofId: 'proof-1', storageKey: expect.any(String),
    })
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('admit_and_enqueue_payment_proof', expect.any(Object))
    expectNoProcessingSideEffects(rpc)
  })

  it('returns a sanitized retryable intake result without processing side effects', async () => {
    const { value, rpc, remove } = input({ data: null, error: { message: 'private enqueue detail' } })

    await expect(processCanonicalPaymentProof(value)).resolves.toEqual({
      status: 'retryable', error: 'PAYMENT_PROOF_INTAKE_FAILED',
    })
    expect(remove).toHaveBeenCalledOnce()
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('private enqueue detail')
    expectNoProcessingSideEffects(rpc)
  })

  it('preserves a supported intake rejection without recording a processing failure', async () => {
    const { value, rpc, remove } = input({ data: null, error: { message: 'PAYMENT_PROOF_ORDER_INELIGIBLE' } })

    await expect(processCanonicalPaymentProof(value)).resolves.toEqual({
      status: 'rejected', error: 'PAYMENT_PROOF_ORDER_INELIGIBLE',
    })
    expect(remove).toHaveBeenCalledOnce()
    expectNoProcessingSideEffects(rpc)
  })
})
