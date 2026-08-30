import type { PaymentProofOperationalMetrics } from './operational-metrics'

export const PAYMENT_PROOF_ALERT_FAMILIES = ['dead_letter_growth','expired_quarantines','repeated_processing_failures','maintenance_unhealthy'] as const
export type PaymentProofAlertFamily = typeof PAYMENT_PROOF_ALERT_FAMILIES[number]
export type PaymentProofAlertKind = 'initial'|'escalation_30m'|'escalation_60m'|'recovery'
export type PaymentProofAlertCondition = { family: PaymentProofAlertFamily; active: boolean; count: number; severity: number }
export type PaymentProofAlertThresholds = { deadLetter: number; expired: number; processingFailures: number; maintenanceStaleSeconds: number; maintenanceFailures: number }

const DEFAULTS: PaymentProofAlertThresholds = { deadLetter: 1, expired: 1, processingFailures: 3, maintenanceStaleSeconds: 300, maintenanceFailures: 2 }
const MAX = 1_000_000
function bounded(value: string|undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX ? parsed : fallback
}
export function readPaymentProofAlertThresholds(env: Record<string,string|undefined> = process.env): PaymentProofAlertThresholds {
  return {
    deadLetter: bounded(env.PAYMENT_PROOF_ALERT_DEAD_LETTER_THRESHOLD, DEFAULTS.deadLetter),
    expired: bounded(env.PAYMENT_PROOF_ALERT_EXPIRED_THRESHOLD, DEFAULTS.expired),
    processingFailures: bounded(env.PAYMENT_PROOF_ALERT_PROCESSING_FAILURE_THRESHOLD, DEFAULTS.processingFailures),
    maintenanceStaleSeconds: bounded(env.PAYMENT_PROOF_ALERT_MAINTENANCE_STALE_SECONDS, DEFAULTS.maintenanceStaleSeconds),
    maintenanceFailures: bounded(env.PAYMENT_PROOF_ALERT_MAINTENANCE_FAILURE_THRESHOLD, DEFAULTS.maintenanceFailures),
  }
}
export function evaluatePaymentProofAlerts(metrics: PaymentProofOperationalMetrics, thresholds = readPaymentProofAlertThresholds()): PaymentProofAlertCondition[] {
  const processing = Math.max(metrics.failures.render_last_60m, metrics.failures.classifier_last_60m)
  const maintenanceCount = Math.max(metrics.maintenance.age_seconds ?? 0, metrics.maintenance.consecutive_failures)
  return [
    { family: 'dead_letter_growth', active: metrics.outbox.dead_letter_last_60m >= thresholds.deadLetter, count: metrics.outbox.dead_letter_last_60m, severity: metrics.outbox.dead_letter_last_60m },
    { family: 'expired_quarantines', active: metrics.quarantine.expired >= thresholds.expired, count: metrics.quarantine.expired, severity: metrics.quarantine.expired },
    { family: 'repeated_processing_failures', active: processing >= thresholds.processingFailures, count: processing, severity: processing },
    { family: 'maintenance_unhealthy', active: metrics.maintenance.age_seconds === null || metrics.maintenance.age_seconds >= thresholds.maintenanceStaleSeconds || metrics.maintenance.consecutive_failures >= thresholds.maintenanceFailures, count: maintenanceCount, severity: metrics.maintenance.consecutive_failures },
  ]
}
