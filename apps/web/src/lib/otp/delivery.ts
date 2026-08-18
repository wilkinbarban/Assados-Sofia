import { OtpDeliveryResult, OtpPurpose } from './types'
import { enviarOtpTelegram } from '@/lib/telegram/send'
import { sendOtpEvolution, EvolutionProvider } from '@/lib/whatsapp/evolution'
import { sendOtpMeta } from '@/lib/whatsapp/send'
import { obterProvedorAtivo } from '@/lib/whatsapp/provider'

export interface DeliverOtpOptions {
  purpose?: OtpPurpose
  preferredTelegramChatId?: string | null
}

/**
 * Roteador multicanal de entrega de OTP:
 * 1. Prioriza Telegram se houver chat_id verificado.
 * 2. Se o Telegram falhar ou não estiver vinculado, envia exclusivamente pelo provedor ativo de WhatsApp (Evolution ou Meta).
 * 3. Nunca pula silenciosamente para um provedor inativo se o ativo falhar.
 */
export async function deliverOtp(
  phone: string,
  code: string,
  options?: DeliverOtpOptions
): Promise<OtpDeliveryResult> {
  // 1. Tentar Telegram se disponível
  if (options?.preferredTelegramChatId) {
    try {
      const tgResult = await enviarOtpTelegram(options.preferredTelegramChatId, code)
      if (tgResult.success) {
        return {
          accepted: true,
          channel: 'telegram',
          provider: 'telegram',
          externalId: null
        }
      }
    } catch {
      // Fallback para WhatsApp
    }
  }

  // 2. Resolver provedor ativo de WhatsApp
  const providerOrKey = (await obterProvedorAtivo()) as any
  const isEvolution = typeof providerOrKey === 'string'
    ? providerOrKey.toUpperCase() === 'EVOLUTION'
    : (providerOrKey instanceof EvolutionProvider || providerOrKey?.constructor?.name === 'EvolutionProvider')

  if (isEvolution) {
    const res = await sendOtpEvolution(phone, code)
    if (res.sucesso) {
      return {
        accepted: true,
        channel: 'whatsapp',
        provider: 'evolution',
        externalId: res.whatsappMensagemId || null
      }
    }
    return {
      accepted: false,
      channel: 'whatsapp',
      provider: 'evolution',
      failureCode: res.error || 'FALHA_ENVIO_EVOLUTION'
    }
  } else {
    const res = await sendOtpMeta(phone, code)
    if (res.sucesso) {
      return {
        accepted: true,
        channel: 'whatsapp',
        provider: 'meta',
        externalId: res.whatsappMensagemId || null
      }
    }
    return {
      accepted: false,
      channel: 'whatsapp',
      provider: 'meta',
      failureCode: res.error || 'FALHA_ENVIO_META'
    }
  }
}
