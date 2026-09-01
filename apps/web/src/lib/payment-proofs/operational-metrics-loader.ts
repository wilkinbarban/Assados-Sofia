import { parsePaymentProofOperationalMetrics, type PaymentProofOperationalMetrics } from './operational-metrics'
import { createAdminClient } from '@/lib/supabase/admin'

export async function loadPaymentProofOperationalMetrics(): Promise<PaymentProofOperationalMetrics> {
  const { data, error } = await createAdminClient().rpc('get_payment_proof_operational_metrics')
  if (error) throw new Error('METRICS_UNAVAILABLE')
  return parsePaymentProofOperationalMetrics(data)
}
