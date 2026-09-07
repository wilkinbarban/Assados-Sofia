import { describe, expect, it } from 'vitest'
import { evaluatePaymentProofAlerts, readPaymentProofAlertThresholds } from '@/lib/payment-proofs/alert-policy'

const metrics = {
  lifecycle: { received: 0, identity_pending: 0, processing: 0, review: 0, admitted: 0, quarantined: 0, purging: 0, duplicate: 0, purged: 0 },
  outbox: { pending: 0, claimed: 0, completed: 0, dead_letter: 1, abandoned: 0, attempts: { zero: 0, one: 0, two: 0, three_to_four: 0, five_plus: 0 }, dead_letter_last_60m: 0, unresolved_dead_letter: 1, oldest_unresolved_dead_letter_at: '2026-08-28T00:00:00.000Z', oldest_unresolved_dead_letter_age_seconds: 3600 },
  quarantine: { total: 1, expired: 1 }, purge: { failures_last_60m: 0 },
  failures: { render_last_60m: 3, classifier_last_60m: 0 },
  maintenance: { running: false, last_started_at: null, last_finished_at: null, last_success_at: null, age_seconds: null, consecutive_failures: 0 },
}

describe('payment proof alert policy', () => {
  it('evaluates exactly four fixed families including OR conditions', () => {
    const result = evaluatePaymentProofAlerts(metrics)
    expect(result.map((item) => item.family)).toEqual(['dead_letter_growth','expired_quarantines','repeated_processing_failures','maintenance_unhealthy'])
    expect(result.map((item) => item.active)).toEqual([true,true,true,true])
    expect(evaluatePaymentProofAlerts({ ...metrics, outbox: { ...metrics.outbox, unresolved_dead_letter: 0, dead_letter_last_60m: 999 } })[0].active).toBe(false)
    expect(evaluatePaymentProofAlerts({ ...metrics, failures: { render_last_60m: 0, classifier_last_60m: 3 } })[2].active).toBe(true)
    expect(evaluatePaymentProofAlerts({ ...metrics, maintenance: { ...metrics.maintenance, age_seconds: 300 } })[3].active).toBe(true)
    expect(evaluatePaymentProofAlerts({ ...metrics, maintenance: { ...metrics.maintenance, consecutive_failures: 2 } })[3].active).toBe(true)
  })

  it('uses defaults and accepts only positive bounded integer overrides', () => {
    expect(readPaymentProofAlertThresholds({})).toEqual({ deadLetter: 1, expired: 1, processingFailures: 3, maintenanceStaleSeconds: 300, maintenanceFailures: 2 })
    expect(readPaymentProofAlertThresholds({ PAYMENT_PROOF_ALERT_DEAD_LETTER_THRESHOLD: '4' }).deadLetter).toBe(4)
    for (const value of ['0','-1','1.5','no','1000001']) expect(readPaymentProofAlertThresholds({ PAYMENT_PROOF_ALERT_DEAD_LETTER_THRESHOLD: value }).deadLetter).toBe(1)
  })
})
