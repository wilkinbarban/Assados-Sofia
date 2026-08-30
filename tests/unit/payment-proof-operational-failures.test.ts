import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ render: vi.fn(), classify: vi.fn() }))
vi.mock('@/lib/payment-proofs/render-png', () => ({ renderPaymentProofPageOne: mocks.render }))
vi.mock('@/lib/payment-proofs/advisory-extraction', () => ({ classifyPaymentProof: mocks.classify }))

import { processCanonicalPaymentProof } from '@/lib/payment-proofs/canonical-intake'

function input() {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'admit_and_enqueue_payment_proof') return { data: { proof_id: 'proof-1', duplicate: false }, error: null }
    if (name === 'record_payment_proof_operational_failure') return { data: true, error: null }
    return { data: true, error: null }
  })
  return {
    value: { channel: 'web' as const, deliveryId: 'delivery', bytes: new Uint8Array(Buffer.from('%PDF-x')), mimeType: 'application/pdf', db: { rpc }, storage: { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn() } },
    rpc,
  }
}

describe('payment-proof operational failure recording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PAYMENT_PROOF_CANONICAL_INGEST_ENABLED = 'true'
  })

  it('records only fixed render-stage arguments and returns a sanitized retryable result', async () => {
    mocks.render.mockRejectedValue(new Error('sensitive document detail'))
    const { value, rpc } = input()
    await expect(processCanonicalPaymentProof(value)).resolves.toEqual({ status: 'retryable', error: 'PAYMENT_PROOF_RENDER_FAILED' })
    expect(rpc).toHaveBeenCalledWith('record_payment_proof_operational_failure', { p_proof_id: 'proof-1', p_stage: 'render' })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('sensitive document detail')
  })

  it('does not expose a recorder failure', async () => {
    mocks.render.mockRejectedValue(new Error('private'))
    const { value, rpc } = input()
    rpc.mockImplementation(async (name: string) => name === 'record_payment_proof_operational_failure'
      ? { data: null, error: { message: 'database detail' } }
      : name === 'admit_and_enqueue_payment_proof'
        ? { data: { proof_id: 'proof-1', duplicate: false }, error: null }
        : { data: true, error: null })
    await expect(processCanonicalPaymentProof(value)).resolves.toEqual({ status: 'retryable', error: 'PAYMENT_PROOF_RENDER_FAILED' })
  })

  it('does not invoke the recorder when rendering succeeds', async () => {
    mocks.render.mockResolvedValue({ png: new Uint8Array([1]), sha256: 'a'.repeat(64), width: 1, height: 1, version: 'v' })
    mocks.classify.mockResolvedValue({})
    const { value, rpc } = input()
    await processCanonicalPaymentProof(value)
    expect(rpc.mock.calls.filter(([name]) => name === 'record_payment_proof_operational_failure')).toHaveLength(0)
  })
})
