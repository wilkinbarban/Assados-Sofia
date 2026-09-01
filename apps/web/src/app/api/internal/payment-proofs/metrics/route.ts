import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { loadPaymentProofOperationalMetrics } from '@/lib/payment-proofs/operational-metrics-loader'

export const dynamic = 'force-dynamic'
function matchesBearer(header: string|null, secret: string|null) {
  if (!header || !secret) return false
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(header)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export async function GET(request: Request) {
  const secret = await obterConfiguracaoSistema('PAYMENT_PROOF_METRICS_SECRET')
  if (!matchesBearer(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  try { return NextResponse.json(await loadPaymentProofOperationalMetrics(), { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return NextResponse.json({ error: 'metrics_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
