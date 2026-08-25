import { describe, expect, it } from 'vitest'
import {
  buildTelegramCatalogCard,
  normalizeTelegramPhotoUrl,
  parseTelegramCatalogCallback,
  selectOfficialTelegramCombos,
} from '@/lib/telegram/catalog'

describe('Telegram catalog interactions', () => {
  it('builds a product card with stable add, details, and cart callbacks', () => {
    const card = buildTelegramCatalogCard({
      id: 'product-1',
      nome: 'Costela Suprema',
      descricao: 'Assada lentamente',
      preco_centavos: 11990,
      url_imagem: 'https://asados.test/costela.jpg',
    })

    expect(card.photo).toBe('https://asados.test/costela.jpg')
    expect(card.caption).toContain('R$ 119,90')
    expect(card.reply_markup.inline_keyboard).toEqual([
      [
        { text: '🛒 Adicionar', callback_data: 'catalog:add:product-1' },
        { text: '👀 Detalhes', callback_data: 'catalog:details:product-1' },
      ],
      [{ text: '🧺 Ver carrinho', callback_data: 'catalog:cart' }],
    ])
  })

  it('parses only supported callbacks and preserves the complete product id', () => {
    expect(parseTelegramCatalogCallback('catalog:add:a:b:c')).toEqual({
      action: 'add',
      productId: 'a:b:c',
    })
    expect(parseTelegramCatalogCallback('catalog:cart')).toEqual({ action: 'cart' })
    expect(parseTelegramCatalogCallback('catalog:delete:product-1')).toBeNull()
  })

  it('normalizes relative photos and rejects unusable image values', () => {
    expect(normalizeTelegramPhotoUrl('/cardapio/costela.jpg', 'https://asados.test')).toBe(
      'https://asados.test/cardapio/costela.jpg',
    )
    expect(normalizeTelegramPhotoUrl('cardapio/costela.jpg', 'https://asados.test/')).toBe(
      'https://asados.test/cardapio/costela.jpg',
    )
    expect(normalizeTelegramPhotoUrl('not a url', 'https://asados.test')).toBeNull()
  })

  it('selects only the four canonical combos in their official order', () => {
    const products = [
      { id: 'side', nome: 'Farofa', descricao: null, preco_centavos: 1000, url_imagem: null },
      { id: 'a4444444-4444-4444-8444-444444444444', nome: 'Combo 4', descricao: null, preco_centavos: 4000, url_imagem: null },
      { id: 'a2222222-2222-4222-8222-222222222222', nome: 'Combo 2', descricao: null, preco_centavos: 2000, url_imagem: null },
      { id: 'a1111111-1111-4111-8111-111111111111', nome: 'Combo 1', descricao: null, preco_centavos: 1000, url_imagem: null },
      { id: 'a3333333-3333-4333-8333-333333333333', nome: 'Combo 3', descricao: null, preco_centavos: 3000, url_imagem: null },
    ]

    expect(selectOfficialTelegramCombos(products).map((product) => product.id)).toEqual([
      'a1111111-1111-4111-8111-111111111111',
      'a2222222-2222-4222-8222-222222222222',
      'a3333333-3333-4333-8333-333333333333',
      'a4444444-4444-4444-8444-444444444444',
    ])
  })
})
