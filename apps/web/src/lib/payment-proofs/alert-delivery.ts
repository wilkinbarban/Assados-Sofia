import { createAdminClient } from '@/lib/supabase/admin'
import { loadPaymentProofOperationalMetrics } from './operational-metrics-loader'
import { evaluatePaymentProofAlerts } from './alert-policy'
import { sendPaymentProofAdminAlert } from '@/lib/telegram/admin-alert'

const CLAIM_LIMIT = 8
export type AlertDeliveryResult = { reconciled: number; claimed: number; delivered: number; failed: number }
export async function deliverPaymentProofAlerts(): Promise<AlertDeliveryResult> {
  const conditions = evaluatePaymentProofAlerts(await loadPaymentProofOperationalMetrics())
  const client = createAdminClient()
  const { data: reconciled, error: reconcileError } = await client.rpc('reconcile_payment_proof_admin_alerts', { p_conditions: conditions })
  if (reconcileError) throw new Error('ALERT_DELIVERY_UNAVAILABLE')
  const { data: claims, error: claimError } = await client.rpc('claim_payment_proof_admin_alerts', { p_limit: CLAIM_LIMIT })
  if (claimError) throw new Error('ALERT_DELIVERY_UNAVAILABLE')
  let delivered = 0, failed = 0
  for (const claim of Array.isArray(claims) ? claims.slice(0, CLAIM_LIMIT) : []) {
    let success = false
    try { await sendPaymentProofAdminAlert(claim); success = true } catch { /* completion schedules the retry */ }
    const { data: completed, error: completionError } = await client.rpc('complete_payment_proof_admin_alert', { p_id: claim.id, p_success: success })
    if (completionError || completed !== true) throw new Error('ALERT_DELIVERY_UNAVAILABLE')
    if (success) delivered++
    else {
      const { data: recorded, error: recordError } = await client.rpc('record_payment_proof_alert_delivery_failure', { p_alert_id: claim.id })
      if (recordError || recorded !== true) throw new Error('ALERT_DELIVERY_UNAVAILABLE')
      failed++
    }
  }
  return { reconciled: Number(reconciled) || 0, claimed: Array.isArray(claims) ? Math.min(claims.length, CLAIM_LIMIT) : 0, delivered, failed }
}
