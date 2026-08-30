import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { deliverPaymentProofAlerts } from '@/lib/payment-proofs/alert-delivery'
export const dynamic = 'force-dynamic'
function authorized(header: string|null, secret: string|null) {
  if (!header || !secret) return false
  const actual = Buffer.from(header), expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export async function POST(request: Request) {
  const secret = await obterConfiguracaoSistema('PAYMENT_PROOF_METRICS_SECRET')
  if (!authorized(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  try { return NextResponse.json(await deliverPaymentProofAlerts(), { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return NextResponse.json({ error: 'alerts_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
