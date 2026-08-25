import { NextResponse } from 'next/server'
import { processarPagamentoBackground } from '@/app/api/webhooks/mercadopago/route'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_DELIVERIES_PER_RUN = 20

function isAuthorized(request: Request): boolean {
  const expected = process.env.MERCADO_PAGO_RECOVERY_SECRET
  return Boolean(expected) && request.headers.get('authorization') === `Bearer ${expected}`
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createAdminClient()
  let recovered = 0
  let failed = 0

  for (let index = 0; index < MAX_DELIVERIES_PER_RUN; index += 1) {
    const { data, error } = await supabaseAdmin.rpc('reivindicar_proximo_webhook_mercado_pago', {
      p_lease_seconds: 60,
    })
    const delivery = Array.isArray(data) ? data[0] : data

    if (error) {
      return NextResponse.json({ error: 'payment_recovery_unavailable', recovered, failed }, { status: 503 })
    }
    if (!delivery) break

    const processed = await processarPagamentoBackground(delivery.payment_id, null, {}, {
      requestId: delivery.request_id,
    })
    if (processed) recovered += 1
    else failed += 1
  }

  return NextResponse.json({ recovered, failed }, { status: 200 })
}
