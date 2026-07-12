import { createAdminClient } from '@/lib/supabase/admin'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { deriveTelegramMessageKey } from '@/lib/telegram/idempotency'

export async function enviarMensagemTelegram(
  conversaId: string,
  payload: { texto: string; remetente: 'ia' | 'operador' }
) {
  const supabase = createAdminClient()

  // 1. Obter a conversa e o telegram_chat_id do cliente
  const { data: conversa, error: conversaError } = await supabase
    .from('conversas')
    .select('id, cliente_id, clientes (telegram_chat_id)')
    .eq('id', conversaId)
    .single()

  if (conversaError || !conversa) {
    throw new Error(`Conversa não encontrada: ${conversaError?.message || 'Sem dados'}`)
  }

  const telegramChatId = (conversa as any).clientes?.telegram_chat_id
  if (!telegramChatId) {
    throw new Error('Telegram Chat ID do cliente não encontrado para esta conversa.')
  }

  // 2. Obter token do bot do Telegram
  const token = await obterConfiguracaoSistema('TELEGRAM_BOT_TOKEN')
  if (!token) {
    throw new Error('Token do bot do Telegram (TELEGRAM_BOT_TOKEN) não configurado no sistema.')
  }

  // 3. Enviar mensagem via API do Telegram
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text: payload.texto,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Erro na API do Telegram: ${response.statusText}. Detalhes: ${JSON.stringify(errorData)}`)
  }

  const data = await response.json()
  if (!data.ok || !data.result || !data.result.message_id) {
    throw new Error('Resposta inválida ou erro retornado pela API do Telegram.')
  }

  const telegramMensagemId = deriveTelegramMessageKey(telegramChatId, data.result.message_id)

  // 4. Inserir a mensagem no banco de dados
  const { data: novaMensagem, error: insertError } = await supabase
    .from('mensagens')
    .insert({
      conversa_id: conversaId,
      remetente: payload.remetente,
      conteudo: payload.texto,
      telegram_mensagem_id: telegramMensagemId,
    })
    .select()
    .single()

  if (insertError) {
    throw new Error(`Erro ao salvar mensagem no banco de dados: ${insertError.message}`)
  }

  return {
    success: true,
    messageId: telegramMensagemId,
    mensagem: novaMensagem,
  }
}

/**
 * Envia um código OTP de verificação via Telegram para um chat_id específico.
 * Usado quando o cliente já possui vínculo com Telegram e prefere receber o código por lá.
 */
export async function enviarOtpTelegram(
  telegramChatId: string,
  codigo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await obterConfiguracaoSistema('TELEGRAM_BOT_TOKEN')
    if (!token) {
      return { success: false, error: 'TELEGRAM_BOT_TOKEN não configurado.' }
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: `🔐 *Código de Verificação — Asados*\n\nSeu código OTP é: *${codigo}*\n\n⏳ Ele expira em *10 minutos*.\n\nSe você não solicitou este código, ignore esta mensagem.`,
        parse_mode: 'Markdown'
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: `Erro na API do Telegram: ${JSON.stringify(errorData)}` }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Telegram OTP] Erro ao enviar:', err)
    return { success: false, error: err.message }
  }
}
