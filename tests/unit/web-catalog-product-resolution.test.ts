import { describe, expect, it } from 'vitest'
import { resolveCatalogProduct } from '@/lib/cardapio/web-product-resolution'

const products = [
  { id: 'product-1', nome: 'Combo 1 - Clássico', descricao: null, preco_centavos: 6990, url_imagem: null, url_imagem_thumb: null },
  { id: 'product-2', nome: 'Combo 2 - Costela', descricao: null, preco_centavos: 11990, url_imagem: null, url_imagem_thumb: null },
]

describe('web catalog product resolution', () => {
  it('prefers an explicit product marker emitted by the catalog formatter', () => {
    expect(resolveCatalogProduct('🔖 product:product-2\n🥩 Combo', products)?.id).toBe('product-2')
  })

  it('never falls back to the first product when a card cannot be identified', () => {
    expect(resolveCatalogProduct('Produto especial sem correspondência', products)).toBeNull()
  })
})
