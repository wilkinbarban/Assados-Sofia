import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sortProductsByOfficialOrder } from '@/lib/product-ordering'

describe('official product ordering contract', () => {
  it('orders persisted positions before legacy missing positions with deterministic ties', () => {
    const products = [
      { id: 'z', nome: 'Costela', ordem_exibicao: 0 },
      { id: 'b', nome: 'Picanha', ordem_exibicao: 2 },
      { id: 'a', nome: 'Picanha', ordem_exibicao: 2 },
      { id: 'c', nome: 'Alcatra', ordem_exibicao: null },
      { id: 'd', nome: 'Linguiça', ordem_exibicao: 1 },
    ]

    expect(sortProductsByOfficialOrder(products).map(({ id }) => id)).toEqual(['d', 'a', 'b', 'c', 'z'])
  })

  it('uses the name and identifier fallback when products lack an official position', () => {
    const products = [
      { id: 'b', nome: 'Asado', ordem_exibicao: 0 },
      { id: 'a', nome: 'Asado', ordem_exibicao: null },
      { id: 'c', nome: 'Brisket', ordem_exibicao: 0 },
    ]

    expect(sortProductsByOfficialOrder(products).map(({ id }) => id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps the inventory selector on official positions and deterministic fallbacks', () => {
    const inventoryAction = readFileSync('src/app/actions/estoque.ts', 'utf8')

    expect(inventoryAction).toMatch(/order\('ordem_exibicao',[\s\S]*order\('nome',[\s\S]*order\('id'/)
    expect(inventoryAction).toMatch(/sortProductsByOfficialOrder\(data \|\| \[\]\)/)
  })

  it('defines a migration that assigns positions and ranks search before official ordering', () => {
    const migrations = readdirSync('supabase/migrations')
      .filter((file) => file.endsWith('_product_official_ordering.sql'))
    expect(migrations).toHaveLength(1)

    const sql = readFileSync(join('supabase/migrations', migrations[0]), 'utf8')
    expect(sql).toMatch(/before insert on public\.produtos/i)
    expect(sql).toMatch(/pg_advisory_xact_lock/)
    expect(sql).toMatch(/order by[\s\S]*nullif\(p\.ordem_exibicao,\s*0\)[\s\S]*p\.nome[\s\S]*p\.id/i)
    expect(sql).toMatch(/case[\s\S]*lower\(p\.nome\)[\s\S]*end[\s\S]*nullif\(p\.ordem_exibicao,\s*0\)/i)
  })
})
