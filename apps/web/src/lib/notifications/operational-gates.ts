export const NOTIFICATION_OPERATIONAL_GATE_ENV_KEYS = [
  'NOTIFICATION_OUTBOX_DISPATCH_ENABLED',
  'WEB_NOTIFICATION_OUTBOX_DISPATCH_ENABLED',
  'WHATSAPP_NOTIFICATION_OUTBOX_DISPATCH_ENABLED',
  'TELEGRAM_NOTIFICATION_OUTBOX_DISPATCH_ENABLED',
] as const

type GateKey = typeof NOTIFICATION_OPERATIONAL_GATE_ENV_KEYS[number]
export type NotificationGateReason = 'ENABLED' | 'DISABLED' | 'MISSING' | 'MALFORMED' | 'UNREADABLE'
export type NotificationGate = Readonly<{ effective: boolean; reason: NotificationGateReason }>
export type NotificationOperationalGates = Readonly<{
  dispatch: NotificationGate
  web: NotificationGate
  whatsapp: NotificationGate
  telegram: NotificationGate
}>

type EnvironmentSnapshot = Record<string, unknown>

function evaluate(environment: EnvironmentSnapshot, key: GateKey): NotificationGate {
  try {
    const value = environment[key]
    if (value === undefined) return Object.freeze({ effective: false, reason: 'MISSING' as const })
    if (value === 'true') return Object.freeze({ effective: true, reason: 'ENABLED' as const })
    if (value === 'false') return Object.freeze({ effective: false, reason: 'DISABLED' as const })
    return Object.freeze({ effective: false, reason: 'MALFORMED' as const })
  } catch {
    return Object.freeze({ effective: false, reason: 'UNREADABLE' as const })
  }
}

/** Evaluates only the allowlisted startup flags; unreadable or invalid values fail closed. */
export function createNotificationOperationalGates(environment: EnvironmentSnapshot): NotificationOperationalGates {
  return Object.freeze({
    dispatch: evaluate(environment, 'NOTIFICATION_OUTBOX_DISPATCH_ENABLED'),
    web: evaluate(environment, 'WEB_NOTIFICATION_OUTBOX_DISPATCH_ENABLED'),
    whatsapp: evaluate(environment, 'WHATSAPP_NOTIFICATION_OUTBOX_DISPATCH_ENABLED'),
    telegram: evaluate(environment, 'TELEGRAM_NOTIFICATION_OUTBOX_DISPATCH_ENABLED'),
  })
}

/** Captured once at module initialization so later environment mutation cannot enable delivery. */
export const notificationOperationalGates = createNotificationOperationalGates(process.env)
