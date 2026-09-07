import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, gates } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  gates: { restore: { effective: false, reason: 'DISABLED' } },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: gates }))

import { mutatePaymentProofAdmin } from '@/app/actions/payment-proof-admin'

const proofId = '11111111-1111-4111-8111-111111111111'
const session = (role: string) => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'operator' } }, error: null }) },
  from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { funcao: role, ativo: true }, error: null }) })),
  rpc: vi.fn().mockResolvedValue({ error: null }),
})

describe('restore startup gate', () => {
  beforeEach(() => { vi.clearAllMocks(); gates.restore.effective = false })

  it('denies before any RPC while closed', async () => {
    const actor = session('admin'); createClientMock.mockResolvedValue(actor)
    await expect(mutatePaymentProofAdmin({ operation: 'restore', proofId })).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(actor.rpc).not.toHaveBeenCalled()
  })

  it('allows an admin through the Web action boundary when open', async () => {
    gates.restore.effective = true
    const actor = session('admin')
    let reads = 0
    actor.from = vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: reads++ === 0 ? { funcao: 'admin', ativo: true } : { status: 'review', purge_after: null }, error: null }) }))
    createClientMock.mockResolvedValue(actor)
    await expect(mutatePaymentProofAdmin({ operation: 'restore', proofId })).resolves.toEqual({ success: true, proof: { status: 'review', purge_after: null } })
    expect(actor.rpc).toHaveBeenCalledWith('restore_payment_proof', expect.any(Object))
  })

  it.each(['supervisor', 'vendedor'])('denies %s regardless of gate state', async (role) => {
    gates.restore.effective = true
    const actor = session(role); createClientMock.mockResolvedValue(actor)
    await expect(mutatePaymentProofAdmin({ operation: 'restore', proofId })).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(actor.rpc).not.toHaveBeenCalled()
  })

  it('uses the process snapshot rather than a later environment change', async () => {
    const actor = session('admin'); createClientMock.mockResolvedValue(actor)
    process.env.PAYMENT_PROOF_RESTORE_ENABLED = 'true'
    await expect(mutatePaymentProofAdmin({ operation: 'restore', proofId })).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(actor.rpc).not.toHaveBeenCalled()
    delete process.env.PAYMENT_PROOF_RESTORE_ENABLED
  })
})
