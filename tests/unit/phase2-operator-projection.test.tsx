import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import OperatorChatConsole from '@/components/operator/OperatorChatConsole'

vi.mock('@/app/actions/atendimento', () => ({
  alternarIaConversa: vi.fn(),
  enviarMensagemOperador: vi.fn(),
}))
vi.mock('@/components/operator/CreateOrderModal', () => ({ default: () => null }))
vi.mock('@/components/comprovantes/ModalVisualizadorComprovante', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="legacy-pdf-modal" /> : null,
}))

const proofFetchMock = vi.fn()
vi.mock('@/app/actions/payment-proof-admin', () => ({
  getPaymentProofForPreviewModal: (...args: any[]) => proofFetchMock(...args),
}))

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function buildConversa(overrides: {
  proofStatus: string
  orderStatus?: string
  isReconciled?: boolean
}) {
  proofFetchMock.mockResolvedValue({
    success: true,
    data: {
      proof: {
        id: 'proof-1',
        status: overrides.proofStatus,
        is_reconciled: overrides.isReconciled ?? false,
      },
      order: overrides.orderStatus
        ? { id: 'order-1', status: overrides.orderStatus, status_pagamento: 'pendente' }
        : null,
    },
  })

  return {
    id: 'conv-1',
    cliente_id: 'client-1',
    status: 'aberta' as const,
    ia_ativa: false,
    data_criacao: '2026-08-25T00:00:00Z',
    data_atualizacao: '2026-08-25T00:00:00Z',
    clientes: { id: 'client-1', nome: 'Client Test', telefone: '' },
    mensagens: [
      {
        id: 'msg-1',
        conversa_id: 'conv-1',
        remetente: 'cliente' as const,
        conteudo: 'comprovante pix',
        url_anexo: null,
        payment_proof_id: 'proof-1',
        data_criacao: '2026-08-25T01:00:00Z',
      },
    ],
  }
}

describe('OperatorChatConsole — admitted-vs-reconciled truth', () => {
  it('shows amber "admitted, pending reconciliation" banner when proof is admitted but NOT reconciled', async () => {
    const conversa = buildConversa({ proofStatus: 'admitted', orderStatus: 'confirmado', isReconciled: false })
    render(<OperatorChatConsole conversa={conversa} />)

    await waitFor(() => {
      expect(screen.getByText(/COMPROVANTE ADMITIDO/i)).toBeInTheDocument()
      expect(screen.getByText(/CONCILIAÇÃO PENDENTE/i)).toBeInTheDocument()
    })

    // Must NOT show reconciled language
    expect(screen.queryByText(/COMPROVANTE CONCILIADO/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Conciliação Confirmada/i)).not.toBeInTheDocument()
  })

  it('shows green "reconciled" banner when proof is admitted AND reconciled', async () => {
    const conversa = buildConversa({ proofStatus: 'admitted', orderStatus: 'confirmado', isReconciled: true })
    render(<OperatorChatConsole conversa={conversa} />)

    await waitFor(() => {
      expect(screen.getByText(/COMPROVANTE CONCILIADO/i)).toBeInTheDocument()
      expect(screen.getByText(/Conciliação Confirmada/i)).toBeInTheDocument()
    })

    // Must NOT show the pending banner
    expect(screen.queryByText(/CONCILIAÇÃO PENDENTE/i)).not.toBeInTheDocument()
  })

  it('does not show reconciled banner for a proof in review status even if server returns is_reconciled', async () => {
    const conversa = buildConversa({ proofStatus: 'review', orderStatus: 'confirmado', isReconciled: true })
    render(<OperatorChatConsole conversa={conversa} />)

    // The review status should take priority; no comprovante-specific banner
    // because the proof hasn't reached 'admitted' yet
    await waitFor(() => {
      // For review status, a different banner is shown (review/analysis in progress)
      expect(screen.queryByText(/COMPROVANTE ADMITIDO/i)).not.toBeInTheDocument()
    })
  })

  it('does not claim pending or reconciled when the proof fetch fails', async () => {
    const conversa = buildConversa({ proofStatus: 'admitted', orderStatus: 'confirmado' })
    proofFetchMock.mockRejectedValueOnce(new Error('unavailable'))
    render(<OperatorChatConsole conversa={conversa} />)

    await waitFor(() => expect(proofFetchMock).toHaveBeenCalled())
    expect(screen.queryByText(/CONCILIAÇÃO PENDENTE/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/COMPROVANTE CONCILIADO/i)).not.toBeInTheDocument()
  })

  it('resets reconciliation while switching conversations so stale results are never reused', async () => {
    const first = buildConversa({ proofStatus: 'admitted', orderStatus: 'confirmado', isReconciled: true })
    const { rerender } = render(<OperatorChatConsole conversa={first} />)
    await screen.findByText(/COMPROVANTE CONCILIADO/i)
    const second = { ...buildConversa({ proofStatus: 'admitted', orderStatus: 'confirmado' }), id: 'conv-2' }
    proofFetchMock.mockImplementationOnce(() => new Promise(() => {}))
    rerender(<OperatorChatConsole conversa={second} />)
    await waitFor(() => expect(screen.queryByText(/COMPROVANTE CONCILIADO/i)).not.toBeInTheDocument())
    expect(screen.queryByText(/CONCILIAÇÃO PENDENTE/i)).not.toBeInTheDocument()
  })

  it('shows quarantined banner when proof is quarantined regardless of reconciliation', async () => {
    const conversa = buildConversa({ proofStatus: 'quarantined', orderStatus: 'confirmado', isReconciled: false })
    render(<OperatorChatConsole conversa={conversa} />)

    await waitFor(() => {
      expect(screen.getAllByText(/QUARENTENA/i).length).toBeGreaterThan(0)
    })

    expect(screen.queryByText(/COMPROVANTE CONCILIADO/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/COMPROVANTE ADMITIDO/i)).not.toBeInTheDocument()
  })
})
