import { describe, expect, it } from 'vitest'
import {
  buildVisibleProductOrderPayload,
  isProductReorderingDisabled,
  reorderProductsByVisibleDrop,
  type Produto,
} from '@/components/operator/ProductCRUD'

const products: Produto[] = [
  { id: 'hidden-before', nome: 'Hidden before', descricao: null, preco_centavos: 100, ativo: false, url_imagem: null, ordem_exibicao: 1 },
  { id: 'visible-a', nome: 'Visible A', descricao: null, preco_centavos: 100, ativo: true, url_imagem: null, ordem_exibicao: 2 },
  { id: 'visible-b', nome: 'Visible B', descricao: null, preco_centavos: 100, ativo: true, url_imagem: null, ordem_exibicao: 3 },
  { id: 'hidden-after', nome: 'Hidden after', descricao: null, preco_centavos: 100, ativo: false, url_imagem: null, ordem_exibicao: 4 },
]

describe('product visible ordering helpers', () => {
  it('reorders only products from the visible slice and preserves hidden positions', () => {
    const result = reorderProductsByVisibleDrop(products, ['visible-a', 'visible-b'], 'visible-b', 'visible-a')

    expect(result.map((product) => product.id)).toEqual([
      'hidden-before',
      'visible-b',
      'visible-a',
      'hidden-after',
    ])
  })

  it('returns the original sequence when the drop target is outside the visible slice', () => {
    const result = reorderProductsByVisibleDrop(products, ['visible-a', 'visible-b'], 'visible-b', 'hidden-after')

    expect(result).toBe(products)
  })

  it('builds a one-based payload from visible products only', () => {
    const result = buildVisibleProductOrderPayload([products[2], products[1]])

    expect(result).toEqual([
      { id: 'visible-b', ordem_exibicao: 1 },
      { id: 'visible-a', ordem_exibicao: 2 },
    ])
  })

  it('disables reordering while search or status filters are active', () => {
    expect(isProductReorderingDisabled('', 'todos')).toBe(false)
    expect(isProductReorderingDisabled('picanha', 'todos')).toBe(true)
    expect(isProductReorderingDisabled('', 'ativos')).toBe(true)
  })
})
