import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import ModalPagamentoCliente from '@/components/cliente/ModalPagamentoCliente'

const mocks = vi.hoisted(() => ({
  gerarCobrancaPixPedido: vi.fn(),
  gerarPreferenciaPagamento: vi.fn(),
  enviarComprovantePagamentoCliente: vi.fn(),
  preflightComprovantePagamentoCliente: vi.fn(),
  upload: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/app/actions/pedidos', () => ({
  gerarCobrancaPixPedido: mocks.gerarCobrancaPixPedido,
  gerarPreferenciaPagamento: mocks.gerarPreferenciaPagamento,
  enviarComprovantePagamentoCliente: mocks.enviarComprovantePagamentoCliente,
  preflightComprovantePagamentoCliente: mocks.preflightComprovantePagamentoCliente,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: mocks.upload,
      }),
    },
    channel: () => ({
      on: () => ({
        subscribe: vi.fn(),
      }),
    }),
    removeChannel: vi.fn(),
  }),
}))

describe('ModalPagamentoCliente Component', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })
  it('loads and renders PIX QR code and Copia e Cola on open', async () => {
    mocks.gerarCobrancaPixPedido.mockResolvedValue({
      success: true,
      pix: {
        qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        qrCodeCopiaCola: '00020126580014br.gov.bcb.pix0136cliente-order',
        ticketUrl: 'https://sandbox.mercadopago.com.br/ticket/client',
        paymentId: 'mock_client_pix',
        valorCentavos: 8500,
      },
    })

    render(
      <ModalPagamentoCliente
        isOpen={true}
        onClose={vi.fn()}
        pedidoId="order-client-1234"
        valorCentavos={8500}
        statusPagamento="pendente"
      />
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('00020126580014br.gov.bcb.pix0136cliente-order')).toBeDefined()
    })
  })

  it('switches to Comprovante tab and submits customer receipt', async () => {
    mocks.gerarCobrancaPixPedido.mockResolvedValue({
      success: true,
      pix: {
        qrCodeCopiaCola: '00020126580014br.gov.bcb.pix0136cliente-order',
      },
    })
    mocks.preflightComprovantePagamentoCliente.mockResolvedValue({ success: true })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.enviarComprovantePagamentoCliente.mockResolvedValue({ success: true })

    render(
      <ModalPagamentoCliente
        isOpen={true}
        onClose={vi.fn()}
        pedidoId="order-client-1234"
        valorCentavos={8500}
        statusPagamento="pendente"
      />
    )

    const comprovanteTab = screen.getByRole('button', { name: /Comprovante/i })
    fireEvent.click(comprovanteTab)

    expect(screen.getByText(/Clique para selecionar ou arraste o comprovante/i)).toBeInTheDocument()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const pdf = new File(['%PDF-test'], 'comprovante.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [pdf] } })

    const textarea = screen.getByPlaceholderText(/Ex: Realizei o pagamento às 12:10/i)
    fireEvent.change(textarea, { target: { value: 'Comprovante PIX pago ID E999888' } })

    const submitBtn = screen.getByRole('button', { name: /Enviar Comprovante ao Atendimento/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mocks.preflightComprovantePagamentoCliente).toHaveBeenCalledWith('order-client-1234')
      expect(mocks.upload).toHaveBeenCalledOnce()
      expect(mocks.enviarComprovantePagamentoCliente).toHaveBeenCalledWith('order-client-1234', {
        urlComprovante: expect.stringMatching(/^comprovantes\/order-client-1234\/.+_comprovante\.pdf$/),
        nomeArquivo: 'comprovante.pdf',
        tamanhoBytes: pdf.size,
        texto: 'Comprovante PIX pago ID E999888',
      })
    })
  })

  it('does not upload or submit when preflight rejects the proof', async () => {
    mocks.preflightComprovantePagamentoCliente.mockResolvedValue({ success: false })

    render(
      <ModalPagamentoCliente
        isOpen={true}
        onClose={vi.fn()}
        pedidoId="order-client-1234"
        valorCentavos={8500}
        statusPagamento="pendente"
        abaInicial="comprovante"
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const pdf = new File(['%PDF-test'], 'comprovante.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [pdf] } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar Comprovante ao Atendimento/i }))

    await waitFor(() => {
      expect(mocks.preflightComprovantePagamentoCliente).toHaveBeenCalledWith('order-client-1234')
    })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.enviarComprovantePagamentoCliente).not.toHaveBeenCalled()
  })
})
