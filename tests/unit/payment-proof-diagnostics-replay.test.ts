import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, gates } = vi.hoisted(() => ({ createClientMock: vi.fn(), gates: { privilegedReplay: { effective: true }, sellerReconciliation: { effective: true } } }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: gates }))

import { getPaymentProofUnresolvedDiagnostics, mutatePaymentProofAdmin, replayPaymentProofDeadLetter } from '@/app/actions/payment-proof-admin'

const actor = (rpc: ReturnType<typeof vi.fn>, role = 'admin') => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'operator-1' } }, error: null }) },
  from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { funcao: role, ativo: true }, error: null }) })),
  rpc,
})

describe('payment-proof dead-letter operations', () => {
  beforeEach(() => { vi.clearAllMocks(); gates.privilegedReplay.effective = true; gates.sellerReconciliation.effective = true })

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

  it('keeps diagnostics available but denies replay before its RPC when the immutable gate is closed', async () => {
    gates.privilegedReplay.effective = false
    const rpc = vi.fn().mockResolvedValue({ data: { processing_queue_dead_letter: 0, outbox_dead_letter: 0, unresolved_dead_letter: 0, oldest_unresolved_dead_letter_at: null, oldest_unresolved_dead_letter_age_seconds: null }, error: null })
    createClientMock.mockResolvedValue(actor(rpc))

    await expect(getPaymentProofUnresolvedDiagnostics()).resolves.toEqual(expect.objectContaining({ success: true }))
    await expect(replayPaymentProofDeadLetter({ source: 'outbox', targetId: '9', idempotencyKey: '11111111-1111-4111-8111-111111111111' })).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(rpc).not.toHaveBeenCalledWith('replay_payment_proof_dead_letter', expect.anything())
  })

  it('keeps the operational gate for privileged confirmation and reconciliation, while privileged rejection remains available', async () => {
    gates.sellerReconciliation.effective = false
    const rpc = vi.fn(async (name: string) => name === 'acquire_payment_proof_lease'
      ? { data: { lease_token: 'a'.repeat(64), expires_at: '2026-08-27T12:00:00Z' }, error: null }
      : { data: null, error: null })
    createClientMock.mockResolvedValue(actor(rpc, 'supervisor'))
    const proofId = '11111111-1111-4111-8111-111111111111'
    const leaseToken = 'a'.repeat(64)

    await expect(mutatePaymentProofAdmin({ operation: 'confirm_amount', proofId, value: 4200, leaseToken })).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    await expect(mutatePaymentProofAdmin({ operation: 'reconcile', proofId, orderIds: ['22222222-2222-4222-8222-222222222222'], leaseToken })).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(rpc).not.toHaveBeenCalled()

    await expect(mutatePaymentProofAdmin({ operation: 'acquire', proofId })).resolves.toEqual(expect.objectContaining({ success: true }))
    await expect(mutatePaymentProofAdmin({ operation: 'release', proofId, leaseToken })).resolves.toEqual({ success: true })
    await expect(mutatePaymentProofAdmin({ operation: 'reject', proofId, leaseToken })).resolves.toEqual(expect.objectContaining({ success: true }))
    expect(rpc).toHaveBeenCalledWith('acquire_payment_proof_lease', expect.anything())
    expect(rpc).toHaveBeenCalledWith('release_payment_proof_lease', expect.anything())
    expect(rpc).toHaveBeenCalledWith('manage_payment_proof_review', expect.anything())
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
