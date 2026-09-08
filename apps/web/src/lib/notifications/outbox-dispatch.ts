import { enviarMensagemTelegram } from '@/lib/telegram/send'
import { enviarMensagemWhatsapp } from '@/lib/whatsapp/send'
import { WhatsAppWindowClosedError } from '@/lib/whatsapp/provider'
import { type NotificationOperationalGates, notificationOperationalGates } from './operational-gates'

export type NotificationChannel = 'web' | 'whatsapp' | 'telegram'
export type NotificationDeliveryResult =
  | { status: 'success' }
  | { status: 'retryable'; error: 'delivery_failed' | 'provider_unavailable' }
  | { status: 'permanent'; error: 'invalid_destination' | 'delivery_conflict' | 'whatsapp_window_closed' }

export type NotificationOutboxRow = Readonly<{
  eventType: string
  channel: NotificationChannel
  payload: Readonly<{ message_key: string; status?: string; reason_code?: string }>
  deliveryKey: string
}>

type WebBinding = { conversa_id: string; remetente: string; conteudo: string; url_anexo: string | null }
type WebDatabase = { from(table: 'mensagens'): { upsert(value: object, options: object): Promise<{ error: unknown }>; select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: WebBinding | null; error: unknown }> } } } }
export type DispatchNotificationOutboxInput = Readonly<{
  channel: NotificationChannel
  conversationId: string | null
  message: string
  deliveryKey: string
  db: WebDatabase
  gates?: NotificationOperationalGates
}>

function providerReportedFailure(result: unknown): boolean {
  return Boolean(result && typeof result === 'object' && ((result as { success?: unknown }).success === false || (result as { sucesso?: unknown }).sucesso === false))
}

function channelGate(gates: NotificationOperationalGates, channel: NotificationChannel) {
  return gates[channel]
}

/** Dispatches one resolved notification without logging its destination or content. */
export async function dispatchNotificationOutbox(input: DispatchNotificationOutboxInput): Promise<NotificationDeliveryResult> {
  if (!input.conversationId || !input.message || !input.deliveryKey) return { status: 'permanent', error: 'invalid_destination' }
  const gates = input.gates ?? notificationOperationalGates
  if (!gates.dispatch.effective || !channelGate(gates, input.channel).effective) return { status: 'retryable', error: 'provider_unavailable' }

  try {
    if (input.channel === 'telegram') {
      if (providerReportedFailure(await enviarMensagemTelegram(input.conversationId, { texto: input.message, remetente: 'operador' }))) return { status: 'retryable', error: 'delivery_failed' }
    } else if (input.channel === 'whatsapp') {
      if (providerReportedFailure(await enviarMensagemWhatsapp(input.conversationId, { texto: input.message, remetente: 'operador' }))) return { status: 'retryable', error: 'delivery_failed' }
    } else {
      const expected = { conversa_id: input.conversationId, remetente: 'operador', conteudo: input.message, url_anexo: null }
      const { error } = await input.db.from('mensagens').upsert({ ...expected, external_id: input.deliveryKey }, { onConflict: 'external_id', ignoreDuplicates: true })
      if (error) throw error
      const { data, error: readError } = await input.db.from('mensagens').select('conversa_id,remetente,conteudo,url_anexo').eq('external_id', input.deliveryKey).maybeSingle()
      if (readError || !data) throw readError ?? new Error('missing_delivery_binding')
      if (data.conversa_id !== expected.conversa_id || data.remetente !== expected.remetente || data.conteudo !== expected.conteudo || data.url_anexo !== expected.url_anexo) return { status: 'permanent', error: 'delivery_conflict' }
    }
    return { status: 'success' }
  } catch (error) {
    if (error instanceof WhatsAppWindowClosedError) return { status: 'permanent', error: 'whatsapp_window_closed' }
    return { status: 'retryable', error: 'delivery_failed' }
  }
}
