import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, gates } = vi.hoisted(() => ({ createClientMock: vi.fn(), gates: {
  canonicalIngest: { effective: false, reason: 'DISABLED' }, whatsappIngest: { effective: false, reason: 'MISSING' }, processing: { effective: false, reason: 'MALFORMED' }, sellerReconciliation: { effective: false, reason: 'DISABLED' }, privilegedReplay: { effective: false, reason: 'UNREADABLE' }, cleanup: { effective: false, reason: 'DISABLED' },
} }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: gates }))

import { getPaymentProofOperationalGatesDiagnostics } from '@/app/actions/payment-proof-admin'

const actor = (role = 'admin') => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'operator-1' } }, error: null }) },
  from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { funcao: role, ativo: true }, error: null }) })),
  rpc: vi.fn(),
})

describe('payment-proof operational gate diagnostics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a fixed, copied six-gate redacted DTO after privileged active-role authorization without DB reads', async () => {
    const session = actor('supervisor'); createClientMock.mockResolvedValue(session)
    await expect(getPaymentProofOperationalGatesDiagnostics()).resolves.toEqual({ success: true, data: {
      canonicalIngest: { effective: false, reason: 'DISABLED' }, whatsappIngest: { effective: false, reason: 'MISSING' }, processing: { effective: false, reason: 'MALFORMED' }, sellerReconciliation: { effective: false, reason: 'DISABLED' }, privilegedReplay: { effective: false, reason: 'UNREADABLE' }, cleanup: { effective: false, reason: 'DISABLED' },
    } })
    expect(session.rpc).not.toHaveBeenCalled()
    expect(Object.values(session.from.mock.results)).toHaveLength(1)
  })

  it.each(['vendedor', 'other'])('denies non-privileged role %s safely', async (role) => {
    const session = actor(role); createClientMock.mockResolvedValue(session)
    await expect(getPaymentProofOperationalGatesDiagnostics()).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(session.rpc).not.toHaveBeenCalled()
  })

  it('denies an unauthenticated caller without reading gate-related database state', async () => {
    const session = actor()
    session.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    createClientMock.mockResolvedValue(session)

    await expect(getPaymentProofOperationalGatesDiagnostics()).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(session.from).not.toHaveBeenCalled()
    expect(session.rpc).not.toHaveBeenCalled()
  })
})
