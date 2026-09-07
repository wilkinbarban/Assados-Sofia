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

import {
  approvePaymentProofDirectly,
  getPaymentProofForPreviewModal,
  listEligiblePaymentProofOrders,
  listPaymentProofsForAdmin,
  mutatePaymentProofAdmin,
  rejectPaymentProofDirectly,
} from '@/app/actions/payment-proof-admin'

function query(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: orderMock.mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
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

  it('uses leases and the canonical confirmation RPC for privileged staff without exposing database errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'supervisor-1' } } }) },
      from: vi.fn((table: string) => table === 'perfis'
        ? query({ data: { funcao: 'supervisor', ativo: true } })
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

  it.each(['confirm_amount', 'reconcile', 'reject'] as const)('denies active vendedores before financial RPC: %s', async (operation) => {
    const rpc = vi.fn()
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-1' } } }) },
      from: vi.fn((table: string) => query({ data: table === 'perfis' ? { funcao: 'vendedor', ativo: true } : { status: 'review', purge_after: null }, error: null })),
      rpc,
    })
    const input = operation === 'confirm_amount'
      ? { operation, proofId: '11111111-1111-4111-8111-111111111111', value: 4200, leaseToken: 'a'.repeat(64) }
      : operation === 'reconcile'
        ? { operation, proofId: '11111111-1111-4111-8111-111111111111', orderIds: ['33333333-3333-4333-8333-333333333341'], leaseToken: 'a'.repeat(64) }
        : { operation, proofId: '11111111-1111-4111-8111-111111111111', leaseToken: 'a'.repeat(64) }

    await expect(mutatePaymentProofAdmin(input)).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('denies inactive sellers before financial RPC', async () => {
    const rpc = vi.fn()
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-1' } } }) },
      from: vi.fn((table: string) => query({ data: table === 'perfis' ? { funcao: 'vendedor', ativo: false } : { status: 'review', purge_after: null }, error: null })),
      rpc,
    })

    await expect(mutatePaymentProofAdmin({ operation: 'reject', proofId: '11111111-1111-4111-8111-111111111111', leaseToken: 'a'.repeat(64) })).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('denies vendedores before direct preview, approval, or rejection work', async () => {
    const rpc = vi.fn()
    const proofQuery = query({ data: { status: 'review' }, error: null })
    const from = vi.fn((table: string) => table === 'perfis'
      ? query({ data: { funcao: 'vendedor', ativo: true } })
      : proofQuery)
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-1' } } }) },
      from,
      rpc,
    })
    const proofId = '11111111-1111-4111-8111-111111111111'
    const orderId = '33333333-3333-4333-8333-333333333341'

    await expect(getPaymentProofForPreviewModal(proofId)).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    await expect(approvePaymentProofDirectly(proofId, orderId)).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    await expect(rejectPaymentProofDirectly(proofId)).resolves.toEqual({ success: false, error: 'FORBIDDEN' })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledTimes(3)
    expect(proofQuery.select).not.toHaveBeenCalled()
  })

  it('does not treat an admitted proof as reconciled without a durable order link and approved order', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: { lease_token: 'a'.repeat(64), expires_at: '2026-09-07T03:00:00.000Z' }, error: null,
    }).mockResolvedValue({ data: true, error: null })
    const rows = [
      { data: null, error: null },
      { data: { status_pagamento: 'pendente' }, error: null },
      { data: { status: 'admitted', confirmed_cents: 4200, suggested_cents: 4200 }, error: null },
      { data: { total_pedido_centavos: 4200 }, error: null },
    ]
    let row = 0
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'supervisor-1' } } }) },
      from: vi.fn((table: string) => table === 'perfis'
        ? query({ data: { funcao: 'supervisor', ativo: true } })
        : query(rows[row++])),
      rpc,
    })
    const proofId = '11111111-1111-4111-8111-111111111111'
    const orderId = '33333333-3333-4333-8333-333333333341'

    await expect(approvePaymentProofDirectly(proofId, orderId)).resolves.toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('reconcile_payment_proof', expect.objectContaining({
      p_proof_id: proofId,
      p_order_ids: [orderId],
      p_lease_token: 'a'.repeat(64),
    }))
  })

  it('does not report success when a proof is reconciled to a different order', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'PAYMENT_PROOF_ALREADY_RECONCILED' } })
    const rows = [
      { data: null, error: null },
      { data: { status_pagamento: 'aprovado' }, error: null },
    ]
    let row = 0
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'supervisor-1' } } }) },
      from: vi.fn((table: string) => table === 'perfis'
        ? query({ data: { funcao: 'supervisor', ativo: true } })
        : query(rows[row++])),
      rpc,
    })
    const proofId = '11111111-1111-4111-8111-111111111111'
    const orderId = '33333333-3333-4333-8333-333333333341'

    await expect(approvePaymentProofDirectly(proofId, orderId)).resolves.toEqual({
      success: false,
      error: 'PAYMENT_PROOF_ALREADY_RECONCILED',
    })
    expect(rpc).toHaveBeenCalledWith('acquire_payment_proof_lease', { p_proof_id: proofId })
  })

  it('accepts an idempotent retry only for the exact durably linked approved order', async () => {
    const rpc = vi.fn()
    const rows = [
      { data: { proof_id: '11111111-1111-4111-8111-111111111111', pedido_id: '33333333-3333-4333-8333-333333333341' }, error: null },
      { data: { status_pagamento: 'aprovado' }, error: null },
    ]
    let row = 0
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'supervisor-1' } } }) },
      from: vi.fn((table: string) => table === 'perfis'
        ? query({ data: { funcao: 'supervisor', ativo: true } })
        : query(rows[row++])),
      rpc,
    })

    await expect(approvePaymentProofDirectly(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333341',
    )).resolves.toEqual({ success: true, alreadyReconciled: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['1e3', '0x10', '1.5', '01', '9999999999999', '', 1.5, 1e20])('rejects non-canonical confirmed amounts before RPC: %j', async (value) => {
    const rpc = vi.fn()
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'supervisor-1' } } }) },
      from: vi.fn((table: string) => query({ data: table === 'perfis' ? { funcao: 'supervisor', ativo: true } : { status: 'review', purge_after: null }, error: null })), rpc,
    })
    await expect(mutatePaymentProofAdmin({ operation: 'confirm_amount', proofId: '11111111-1111-4111-8111-111111111111', value, leaseToken: 'a'.repeat(64) })).resolves.toEqual({ success: false, error: 'INVALID_AMOUNT' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects duplicate, oversized, and non-array orders before reconciliation RPC', async () => {
    const rpc = vi.fn()
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'supervisor-1' } } }) },
      from: vi.fn((table: string) => query({ data: table === 'perfis' ? { funcao: 'supervisor', ativo: true } : { status: 'admitted', purge_after: null }, error: null })), rpc,
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
