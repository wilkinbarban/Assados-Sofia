import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

import { getPaymentProofUnresolvedDiagnostics, replayPaymentProofDeadLetter } from '@/app/actions/payment-proof-admin'

const actor = (rpc: ReturnType<typeof vi.fn>, role = 'admin') => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'operator-1' } }, error: null }) },
  from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { funcao: role, ativo: true }, error: null }) })),
  rpc,
})

describe('payment-proof dead-letter operations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns only the fixed aggregate diagnostics DTO after active privileged DB authorization', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { processing_queue_dead_letter: 2, outbox_dead_letter: 3, unresolved_dead_letter: 5, oldest_unresolved_dead_letter_at: '2026-08-28T12:00:00.000Z', oldest_unresolved_dead_letter_age_seconds: 60, leaked: 'no' }, error: null })
    createClientMock.mockResolvedValue(actor(rpc, 'supervisor'))

    await expect(getPaymentProofUnresolvedDiagnostics()).resolves.toEqual({ success: true, data: { processing_queue_dead_letter: 2, outbox_dead_letter: 3, unresolved_dead_letter: 5, oldest_unresolved_dead_letter_at: '2026-08-28T12:00:00.000Z', oldest_unresolved_dead_letter_age_seconds: 60 } })
    expect(rpc).toHaveBeenCalledWith('get_payment_proof_unresolved_diagnostics')
  })

  it.each([null, [], { source: 'outbox', targetId: '9', idempotencyKey: 'not-a-uuid' }, { source: 'other', targetId: '9', idempotencyKey: '11111111-1111-4111-8111-111111111111' }, { source: 'outbox', targetId: '09', idempotencyKey: '11111111-1111-4111-8111-811111111111' }])('rejects hostile replay input before RPC: %j', async (input) => {
    const rpc = vi.fn(); createClientMock.mockResolvedValue(actor(rpc))
    await expect(replayPaymentProofDeadLetter(input as never)).resolves.toEqual({ success: false, error: 'INVALID_REQUEST' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes the canonical replay signature and returns only a fixed outcome DTO', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { outcome: 'replayed', extra: 'no' }, error: null })
    createClientMock.mockResolvedValue(actor(rpc))
    const input = { source: 'outbox', targetId: '9', idempotencyKey: '11111111-1111-4111-8111-111111111111' }

    await expect(replayPaymentProofDeadLetter(input)).resolves.toEqual({ success: true, outcome: 'replayed' })
    expect(rpc).toHaveBeenCalledWith('replay_payment_proof_dead_letter', { p_source: 'outbox', p_target_id: '9', p_idempotency_key: input.idempotencyKey })
  })

  it('fails closed for an invalid RPC shape or inactive seller', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { outcome: 'unexpected' }, error: null })
    createClientMock.mockResolvedValue(actor(rpc))
    await expect(replayPaymentProofDeadLetter({ source: 'outbox', targetId: '9', idempotencyKey: '11111111-1111-4111-8111-111111111111' })).resolves.toEqual({ success: false, error: 'PAYMENT_PROOF_OPERATION_UNAVAILABLE' })
    createClientMock.mockResolvedValue(actor(vi.fn(), 'vendedor'))
    await expect(getPaymentProofUnresolvedDiagnostics()).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
  })
})
