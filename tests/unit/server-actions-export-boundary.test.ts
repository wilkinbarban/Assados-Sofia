import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('pedidos server actions export boundary', () => {
  it('keeps synchronous revenue helpers outside the use-server module', () => {
    const source = readFileSync(
      join(process.cwd(), 'apps/web/src/app/actions/pedidos.ts'),
      'utf8',
    )

    expect(source).not.toMatch(/export function (projetarElegibilidadeReceita|resumirReceitaRealizada)/)
    expect(source).toContain("from '@/lib/orders/revenueEligibility'")
  })
})
