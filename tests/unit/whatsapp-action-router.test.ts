import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processarAcaoInterativaWhatsApp } from '@/lib/whatsapp/action-router'
import * as carrinhoService from '@/lib/carrinho/service'

vi.mock('@/lib/carrinho/service', () => ({
  adicionarItemAoCarrinho: vi.fn(),
  obterOuCriarCarrinhoAtivo: vi.fn(),
  limparCarrinho: vi.fn(),
  converterCarrinhoEmPedido: vi.fn(),
}))

describe('WhatsApp Action Router (TDD)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processa ação cart:add:<produto_id> adicionando item ao carrinho', async () => {
    vi.mocked(carrinhoService.adicionarItemAoCarrinho).mockResolvedValueOnce({
      success: true,
      carrinho: {
        id: 'cart-1',
        cliente_id: 'cli-1',
        canal: 'whatsapp',
        status: 'aberto',
        subtotal_centavos: 3990,
        desconto_centavos: 0,
        taxa_entrega_centavos: 0,
        total_centavos: 3990,
        tipo_entrega: 'retirada',
        itens_carrinho: [
          {
            id: 'item-1',
            carrinho_id: 'cart-1',
            produto_id: 'prod-1',
            quantidade: 1,
            preco_unitario_centavos: 3990,
            preco_total_centavos: 3990,
            produtos: { nome: 'Frango Assado Inteiro' },
          },
        ],
      },
    })

    const resultado = await processarAcaoInterativaWhatsApp({
      clienteId: 'cli-1',
      telefone: '5541999998888',
      interactiveId: 'cart:add:prod-1',
    })

    expect(resultado.handled).toBe(true)
    expect(resultado.respostaTexto).toContain('Frango Assado Inteiro')
    expect(resultado.respostaTexto).toContain('39,90')
    expect(carrinhoService.adicionarItemAoCarrinho).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 'cli-1',
        produtoId: 'prod-1',
      })
    )
  })

  it('processa ação cart:view retornando resumo do carrinho', async () => {
    vi.mocked(carrinhoService.obterOuCriarCarrinhoAtivo).mockResolvedValueOnce({
      success: true,
      carrinho: {
        id: 'cart-1',
        cliente_id: 'cli-1',
        canal: 'whatsapp',
        status: 'aberto',
        subtotal_centavos: 6990,
        desconto_centavos: 0,
        taxa_entrega_centavos: 0,
        total_centavos: 6990,
        tipo_entrega: 'retirada',
        itens_carrinho: [
          {
            id: 'item-1',
            carrinho_id: 'cart-1',
            produto_id: 'prod-1',
            quantidade: 1,
            preco_unitario_centavos: 6990,
            preco_total_centavos: 6990,
            produtos: { nome: 'Combo 1 - O Clássico da Sofia' },
          },
        ],
      },
    })

    const resultado = await processarAcaoInterativaWhatsApp({
      clienteId: 'cli-1',
      telefone: '5541999998888',
      interactiveId: 'cart:view',
    })

    expect(resultado.handled).toBe(true)
    expect(resultado.respostaTexto).toContain('Seu Carrinho de Pedido')
    expect(resultado.respostaTexto).toContain('Combo 1 - O Clássico da Sofia')
  })

  it('retorna handled: false para IDs desconhecidos ou nulos', async () => {
    const resultado = await processarAcaoInterativaWhatsApp({
      clienteId: 'cli-1',
      telefone: '5541999998888',
      interactiveId: null,
    })

    expect(resultado.handled).toBe(false)
    expect(resultado.respostaTexto).toBeUndefined()
  })
})
