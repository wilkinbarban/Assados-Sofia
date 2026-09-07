import { describe, expect, it } from 'vitest'
import { resolvePaymentProofOutboxMessage } from '@/lib/payment-proofs/outbox-message'

describe('resolvePaymentProofOutboxMessage', () => {
  it.each([
    ['payment_proof_already_received', 'Já recebemos este comprovante de pagamento. Não é necessário enviá-lo novamente.'],
    ['payment_proof_under_review', 'Não foi possível validar este comprovante automaticamente. Ele será analisado por um atendente humano.'],
    ['payment_proof_restored_under_review', 'Seu comprovante de pagamento foi restaurado e voltou para análise de um atendente humano.'],
  ])('resolves the audited %s key to its exact customer text', (message_key, text) => {
    expect(resolvePaymentProofOutboxMessage({ message_key })).toEqual({ ok: true, text })
  })

  it.each([undefined, null, {}, { message_key: 'unknown' }, { message_key: 1 }, { message_key: 'payment_proof_under_review', message: 'legacy' }, { message: '' }, { message: '  ' }, { message: 1 }, { message: 'a\u0000b' }, { message: 'a'.repeat(4097) }])('rejects unsupported or ambiguous payloads without text', (payload) => {
    expect(resolvePaymentProofOutboxMessage(payload)).toEqual({ ok: false })
  })

  it('accepts only trimmed, bounded legacy message text', () => {
    expect(resolvePaymentProofOutboxMessage({ message: '  legacy copy  ' })).toEqual({ ok: true, text: 'legacy copy' })
    expect(resolvePaymentProofOutboxMessage({ message: 'a'.repeat(4096) })).toEqual({ ok: true, text: 'a'.repeat(4096) })
  })
})
