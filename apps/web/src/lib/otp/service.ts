import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCuritibaPhone, maskPhone } from '@/lib/auth/phone'
import { hashOtpCode } from './hash'
import { deliverOtp } from './delivery'
import { OtpPurpose, VerifyOtpResult } from './types'

export interface RequestOtpResult {
  challengeId: string
  expiraEm: string
  channel: string
  provider: string
}

/**
 * Coordena a solicitação, persistência, entrega e ativação de um desafio OTP
 */
export async function requestOtpChallenge(
  phone: string,
  purpose: OtpPurpose,
  ipOrigem?: string,
  userId?: string
): Promise<RequestOtpResult> {
  const canonicalPhone = normalizeCuritibaPhone(phone)
  if (!canonicalPhone) {
    throw new Error('TELEFONE_INVALIDO: O número informado deve ser um celular de Curitiba (DDD 41).')
  }

  // 1. Gerar código OTP de 6 dígitos numéricos aleatórios
  const code = crypto.randomInt(100000, 1000000).toString()
  const codeHash = hashOtpCode(code)

  const supabase = createAdminClient()

  // 2. Solicitar criação do desafio no banco (inicia como pending_delivery)
  const { data: desafioData, error: desafioErr } = await supabase.rpc('solicitar_desafio_otp', {
    p_telefone: canonicalPhone,
    p_proposito: purpose,
    p_hash_codigo: codeHash,
    p_ip_origem: ipOrigem || null,
    p_usuario_id: userId || null
  })

  if (desafioErr) {
    throw new Error(`Erro ao solicitar desafio OTP: ${desafioErr.message}`)
  }

  const desafioRecord = Array.isArray(desafioData) ? desafioData[0] : desafioData
  const challengeId = desafioRecord?.p_desafio_id
  const expiraEm = desafioRecord?.p_expira_em

  if (!challengeId) {
    throw new Error('ID do desafio não gerado pelo banco de dados.')
  }

  // 3. Buscar se cliente tem Telegram verificado para priorização
  let preferredTelegramChatId: string | null = null
  try {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('telegram_chat_id')
      .eq('telefone', canonicalPhone)
      .maybeSingle()

    if (cliente?.telegram_chat_id) {
      preferredTelegramChatId = cliente.telegram_chat_id
    }
  } catch {
    // Prosseguir sem preferência de Telegram
  }

  // 4. Entregar OTP
  const delivery = await deliverOtp(canonicalPhone, code, {
    purpose,
    preferredTelegramChatId
  })

  // 5. Ativar desafio (ou marcar falha de entrega)
  await supabase.rpc('ativar_desafio_otp', {
    p_desafio_id: challengeId,
    p_sucesso: delivery.accepted,
    p_evidencia: delivery,
    p_cooldown_segundos: 60
  })

  if (!delivery.accepted) {
    console.warn(`[OTP Delivery] Falha no despacho para ${maskPhone(canonicalPhone)}: ${delivery.failureCode}`)
    throw new Error(`FALHA_ENTREGA_OTP: ${delivery.failureCode || 'Não foi possível enviar o código de verificação.'}`)
  }

  return {
    challengeId,
    expiraEm: expiraEm || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    channel: delivery.channel,
    provider: delivery.provider
  }
}

/**
 * Valida o código OTP e finaliza o desafio de forma atômica no banco
 */
export async function verifyOtpChallenge(
  challengeId: string,
  phone: string,
  purpose: OtpPurpose,
  code: string,
  options?: { userId?: string; nome?: string; origemVerificacao?: string }
): Promise<VerifyOtpResult> {
  const canonicalPhone = normalizeCuritibaPhone(phone)
  if (!canonicalPhone) {
    return { success: false, error: 'TELEFONE_INVALIDO' }
  }

  const codeHash = hashOtpCode(code)
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('finalizar_desafio_otp', {
    p_desafio_id: challengeId,
    p_telefone: canonicalPhone,
    p_proposito: purpose,
    p_hash_codigo: codeHash,
    p_usuario_id: options?.userId || null,
    p_nome: options?.nome || null,
    p_origem_verificacao: options?.origemVerificacao || 'whatsapp'
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const res = Array.isArray(data) ? data[0] : data
  if (!res?.sucesso) {
    return {
      success: false,
      error: res?.codigo_erro || 'CODIGO_INVALIDO'
    }
  }

  return {
    success: true,
    clienteId: res.cliente_id
  }
}
