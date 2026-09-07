type CountMap<T extends readonly string[]> = { [K in T[number]]: number }
const lifecycleKeys = ['received','identity_pending','processing','review','admitted','quarantined','purging','duplicate','purged'] as const
const outboxKeys = ['pending','claimed','completed','dead_letter','abandoned'] as const
const attemptKeys = ['zero','one','two','three_to_four','five_plus'] as const

export type PaymentProofOperationalMetrics = {
  lifecycle: CountMap<typeof lifecycleKeys>
  outbox: CountMap<typeof outboxKeys> & { attempts: CountMap<typeof attemptKeys>; dead_letter_last_60m: number; unresolved_dead_letter: number; oldest_unresolved_dead_letter_at: string|null; oldest_unresolved_dead_letter_age_seconds: number|null }
  quarantine: { total: number; expired: number }
  purge: { failures_last_60m: number }
  failures: { render_last_60m: number; classifier_last_60m: number }
  maintenance: { running: boolean; last_started_at: string|null; last_finished_at: string|null; last_success_at: string|null; age_seconds: number|null; consecutive_failures: number }
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_METRICS')
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record))) throw new Error('INVALID_METRICS')
  return record
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('INVALID_METRICS')
  return value as number
}
function counts(value: unknown, keys: readonly string[], exact = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_METRICS')
  const record = value as Record<string, unknown>
  if ((exact && Object.keys(record).length !== keys.length) || keys.some((key) => !(key in record))) throw new Error('INVALID_METRICS')
  return Object.fromEntries(keys.map((key) => [key, count(record[key])]))
}
function timestamp(value: unknown): string|null {
  if (value === null) return null
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('INVALID_METRICS')
  return value
}

export function parsePaymentProofOperationalMetrics(value: unknown): PaymentProofOperationalMetrics {
  const root = object(value, ['lifecycle','outbox','quarantine','purge','failures','maintenance'])
  const outbox = root.outbox && typeof root.outbox === 'object' && !Array.isArray(root.outbox) ? root.outbox as Record<string, unknown> : (() => { throw new Error('INVALID_METRICS') })()
  const outboxMetricKeys = ['pending','claimed','completed','dead_letter','attempts','dead_letter_last_60m','unresolved_dead_letter','oldest_unresolved_dead_letter_at','oldest_unresolved_dead_letter_age_seconds']
  const allowedOutboxKeys = new Set([...outboxMetricKeys, 'abandoned'])
  if (!outboxMetricKeys.every((key) => key in outbox) || Object.keys(outbox).some((key) => !allowedOutboxKeys.has(key)) || ('abandoned' in outbox && !Number.isSafeInteger(outbox.abandoned))) throw new Error('INVALID_METRICS')
  const quarantine = object(root.quarantine, ['total','expired'])
  const purge = object(root.purge, ['failures_last_60m'])
  const failures = object(root.failures, ['render_last_60m','classifier_last_60m'])
  const maintenance = object(root.maintenance, ['running','last_started_at','last_finished_at','last_success_at','age_seconds','consecutive_failures'])
  if (typeof maintenance.running !== 'boolean') throw new Error('INVALID_METRICS')
  const unresolvedDeadLetter = count(outbox.unresolved_dead_letter)
  const oldestUnresolvedDeadLetterAt = timestamp(outbox.oldest_unresolved_dead_letter_at)
  const oldestUnresolvedDeadLetterAgeSeconds = outbox.oldest_unresolved_dead_letter_age_seconds === null ? null : count(outbox.oldest_unresolved_dead_letter_age_seconds)
  if ((unresolvedDeadLetter === 0) !== (oldestUnresolvedDeadLetterAt === null) || (unresolvedDeadLetter === 0) !== (oldestUnresolvedDeadLetterAgeSeconds === null)) throw new Error('INVALID_METRICS')
  return {
    lifecycle: counts(root.lifecycle,lifecycleKeys) as CountMap<typeof lifecycleKeys>,
    outbox: { ...(counts(outbox,outboxKeys.filter((key) => key !== 'abandoned'),false) as Omit<CountMap<typeof outboxKeys>, 'abandoned'>), abandoned: 'abandoned' in outbox ? count(outbox.abandoned) : 0, attempts: counts(outbox.attempts,attemptKeys) as CountMap<typeof attemptKeys>, dead_letter_last_60m: count(outbox.dead_letter_last_60m), unresolved_dead_letter: unresolvedDeadLetter, oldest_unresolved_dead_letter_at: oldestUnresolvedDeadLetterAt, oldest_unresolved_dead_letter_age_seconds: oldestUnresolvedDeadLetterAgeSeconds },
    quarantine: { total: count(quarantine.total), expired: count(quarantine.expired) },
    purge: { failures_last_60m: count(purge.failures_last_60m) },
    failures: { render_last_60m: count(failures.render_last_60m), classifier_last_60m: count(failures.classifier_last_60m) },
    maintenance: { running: maintenance.running, last_started_at: timestamp(maintenance.last_started_at), last_finished_at: timestamp(maintenance.last_finished_at), last_success_at: timestamp(maintenance.last_success_at), age_seconds: maintenance.age_seconds === null ? null : count(maintenance.age_seconds), consecutive_failures: count(maintenance.consecutive_failures) },
  }
}
