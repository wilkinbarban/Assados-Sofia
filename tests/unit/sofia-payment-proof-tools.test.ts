import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executarToolSofia, type SofiaToolContext } from '@/lib/ai/tools'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/carrinho/service', () => ({
  adicionarItemAoCarrinho: vi.fn(), obterOuCriarCarrinhoAtivo: vi.fn(),
  removerItemDoCarrinho: vi.fn(), limparCarrinho: vi.fn(), converterCarrinhoEmPedido: vi.fn(),
}))

describe('Sofia payment-proof tools', () => {
  const context: SofiaToolContext = { clienteId: 'cliente-contexto' }
  const rpc = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('explains the accepted proof formats without financial confirmation', async () => {
    const result = await executarToolSofia('explicar_formatos_comprovante', {}, context)

    expect(result.success).toBe(true)
    expect(result.mensagem).toContain('PDF, JPEG ou PNG')
    expect(result.mensagem).toContain('5 MB')
    expect(result.mensagem).not.toMatch(/pagamento aprovado|dinheiro recebido|aprova ou rejeita/i)
  })

  it('queries sanitized status using the customer from context', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ proof_status: 'em_analise', payment_status: 'em_analise' }], error: null,
    })

    const result = await executarToolSofia(
      'consultar_status_comprovante_pagamento',
      { pedidoId: 'pedido-opcional' },
      { ...context, supabaseClient: { rpc } }
    )

    expect(rpc).toHaveBeenCalledWith('get_customer_payment_proof_public_status', {
      p_customer_id: 'cliente-contexto', p_pedido_id: 'pedido-opcional',
    })
    expect(result.success).toBe(true)
    expect(result.mensagem).toContain('não confirma recebimento de dinheiro')
    expect(result.mensagem).not.toMatch(/aprovad[oa]|rejeitad[oa]|aprova ou rejeita/i)
  })

  it('fails closed with an unknown status when the read RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('database unavailable') })

    const result = await executarToolSofia(
      'consultar_status_comprovante_pagamento',
      {},
      { ...context, supabaseClient: { rpc } }
    )

    expect(result).toMatchObject({ success: false, error: 'STATUS_COMPROVANTE_INDISPONIVEL' })
    expect(result.mensagem).toContain('Não consegui consultar')
    expect(result.mensagem).not.toMatch(/aprovad[oa]|rejeitad[oa]|dinheiro recebido|aprova ou rejeita/i)
  })
})
