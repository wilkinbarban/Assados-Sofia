import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createAdminClientMock, orderMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  orderMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { listEligiblePaymentProofOrders, listPaymentProofsForAdmin } from '@/app/actions/payment-proof-admin'

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
