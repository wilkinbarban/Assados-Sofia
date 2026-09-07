const PAYMENT_PROOF_OUTBOX_MESSAGES = {
  payment_proof_already_received: 'Já recebemos este comprovante de pagamento. Não é necessário enviá-lo novamente.',
  payment_proof_under_review: 'Não foi possível validar este comprovante automaticamente. Ele será analisado por um atendente humano.',
  payment_proof_restored_under_review: 'Seu comprovante de pagamento foi restaurado e voltou para análise de um atendente humano.',
} as const

const LEGACY_MESSAGE_MAX_LENGTH = 4096
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/

type Resolution = { ok: true; text: string } | { ok: false }

/**
 * Resolves audited symbolic payloads. Legacy `message` payloads remain
 * compatible only for trimmed, non-empty, bounded text without controls.
 * Ambiguous payloads carrying both fields are rejected rather than guessed.
 */
export function resolvePaymentProofOutboxMessage(payload: unknown): Resolution {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false }

  const value = payload as Record<string, unknown>
  const hasMessageKey = Object.prototype.hasOwnProperty.call(value, 'message_key')
  const hasMessage = Object.prototype.hasOwnProperty.call(value, 'message')
  if (hasMessageKey && hasMessage) return { ok: false }

  if (hasMessageKey) {
    if (typeof value.message_key !== 'string') return { ok: false }
    const text = PAYMENT_PROOF_OUTBOX_MESSAGES[value.message_key as keyof typeof PAYMENT_PROOF_OUTBOX_MESSAGES]
    return text ? { ok: true, text } : { ok: false }
  }

  if (!hasMessage || typeof value.message !== 'string') return { ok: false }
  const text = value.message.trim()
  if (!text || text.length > LEGACY_MESSAGE_MAX_LENGTH || CONTROL_CHARACTERS.test(text)) return { ok: false }
  return { ok: true, text }
}
