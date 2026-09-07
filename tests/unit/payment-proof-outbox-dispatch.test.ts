import { describe, expect, it, vi } from 'vitest'

const { telegramSend, whatsappSend } = vi.hoisted(() => ({
  telegramSend: vi.fn(),
  whatsappSend: vi.fn(),
}))
vi.mock('@/lib/telegram/send', () => ({ enviarMensagemTelegram: telegramSend }))
vi.mock('@/lib/whatsapp/send', () => ({ enviarMensagemWhatsapp: whatsappSend }))

import { dispatchPaymentProofOutbox } from '@/lib/payment-proofs/outbox-dispatch'
import { WhatsAppWindowClosedError } from '@/lib/whatsapp/provider'

describe('outbox dispatch', () => {
  it('delivers web idempotently through canonical messages', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const db = { from: () => ({ upsert }) }

    expect(await dispatchPaymentProofOutbox({ channel: 'web', conversationId: 'c', message: 'generic', deliveryKey: 'k', db })).toEqual({ status: 'success' })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ external_id: 'k' }), expect.anything())
  })

  it('does not turn a resolved provider failure into success', async () => {
    telegramSend.mockResolvedValueOnce({ success: false, error: 'forbidden' })
    whatsappSend.mockResolvedValueOnce({ sucesso: false, error: 'safety_blocked' })
    const db = {}

    await expect(dispatchPaymentProofOutbox({ channel: 'telegram', conversationId: 'c', message: 'm', deliveryKey: 'k', db }))
      .resolves.toEqual({ status: 'retryable', error: 'delivery_failed' })
    await expect(dispatchPaymentProofOutbox({ channel: 'whatsapp', conversationId: 'c', message: 'm', deliveryKey: 'k', db }))
      .resolves.toEqual({ status: 'retryable', error: 'delivery_failed' })
  })

  it('permanently classifies the typed closed WhatsApp window error', async () => {
    whatsappSend.mockRejectedValueOnce(new WhatsAppWindowClosedError())

    await expect(dispatchPaymentProofOutbox({ channel: 'whatsapp', conversationId: 'c', message: 'secret phone', deliveryKey: 'k', db: {} }))
      .resolves.toEqual({ status: 'permanent', error: 'whatsapp_window_closed' })
  })

  it('treats generic provider exceptions as retryable without guessing permanence', async () => {
    whatsappSend.mockRejectedValueOnce(new Error('chat not found'))

    await expect(dispatchPaymentProofOutbox({ channel: 'whatsapp', conversationId: 'c', message: 'secret phone', deliveryKey: 'k', db: {} }))
      .resolves.toEqual({ status: 'retryable', error: 'delivery_failed' })
  })

  it('keeps a bounded permanent failure reason for a missing destination', async () => {
    const result = await dispatchPaymentProofOutbox({ channel: 'web', conversationId: null, message: 'm', deliveryKey: 'k', db: {} })

    expect(result).toEqual({ status: 'permanent', error: 'invalid_destination' })
    expect(result.error).toHaveLength(19)
  })
})
