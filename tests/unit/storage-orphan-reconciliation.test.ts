import { describe, expect, it } from 'vitest'
import { classifyProductImageOrphan } from '@/lib/storage-orphan-reconciliation'

const scanAt = new Date('2026-07-20T12:00:00.000Z')

describe('classifyProductImageOrphan', () => {
  it('reports an unreferenced product image that is older than the grace period', () => {
    const result = classifyProductImageOrphan({
      path: 'produtos/produto-1/slot-1/full.webp',
      createdAt: new Date('2026-07-19T11:59:59.000Z'),
      referencedPaths: [],
      scanAt,
    })

    expect(result).toEqual({ kind: 'eligible' })
  })

  it('protects paths outside the product-image prefix', () => {
    const result = classifyProductImageOrphan({
      path: 'avatars/user-1/avatar.webp',
      createdAt: new Date('2026-07-18T12:00:00.000Z'),
      referencedPaths: [],
      scanAt,
    })

    expect(result).toEqual({ kind: 'protected', reason: 'outside_product_prefix' })
  })

  it('protects the product prefix without an object key', () => {
    const result = classifyProductImageOrphan({
      path: 'produtos/',
      createdAt: new Date('2026-07-18T12:00:00.000Z'),
      referencedPaths: [],
      scanAt,
    })

    expect(result).toEqual({ kind: 'protected', reason: 'outside_product_prefix' })
  })

  it('protects referenced product images', () => {
    const result = classifyProductImageOrphan({
      path: 'produtos/produto-1/slot-1/thumb.webp',
      createdAt: new Date('2026-07-18T12:00:00.000Z'),
      referencedPaths: ['produtos/produto-1/slot-1/thumb.webp'],
      scanAt,
    })

    expect(result).toEqual({ kind: 'protected', reason: 'referenced' })
  })

  it('protects unreferenced product images during the 24-hour grace period', () => {
    const result = classifyProductImageOrphan({
      path: 'produtos/produto-1/slot-1/full.webp',
      createdAt: new Date('2026-07-19T12:00:01.000Z'),
      referencedPaths: [],
      scanAt,
    })

    expect(result).toEqual({ kind: 'protected', reason: 'within_grace_period' })
  })

  it('accepts an unreferenced image at the exact 24-hour boundary', () => {
    const result = classifyProductImageOrphan({
      path: 'produtos/produto-1/slot-1/full.webp',
      createdAt: new Date('2026-07-19T12:00:00.000Z'),
      referencedPaths: [],
      scanAt,
    })

    expect(result).toEqual({ kind: 'eligible' })
  })

  it('protects candidates with invalid timestamps', () => {
    const result = classifyProductImageOrphan({
      path: 'produtos/produto-1/slot-1/full.webp',
      createdAt: new Date('not-a-date'),
      referencedPaths: [],
      scanAt,
    })

    expect(result).toEqual({ kind: 'protected', reason: 'invalid_timestamp' })
  })
})
