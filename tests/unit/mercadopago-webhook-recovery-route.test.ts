import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(
  join(process.cwd(), 'apps/web/src/app/api/webhooks/mercadopago/route.ts'),
  'utf8',
)

describe('Mercado Pago durable acknowledgement boundaries', () => {
  it('does not acknowledge an active lease and makes unexpected route failures retryable', () => {
    expect(route).toContain("claimedDelivery.delivery_status === 'completed' ? 'duplicate' : 'processing'")
    expect(route).toContain("status: claimedDelivery.delivery_status === 'completed' ? 200 : 503")
    expect(route).toContain("{ status: 503 }")
  })
})
