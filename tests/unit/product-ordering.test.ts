import { describe, expect, it } from 'vitest'
import {
  buildGlobalProductOrderPayload,
  isProductReorderingDisabled,
  moveProduct,
} from '@/lib/product-ordering'

const products = [
  { id: 'a', nome: 'A' },
  { id: 'b', nome: 'B' },
  { id: 'c', nome: 'C' },
]

describe('global product ordering', () => {
  it('moves a product across the complete collection', () => {
    expect(moveProduct(products, 'c', 'a').map(({ id }) => id)).toEqual(['c', 'a', 'b'])
    expect(moveProduct(products, 'a', 'c').map(({ id }) => id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps the original collection when either product is unknown', () => {
    expect(moveProduct(products, 'missing', 'a')).toBe(products)
    expect(moveProduct(products, 'a', 'missing')).toBe(products)
  })

  it('builds one sequential payload entry for every global product', () => {
    expect(buildGlobalProductOrderPayload(products)).toEqual([
      { id: 'a', ordem_exibicao: 1 },
      { id: 'b', ordem_exibicao: 2 },
      { id: 'c', ordem_exibicao: 3 },
    ])
  })

  it('disables ordering for trimmed search text or any status filter', () => {
    expect(isProductReorderingDisabled('', 'todos')).toBe(false)
    expect(isProductReorderingDisabled(' picanha ', 'todos')).toBe(true)
    expect(isProductReorderingDisabled('', 'ativos')).toBe(true)
  })
})
