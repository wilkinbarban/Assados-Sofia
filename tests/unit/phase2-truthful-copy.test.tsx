import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, gerarCobrancaPixPedidoMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  gerarCobrancaPixPedidoMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))
vi.mock('@/app/actions/pedidos', () => ({
  gerarCobrancaPixPedido: gerarCobrancaPixPedidoMock,
  gerarPreferenciaPagamento: vi.fn(),
  preflightComprovantePagamentoCliente: vi.fn(),
  enviarComprovantePagamentoCliente: vi.fn(),
}))

import ModalPagamentoCliente from '@/components/cliente/ModalPagamentoCliente'
import { formatarMensagemNotificacao } from '@/lib/orders/orderNotifications'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('orderNotifications — truthful copy', () => {
  it('tells a customer where the payment receipt will be available without claiming it was emitted', () => {
    const message = formatarMensagemNotificacao({
      pedidoId: 'order-1',
      tipo: 'status_pagamento',
      statusPagamento: 'aprovado',
    })

    expect(message).toContain('estará disponível no painel do pedido')
    expect(message).not.toMatch(/2ª\s*Via|já foi emitido/i)
  })
})

describe('ModalPagamentoCliente — no fixed PIX approval promise', () => {
  it('tells the customer that PIX confirmation depends on their bank', async () => {
    createClientMock.mockReturnValue({
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
      removeChannel: vi.fn(),
    })
    gerarCobrancaPixPedidoMock.mockResolvedValue({
      success: true,
      pix: { qrCodeBase64: 'data:image/png;base64,abc', qrCodeCopiaCola: 'pix-code' },
    })

    render(
      <ModalPagamentoCliente
        isOpen
        onClose={vi.fn()}
        pedidoId="order-1"
        valorCentavos={4200}
        statusPagamento="pendente"
      />,
    )

    expect(await screen.findByText(/confirmação depende do seu banco/i)).toBeInTheDocument()
    expect(screen.queryByText(/15 segundos/i)).not.toBeInTheDocument()
  })
})
