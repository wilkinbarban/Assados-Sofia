import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import type { PaymentProofAlertFamily, PaymentProofAlertKind } from '@/lib/payment-proofs/alert-policy'

export type AdminAlert = { family: PaymentProofAlertFamily; kind: PaymentProofAlertKind; count: number; severity: number }
const familyText: Record<PaymentProofAlertFamily,string> = {
  dead_letter_growth: 'dead letter growth', expired_quarantines: 'expired quarantines',
  repeated_processing_failures: 'repeated processing failures', maintenance_unhealthy: 'maintenance unhealthy',
}
const kindText: Record<PaymentProofAlertKind,string> = { initial: 'alert', escalation_30m: '30 minute escalation', escalation_60m: '60 minute escalation', recovery: 'recovery' }
function safeNumber(value: number) { return Number.isSafeInteger(value) && value >= 0 ? value : 0 }
export async function sendPaymentProofAdminAlert(alert: AdminAlert): Promise<void> {
  const token = await obterConfiguracaoSistema('TELEGRAM_BOT_TOKEN')
  const chatId = await obterConfiguracaoSistema('PAYMENT_PROOF_ALERT_TELEGRAM_CHAT_ID')
  if (!token || !chatId) throw new Error('ADMIN_ALERT_CONFIG_UNAVAILABLE')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `Payment proof ${kindText[alert.kind]}: ${familyText[alert.family]}. Count ${safeNumber(alert.count)}. Severity ${safeNumber(alert.severity)}.` }),
    })
    if (!response.ok) throw new Error('ADMIN_ALERT_SEND_FAILED')
  } catch (error) {
    if (error instanceof Error && error.message === 'ADMIN_ALERT_SEND_FAILED') throw error
    throw new Error('ADMIN_ALERT_SEND_FAILED')
  } finally { clearTimeout(timeout) }
}
