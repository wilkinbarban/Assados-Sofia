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
  function webDb(binding: unknown, readError: unknown = null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: binding, error: readError })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    return { db: { from: () => ({ upsert, select }) }, upsert, select, eq }
  }

  it('acknowledges a Web insert only after reading its exact persisted binding', async () => {
    const { db, upsert, select, eq } = webDb({ conversa_id: 'c', remetente: 'operador', conteudo: 'generic', url_anexo: null })

    expect(await dispatchPaymentProofOutbox({ channel: 'web', conversationId: 'c', message: 'generic', deliveryKey: 'k', db })).toEqual({ status: 'success' })
    expect(upsert).toHaveBeenCalledWith({
      conversa_id: 'c',
      remetente: 'operador',
      conteudo: 'generic',
      url_anexo: null,
      external_id: 'k',
    }, { onConflict: 'external_id', ignoreDuplicates: true })
    expect(select).toHaveBeenCalledWith('conversa_id,remetente,conteudo,url_anexo')
    expect(eq).toHaveBeenCalledWith('external_id', 'k')
  })

  it('acknowledges an exact duplicate but permanently rejects a divergent collision', async () => {
    const exact = webDb({ conversa_id: 'c', remetente: 'operador', conteudo: 'original', url_anexo: null })
    const divergent = webDb({ conversa_id: 'other', remetente: 'operador', conteudo: 'replacement', url_anexo: null })

    await expect(dispatchPaymentProofOutbox({ channel: 'web', conversationId: 'c', message: 'original', deliveryKey: 'same-key', db: exact.db }))
      .resolves.toEqual({ status: 'success' })
    await expect(dispatchPaymentProofOutbox({ channel: 'web', conversationId: 'c', message: 'original', deliveryKey: 'same-key', db: divergent.db }))
      .resolves.toEqual({ status: 'permanent', error: 'delivery_conflict' })
  })

  it('retries when the post-upsert binding cannot be confirmed', async () => {
    const missing = webDb(null)
    const failed = webDb(null, { message: 'read unavailable' })

    await expect(dispatchPaymentProofOutbox({ channel: 'web', conversationId: 'c', message: 'original', deliveryKey: 'k', db: missing.db }))
      .resolves.toEqual({ status: 'retryable', error: 'delivery_failed' })
    await expect(dispatchPaymentProofOutbox({ channel: 'web', conversationId: 'c', message: 'original', deliveryKey: 'k', db: failed.db }))
      .resolves.toEqual({ status: 'retryable', error: 'delivery_failed' })
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
