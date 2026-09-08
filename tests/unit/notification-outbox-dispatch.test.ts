import { describe, expect, it, vi } from 'vitest'

const { telegramSend, whatsappSend } = vi.hoisted(() => ({ telegramSend: vi.fn(), whatsappSend: vi.fn() }))
vi.mock('@/lib/telegram/send', () => ({ enviarMensagemTelegram: telegramSend }))
vi.mock('@/lib/whatsapp/send', () => ({ enviarMensagemWhatsapp: whatsappSend }))

import { dispatchNotificationOutbox } from '@/lib/notifications/outbox-dispatch'
import { createNotificationOperationalGates } from '@/lib/notifications/operational-gates'
import { resolveNotificationOutboxMessage } from '@/lib/notifications/outbox-message'
import { WhatsAppWindowClosedError } from '@/lib/whatsapp/provider'

const enabled = createNotificationOperationalGates({
  NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'true',
  WEB_NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'true',
  WHATSAPP_NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'true',
  TELEGRAM_NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'true',
})

function webDb(binding: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: binding, error })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const upsert = vi.fn().mockResolvedValue({ error: null })
  return { db: { from: () => ({ upsert, select }) }, upsert, eq }
}

describe('notification outbox', () => {
  it('fails operational gates closed and captures only supplied startup values', () => {
    const gates = createNotificationOperationalGates(new Proxy({}, { get() { throw new Error('unreadable') } }))
    expect(gates.dispatch).toEqual({ effective: false, reason: 'UNREADABLE' })
    expect(createNotificationOperationalGates({ NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'true' }).web).toEqual({ effective: false, reason: 'MISSING' })
  })

  it('resolves only coherent symbolic templates', () => {
    expect(resolveNotificationOutboxMessage('payment_received', { message_key: 'payment_received' })).toEqual({ ok: true, text: 'A informação do seu pagamento foi registrada para processamento.' })
    expect(resolveNotificationOutboxMessage('payment_status_changed', { message_key: 'payment_status_changed', status: 'aprovado' })).toEqual({ ok: true, text: 'O status do seu pagamento foi atualizado.' })
    expect(resolveNotificationOutboxMessage('payment_status_changed', { message_key: 'payment_status_changed', status: 'approved' })).toEqual({ ok: false })
    expect(resolveNotificationOutboxMessage('payment_received', { message_key: 'unknown' })).toEqual({ ok: false })
    expect(resolveNotificationOutboxMessage('payment_received', { message_key: 'payment_received', reason_code: 'anything' })).toEqual({ ok: false })
    expect(resolveNotificationOutboxMessage('payment_received', { message_key: 'payment_received', message: 'injected' })).toEqual({ ok: false })
    expect(resolveNotificationOutboxMessage('refund_completed', { message_key: 'refund_completed' })).toEqual({ ok: false })
    expect(resolveNotificationOutboxMessage('refund_completed', { message_key: 'refund_completed', status: 'concluido' })).toEqual({ ok: true, text: 'Seu reembolso foi concluído.' })
  })

  it('strictly binds idempotent web delivery and rejects collisions', async () => {
    const exact = webDb({ conversa_id: 'c', remetente: 'operador', conteudo: 'm', url_anexo: null })
    await expect(dispatchNotificationOutbox({ channel: 'web', conversationId: 'c', message: 'm', deliveryKey: 'key', db: exact.db, gates: enabled })).resolves.toEqual({ status: 'success' })
    expect(exact.upsert).toHaveBeenCalledWith({ conversa_id: 'c', remetente: 'operador', conteudo: 'm', url_anexo: null, external_id: 'key' }, { onConflict: 'external_id', ignoreDuplicates: true })
    const conflict = webDb({ conversa_id: 'other', remetente: 'operador', conteudo: 'm', url_anexo: null })
    await expect(dispatchNotificationOutbox({ channel: 'web', conversationId: 'c', message: 'm', deliveryKey: 'key', db: conflict.db, gates: enabled })).resolves.toEqual({ status: 'permanent', error: 'delivery_conflict' })
  })

  it('does not acknowledge disabled channels or provider failures', async () => {
    const disabled = createNotificationOperationalGates({
      NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'true', WEB_NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'false', WHATSAPP_NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'true', TELEGRAM_NOTIFICATION_OUTBOX_DISPATCH_ENABLED: 'true',
    })
    await expect(dispatchNotificationOutbox({ channel: 'web', conversationId: 'c', message: 'm', deliveryKey: 'key', db: {} as never, gates: disabled })).resolves.toEqual({ status: 'retryable', error: 'provider_unavailable' })
    telegramSend.mockResolvedValueOnce({ success: false })
    await expect(dispatchNotificationOutbox({ channel: 'telegram', conversationId: 'c', message: 'm', deliveryKey: 'key', db: {} as never, gates: enabled })).resolves.toEqual({ status: 'retryable', error: 'delivery_failed' })
    whatsappSend.mockRejectedValueOnce(new WhatsAppWindowClosedError())
    await expect(dispatchNotificationOutbox({ channel: 'whatsapp', conversationId: 'c', message: 'm', deliveryKey: 'key', db: {} as never, gates: enabled })).resolves.toEqual({ status: 'permanent', error: 'whatsapp_window_closed' })
  })
})
