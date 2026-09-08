import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModalVisualizadorComprovante from '@/components/comprovantes/ModalVisualizadorComprovante'

const mocks = vi.hoisted(() => ({
  details: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}))

vi.mock('@/app/actions/payment-proof-admin', () => ({
  getPaymentProofForPreviewModal: (...args: unknown[]) => mocks.details(...args),
  approvePaymentProofDirectly: (...args: unknown[]) => mocks.approve(...args),
  rejectPaymentProofDirectly: (...args: unknown[]) => mocks.reject(...args),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrl: vi.fn() }) } }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const detail = (proofId: string, confirmed: number, suggested: number) => ({
  success: true,
  data: {
    proof: {
      id: proofId,
      status: 'admitted',
      is_reconciled: false,
      confirmed_cents: confirmed,
      suggested_cents: suggested,
    },
    order: {
      id: `order-${proofId}`,
      status: 'confirmado',
      status_pagamento: 'pendente',
      total_pedido_centavos: confirmed,
    },
  },
})

describe('payment proof preview request identity', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4').buffer,
      blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    } as Response)
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:preview')
    window.URL.revokeObjectURL = vi.fn()
    ;(window as any).pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }) }),
    }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('ignores details returned for a previously opened proof', async () => {
    const first = deferred<ReturnType<typeof detail>>()
    mocks.details.mockImplementationOnce(() => first.promise).mockResolvedValueOnce(detail('proof-b', 200, 100))

    const view = render(
      <ModalVisualizadorComprovante isOpen onClose={vi.fn()} urlArquivo="/api/payment-proofs/proof-a/preview" nomeArquivo="a.pdf" proofId="proof-a" />,
    )
    view.rerender(
      <ModalVisualizadorComprovante isOpen onClose={vi.fn()} urlArquivo="/api/payment-proofs/proof-b/preview" nomeArquivo="b.pdf" proofId="proof-b" />,
    )

    await screen.findByRole('button', { name: /Aprovar Comprovante/i })
    first.resolve(detail('proof-a', 100, 50))
    await Promise.resolve()
    fireEvent.click(screen.getByRole('button', { name: /Aprovar Comprovante/i }))

    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith('proof-b', 'order-proof-b', 200))
  })

  it('prefers the operator-confirmed amount over advisory extraction', async () => {
    mocks.details.mockResolvedValue(detail('proof-a', 200, 100))
    render(
      <ModalVisualizadorComprovante isOpen onClose={vi.fn()} urlArquivo="/api/payment-proofs/proof-a/preview" nomeArquivo="a.pdf" proofId="proof-a" />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /Aprovar Comprovante/i }))
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith('proof-a', 'order-proof-a', 200))
  })
})
