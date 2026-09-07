import { enviarMensagemTelegram } from '@/lib/telegram/send'
import { enviarMensagemWhatsapp } from '@/lib/whatsapp/send'
import { WhatsAppWindowClosedError } from '@/lib/whatsapp/provider'

type Result = { status: 'success' | 'retryable' | 'permanent'; error?: string }
type Input = { channel: 'web' | 'telegram' | 'whatsapp'; conversationId: string | null; message: string; deliveryKey: string; db: any }

type ProviderResult = { success?: unknown; sucesso?: unknown }

function providerReportedFailure(result: unknown) {
  return !!result && typeof result === 'object'
    && ((result as ProviderResult).success === false || (result as ProviderResult).sucesso === false)
}

export async function dispatchPaymentProofOutbox(input: Input): Promise<Result> {
  if (!input.conversationId || !input.message) return { status: 'permanent', error: 'invalid_destination' }

  try {
    if (input.channel === 'telegram') {
      const result = await enviarMensagemTelegram(input.conversationId, { texto: input.message, remetente: 'operador' })
      if (providerReportedFailure(result)) return { status: 'retryable', error: 'delivery_failed' }
    } else if (input.channel === 'whatsapp') {
      const result = await enviarMensagemWhatsapp(input.conversationId, { texto: input.message, remetente: 'operador' })
      if (providerReportedFailure(result)) return { status: 'retryable', error: 'delivery_failed' }
    } else {
      const expected = {
        conversa_id: input.conversationId,
        remetente: 'operador',
        conteudo: input.message,
        url_anexo: null,
      }
      const { error } = await input.db.from('mensagens').upsert({
        ...expected,
        external_id: input.deliveryKey,
      }, { onConflict: 'external_id', ignoreDuplicates: true })
      if (error) throw error

      const { data: persisted, error: readError } = await input.db.from('mensagens')
        .select('conversa_id,remetente,conteudo,url_anexo')
        .eq('external_id', input.deliveryKey)
        .maybeSingle()
      if (readError || !persisted) throw readError || new Error('missing_delivery_binding')
      if (persisted.conversa_id !== expected.conversa_id
        || persisted.remetente !== expected.remetente
        || persisted.conteudo !== expected.conteudo
        || persisted.url_anexo !== expected.url_anexo) {
        return { status: 'permanent', error: 'delivery_conflict' }
      }
    }
    return { status: 'success' }
  } catch (error) {
    if (error instanceof WhatsAppWindowClosedError) {
      return { status: 'permanent', error: 'whatsapp_window_closed' }
    }
    // Provider exceptions do not carry a stable, audited permanence contract.
    return { status: 'retryable', error: 'delivery_failed' }
  }
}
