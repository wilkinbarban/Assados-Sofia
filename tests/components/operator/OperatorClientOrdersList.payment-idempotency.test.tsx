import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OperatorClientOrdersList from '@/components/operator/OperatorClientOrdersList'
import { actionAtualizarStatusPagamento } from '@/app/actions/pedidos'

vi.mock('@/app/actions/pedidos', () => ({
  actionListarPedidos: vi.fn(),
  actionAtualizarStatusPedido: vi.fn(),
  actionAtualizarStatusPagamento: vi.fn(),
  gerarPreferenciaPagamento: vi.fn(),
}))

const pedido = {
  id: 'ped-client-retry',
  status: 'novo',
  status_pagamento: 'pendente',
  tipo_entrega: 'retirada',
  taxa_entrega_centavos: 0,
  total_produtos_centavos: 1000,
  total_pedido_centavos: 1000,
  meio_pagamento: 'pix',
  data_criacao: new Date().toISOString(),
  data_atualizacao: new Date().toISOString(),
  itens: [],
}

describe('OperatorClientOrdersList manual payment idempotency', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reuses one idempotency key when an uncertain manual approval is retried', async () => {
    const actions = await import('@/app/actions/pedidos')
    vi.mocked(actions.actionListarPedidos).mockResolvedValue({ success: true, data: [pedido] } as any)
    vi.mocked(actionAtualizarStatusPagamento)
      .mockResolvedValueOnce({ success: false, error: 'Falha de rede' } as any)
      .mockResolvedValueOnce({ success: true } as any)
    vi.spyOn(window, 'prompt').mockReturnValue('PIX confirmado no caixa')

    render(<OperatorClientOrdersList clienteId="cli-1" clienteNome="Cliente" />)

    const approval = await screen.findByRole('button', { name: 'Aprovar pagamento' })
    fireEvent.click(approval)
    await waitFor(() => expect(actionAtualizarStatusPagamento).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar pagamento' }))
    await waitFor(() => expect(actionAtualizarStatusPagamento).toHaveBeenCalledTimes(2))

    const [firstCall, secondCall] = vi.mocked(actionAtualizarStatusPagamento).mock.calls
    expect(firstCall[0].idempotencyKey).toBe(secondCall[0].idempotencyKey)
  })
})
