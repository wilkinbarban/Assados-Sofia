const MESSAGES = {
  order_created: 'Seu pedido foi registrado.',
  order_status_changed: 'O status do seu pedido foi atualizado.',
  payment_received: 'A informação do seu pagamento foi registrada para processamento.',
  payment_status_changed: 'O status do seu pagamento foi atualizado.',
  refund_requested: 'Recebemos sua solicitação de reembolso.',
  refund_completed: 'Seu reembolso foi concluído.',
  receipt_issued: 'Seu comprovante foi emitido.',
} as const

export type NotificationEventType = keyof typeof MESSAGES
export type NotificationPayload = Readonly<{ message_key: string; status?: string; reason_code?: string }>
export type NotificationMessageResolution = { ok: true; text: string } | { ok: false }

const EVENT_COMBINATIONS: Record<NotificationEventType, Readonly<{ status?: readonly string[]; reason_code?: readonly string[] }>> = {
  order_created: {},
  order_status_changed: { status: ['novo', 'confirmado', 'entregue', 'cancelado'] },
  payment_received: {},
  payment_status_changed: { status: ['pendente', 'aprovado', 'rejeitado', 'reembolsado'] },
  refund_requested: {},
  refund_completed: { status: ['concluido'] },
  receipt_issued: {},
}

/** Resolves only schema-shaped symbolic fields and rejects incoherent event combinations. */
export function resolveNotificationOutboxMessage(eventType: string, payload: unknown): NotificationMessageResolution {
  if (!Object.prototype.hasOwnProperty.call(MESSAGES, eventType)) return { ok: false }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false }
  const value = payload as Record<string, unknown>
  const keys = Object.keys(value)
  if (!keys.includes('message_key') || keys.some((key) => key !== 'message_key' && key !== 'status' && key !== 'reason_code')) return { ok: false }
  if (keys.some((key) => typeof value[key] !== 'string')) return { ok: false }
  if (value.message_key !== eventType) return { ok: false }

  const allowed = EVENT_COMBINATIONS[eventType as NotificationEventType]
  const status = value.status
  const reasonCode = value.reason_code
  if (allowed.status && (typeof status !== 'string' || !allowed.status.includes(status))) return { ok: false }
  if (!allowed.status && status !== undefined) return { ok: false }
  if (reasonCode !== undefined && (typeof reasonCode !== 'string' || !allowed.reason_code || !allowed.reason_code.includes(reasonCode))) return { ok: false }
  return { ok: true, text: MESSAGES[eventType as NotificationEventType] }
}
