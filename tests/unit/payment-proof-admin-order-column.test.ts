import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createAdminClientMock, orderMock, gates } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  orderMock: vi.fn(),
  gates: { sellerReconciliation: { effective: true } },
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: gates }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { listEligiblePaymentProofOrders, listPaymentProofsForAdmin, mutatePaymentProofAdmin } from '@/app/actions/payment-proof-admin'

function query(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: orderMock.mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  }
}

describe('eligible payment-proof orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      from: vi.fn((table: string) => table === 'perfis'
        ? query({ data: { funcao: 'admin', ativo: true } })
        : query({ data: [], error: null })),
    })
  })

  it('orders by pedidos.data_criacao, never the nonexistent created_at column', async () => {
    await listEligiblePaymentProofOrders('11111111-1111-4111-8111-111111111111')

    expect(orderMock).toHaveBeenCalledWith('data_criacao', { ascending: false })
    expect(orderMock).not.toHaveBeenCalledWith('created_at', expect.anything())
  })

  it('uses leases and the canonical confirmation RPC without exposing database errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-1' } } }) },
      from: vi.fn((table: string) => table === 'perfis'
        ? query({ data: { funcao: 'vendedor', ativo: true } })
        : query({ data: { status: 'admitted', purge_after: null }, error: null })),
      rpc,
    })

    const result = await mutatePaymentProofAdmin({
      operation: 'confirm_amount', proofId: '11111111-1111-4111-8111-111111111111',
      value: 4200, leaseToken: 'a'.repeat(64),
    })

    expect(rpc).toHaveBeenCalledWith('confirm_payment_proof_amount', {
      p_proof_id: '11111111-1111-4111-8111-111111111111', p_confirmed_cents: 4200, p_lease_token: 'a'.repeat(64),
    })
    expect(result).toEqual(expect.objectContaining({ success: true }))
  })

  it.each(['1e3', '0x10', '1.5', '01', '9999999999999', '', 1.5, 1e20])('rejects non-canonical confirmed amounts before RPC: %j', async (value) => {
    const rpc = vi.fn()
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-1' } } }) },
      from: vi.fn((table: string) => query({ data: table === 'perfis' ? { funcao: 'vendedor', ativo: true } : { status: 'review', purge_after: null }, error: null })), rpc,
    })
    await expect(mutatePaymentProofAdmin({ operation: 'confirm_amount', proofId: '11111111-1111-4111-8111-111111111111', value, leaseToken: 'a'.repeat(64) })).resolves.toEqual({ success: false, error: 'INVALID_AMOUNT' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects duplicate, oversized, and non-array orders before reconciliation RPC', async () => {
    const rpc = vi.fn()
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-1' } } }) },
      from: vi.fn((table: string) => query({ data: table === 'perfis' ? { funcao: 'vendedor', ativo: true } : { status: 'admitted', purge_after: null }, error: null })), rpc,
    })
    const id = '33333333-3333-4333-8333-333333333341'
    for (const orderIds of [[id, id], Array.from({ length: 101 }, () => id), 'not-an-array'] as unknown as string[][]) {
      await expect(mutatePaymentProofAdmin({ operation: 'reconcile', proofId: '11111111-1111-4111-8111-111111111111', orderIds, leaseToken: 'a'.repeat(64) })).resolves.toEqual({ success: false, error: 'INVALID_ORDERS' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lists proofs with a non-identifying customer label', async () => {
    const paymentProofQuery = query({
      data: [{
        id: '22222222-2222-4222-8222-222222222222',
        customer_id: '33333333-3333-4333-8333-333333333321',
        channel: 'web',
        status: 'review',
      }],
      error: null,
    })
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      from: vi.fn((table: string) => table === 'perfis'
        ? query({ data: { funcao: 'admin', ativo: true } })
        : paymentProofQuery),
    })

    const result = await listPaymentProofsForAdmin()

    expect(paymentProofQuery.select).toHaveBeenCalledWith(
      'id,customer_id,channel,status,suggested_cents,confirmed_cents,extraction_confidence,purge_after,created_at',
    )
    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: [expect.objectContaining({ customer_name: 'Cliente …3321' })],
    }))
  })
})
