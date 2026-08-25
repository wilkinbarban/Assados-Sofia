import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import ModalCobrancaPix from '@/components/operator/ModalCobrancaPix'

const mocks = vi.hoisted(() => ({
  enviarCobrancaPixAoCliente: vi.fn(),
}))

vi.mock('@/app/actions/pedidos', () => ({
  enviarCobrancaPixAoCliente: mocks.enviarCobrancaPixAoCliente,
}))

describe('ModalCobrancaPix Component', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })
  const dadosPixMock = {
    qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    qrCodeCopiaCola: '00020126580014br.gov.bcb.pix0136test-pedido',
    ticketUrl: 'https://sandbox.mercadopago.com.br/ticket/123',
    paymentId: 'mock_pix_123',
    valorCentavos: 15000,
  }

  it('renders order id, client name, QR code, and PIX Copia e Cola', () => {
    render(
      <ModalCobrancaPix
        isOpen={true}
        onClose={vi.fn()}
        pedidoId="order-abc-12345678"
        clienteNome="Carlos Eduardo"
        dadosPix={dadosPixMock}
        statusPagamento="pendente"
      />
    )

    expect(screen.getByText(/ORDER-AB/i)).toBeDefined()
    expect(screen.getByText(/Carlos Eduardo/i)).toBeDefined()
    expect(screen.getByText(/R\$\s*150,00/i)).toBeDefined()
    expect(screen.getByDisplayValue('00020126580014br.gov.bcb.pix0136test-pedido')).toBeDefined()
  })

  it('triggers copy action on clicking Copiar button', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    render(
      <ModalCobrancaPix
        isOpen={true}
        onClose={vi.fn()}
        pedidoId="order-abc-12345678"
        dadosPix={dadosPixMock}
      />
    )

    const copyBtn = screen.getByRole('button', { name: /Copiar/i })
    fireEvent.click(copyBtn)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(dadosPixMock.qrCodeCopiaCola)
  })

  it('calls enviarCobrancaPixAoCliente on clicking Enviar PIX button', async () => {
    mocks.enviarCobrancaPixAoCliente.mockResolvedValue({ success: true })

    render(
      <ModalCobrancaPix
        isOpen={true}
        onClose={vi.fn()}
        pedidoId="order-abc-12345678"
        dadosPix={dadosPixMock}
      />
    )

    const sendBtn = screen.getByRole('button', { name: /Enviar PIX para Chat & WhatsApp/i })
    fireEvent.click(sendBtn)

    expect(mocks.enviarCobrancaPixAoCliente).toHaveBeenCalledWith(
      'order-abc-12345678',
      expect.objectContaining({
        qrCodeCopiaCola: dadosPixMock.qrCodeCopiaCola,
        valorCentavos: 15000,
      })
    )
  })
})
