import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enviarCardapioWhatsApp,
  montarPayloadCarrossel,
  montarPayloadCardsFallback,
  type ProdutoCardapioItem,
} from '@/lib/whatsapp/gateways/catalog-gateway'
import * as configSistema from '@/lib/config/sistema'

// Mock de fetch global
const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: vi.fn(),
}))

describe('WhatsApp Catalog Gateway & Multi-Level Fallback (TDD)', () => {
  const mockProdutos: ProdutoCardapioItem[] = [
    {
      id: 'prod-1',
      nome: 'Combo 1 - O Clássico da Sofia',
      descricao: 'Frango Assado + Farofa + Maionese Especial',
      precoCentavos: 6990,
      urlImagem: 'https://casadeasados.duckdns.org/combo1.jpg',
    },
    {
      id: 'prod-2',
      nome: 'Combo 2 - Costela Suprema',
      descricao: '1kg de Costela macia no bafo + Farofa da Casa',
      precoCentavos: 11990,
      urlImagem: 'https://casadeasados.duckdns.org/combo2.jpg',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(configSistema.obterConfiguracaoSistema).mockImplementation(async (key: string) => {
      if (key === 'EVOLUTION_API_URL') return 'http://127.0.0.1:8086'
      if (key === 'EVOLUTION_API_KEY') return 'test-api-key'
      if (key === 'EVOLUTION_INSTANCE_NAME') return 'asados-bot'
      if (key === 'WHATSAPP_INTERACTIVE_CAROUSEL_ENABLED') return 'true'
      return null
    })
  })

  it('montarPayloadCarrossel gera estrutura correta para o endpoint sendCarousel da Evolution 2.4.x', () => {
    const payload = montarPayloadCarrossel({
      telefone: '5541999998888',
      produtos: mockProdutos,
    })

    expect(payload.number).toBe('5541999998888')
    expect(payload.text).toContain('O que vai querer hoje')
    expect(payload.cards).toHaveLength(2)
    expect(payload.cards[0].title).toBe('🍗 Combo 1 - O Clássico da Sofia')
    expect(payload.cards[0].image).toBe('https://casadeasados.duckdns.org/combo1.jpg')
    expect(payload.cards[0].buttons[0].id).toBe('cart:add:prod-1')
    expect(payload.cards[0].buttons[0].displayText).toContain('Adicionar')
  })

  it('montarPayloadCardsFallback formata cartões da Figura 4 com links e opções numeradas', () => {
    const cards = montarPayloadCardsFallback({
      telefone: '5541999998888',
      produtos: mockProdutos,
    })

    expect(cards).toHaveLength(2)
    expect(cards[0].imageUrl).toBe('https://casadeasados.duckdns.org/combo1.jpg')
    expect(cards[0].caption).toContain('COMBO 1 - O CLÁSSICO DA SOFIA')
    expect(cards[0].caption).toContain('69,90')
    expect(cards[0].caption).toContain('1️⃣ Adicionar ao pedido')
  })

  it('enviarCardapioWhatsApp envia carrossel nativo quando feature flag está ativa e API responde 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'SUCCESS' }),
    })

    const resultado = await enviarCardapioWhatsApp({
      telefone: '5541999998888',
      produtos: mockProdutos,
    })

    expect(resultado.success).toBe(true)
    expect(resultado.modoUtilizado).toBe('CAROUSEL_NATIVO')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8086/message/sendCarousel/asados-bot',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'test-api-key',
        }),
      })
    )
  })

  it('enviarCardapioWhatsApp executa fallback transparente para cartões simulados se carrossel falhar (ex: 404/500)', async () => {
    // 1. Falha no envio do carrossel (ex: Evolution 2.3.7 retorna 404 para sendCarousel)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Endpoint sendCarousel not found on 2.3.7',
    })

    // 2. Envios sucessivos de fallback com sendMedia
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'SUCCESS' }) })
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'SUCCESS' }) })

    const resultado = await enviarCardapioWhatsApp({
      telefone: '5541999998888',
      produtos: mockProdutos,
    })

    expect(resultado.success).toBe(true)
    expect(resultado.modoUtilizado).toBe('CARDS_FALLBACK')
    expect(mockFetch).toHaveBeenCalledTimes(3) // 1 tentativa carrossel + 2 fotos de fallback
  })
})
