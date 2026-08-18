import { createAdminClient } from '@/lib/supabase/admin'
import { allowsIntegrationMock } from '@/lib/runtime/environment'
import { processarRagPipeline } from '@/lib/ai/openrouter'
import { obterConfiguracaoSistema, obterSofiaGlobalChannelConfig } from '@/lib/config/sistema'
import { verificarHorarioAtendimento } from '@/lib/horarios/verificar'
import { deriveTelegramMessageKey } from '@/lib/telegram/idempotency'
import { normalizeCuritibaPhone, maskPhone } from '@/lib/auth/phone'
import { processarStatusContatoInbound } from '@/lib/whatsapp/contact-status'

/**
 * Envia mensagem direta via API do Telegram (sem passar pelo pipeline RAG)
 */
async function enviarMensagemDireta(chatId: string, texto: string): Promise<boolean> {
  try {
    const token = await obterConfiguracaoSistema('TELEGRAM_BOT_TOKEN')
    if (!token) {
      console.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN não configurado para mensagem direta.')
      return false
    }
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto })
    })
    return response.ok
  } catch (err) {
    console.error('[Telegram Webhook] Erro ao enviar mensagem direta:', err)
    return false
  }
}

const MENSAGEM_BOAS_VINDAS = `🍖 *Olá! Seja bem-vindo(a) à Asados!*

Sou a Sofía, assistente virtual da melhor churrascaria de Curitiba. 😊

Para continuar o atendimento e personalizar sua experiência, preciso que você compartilhe seu número de telefone. É rapidinho!

👇 *Toque no botão abaixo para compartilhar:*`



type TelegramMessage = {
  message_id: string | number
  chat: { id: string | number; first_name?: string; username?: string }
  from?: { id?: string | number }
  text?: string
  contact?: { phone_number?: string; first_name?: string; user_id?: string | number }
}

function isOwnTelegramContact(message: TelegramMessage): boolean {
  return Boolean(
    message.contact?.user_id !== undefined &&
      message.from?.id !== undefined &&
      message.contact.user_id === message.from.id
  )
}

function getSafeTelegramMessageContent(message: TelegramMessage, senderName: string): string | null {
  if (message.text) return message.text

  if (message.contact) {
    const contatoNome = message.contact.first_name || senderName
    if (message.contact.phone_number && isOwnTelegramContact(message)) {
      const canonical = normalizeCuritibaPhone(message.contact.phone_number) || message.contact.phone_number
      return `[📱 Contact shared: ${contatoNome} — +${canonical}]`
    }
    return `[📱 Contact shared without verified ownership: ${contatoNome}]`
  }

  return null
}

async function resolveTelegramConversation(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  clienteId: string
): Promise<{ conversationId: string; iaAtiva: boolean }> {
  const { data: activeConv, error: convError } = await supabaseAdmin
    .from('conversas')
    .select('id, ia_ativa')
    .eq('cliente_id', clienteId)
    .neq('status', 'fechada')
    .order('data_atualizacao', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (convError) {
    throw new Error(`Erro ao buscar conversa: ${convError.message}`)
  }

  if (activeConv?.id) {
    return { conversationId: activeConv.id, iaAtiva: activeConv.ia_ativa ?? false }
  }

  const { data: newConv, error: insertConvError } = await supabaseAdmin
    .from('conversas')
    .insert({ cliente_id: clienteId, status: 'ia_atendendo', ia_ativa: true })
    .select('id, ia_ativa')
    .single()

  if (insertConvError) {
    throw new Error(`Erro ao criar conversa: ${insertConvError.message}`)
  }

  return { conversationId: newConv.id, iaAtiva: newConv.ia_ativa ?? true }
}

async function validateTelegramWebhookSecret(request: Request): Promise<boolean> {
  const expectedSecret = await obterConfiguracaoSistema('TELEGRAM_WEBHOOK_SECRET_TOKEN')

  if (!expectedSecret) {
    if (allowsIntegrationMock()) {
      console.warn('[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET_TOKEN is not configured; accepting webhook in local/test mode.')
      return true
    }

    console.error('[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET_TOKEN is required outside local/test mode.')
    return false
  }

  return request.headers.get('x-telegram-bot-api-secret-token') === expectedSecret
}

export async function POST(request: Request) {
  try {
    // Telegram secret validation must happen before request.json() so rejected requests do not process the update body.
    const isAuthorized = await validateTelegramWebhookSecret(request)
    if (!isAuthorized) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const message = body.message as TelegramMessage | undefined

    if (!message) {
      return Response.json({ ok: true })
    }

    const telegramChatId = message.chat.id.toString()
    const senderName = message.chat.first_name || message.chat.username || 'Cliente Telegram'
    const messageId = message.message_id.toString()
    const telegramMessageKey = deriveTelegramMessageKey(telegramChatId, messageId)

    const supabaseAdmin = createAdminClient()

    // ── IDEMPOTÊNCIA ──────────────────────────────────────────
    const { data: existingMessage, error: findError } = await supabaseAdmin
      .from('mensagens')
      .select('id')
      .eq('telegram_mensagem_id', telegramMessageKey)
      .maybeSingle()

    if (findError) {
      console.error('[Telegram Webhook] Erro ao buscar mensagem para idempotência:', findError)
      return Response.json({ ok: false, error: 'Erro ao verificar idempotência' }, { status: 500 })
    }

    if (existingMessage) {
      return Response.json({ ok: true, status: 'duplicate' })
    }

    // ── BUSCAR OU CRIAR CLIENTE ───────────────────────────────
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clientes')
      .select('id, telefone')
      .eq('telegram_chat_id', telegramChatId)
      .maybeSingle()

    if (clientError) {
      console.error('[Telegram Webhook] Erro ao buscar cliente:', clientError)
      return Response.json({ ok: false, error: 'Erro ao buscar cliente' }, { status: 500 })
    }

    let clienteId = client?.id
    let telefoneExistente = client?.telefone || null
    let isNewClient = false

    if (!clienteId) {
      const { data: newClient, error: insertClientError } = await supabaseAdmin
        .from('clientes')
        .insert({
          nome: senderName,
          telegram_chat_id: telegramChatId,
          telefone: null
        })
        .select('id')
        .single()

      if (insertClientError) {
        console.error('[Telegram Webhook] Erro ao criar cliente:', insertClientError)
        return Response.json({ ok: false, error: 'Erro ao criar cliente' }, { status: 500 })
      }
      clienteId = newClient.id
      isNewClient = true
    }

    const sofiaGlobalTelegram = await obterSofiaGlobalChannelConfig('telegram')
    if (!sofiaGlobalTelegram.enabled) {
      const safeContent = getSafeTelegramMessageContent(message, senderName)
      if (safeContent) {
        try {
          const { conversationId } = await resolveTelegramConversation(supabaseAdmin, clienteId)
          const { error: insertGlobalOffError } = await supabaseAdmin
            .from('mensagens')
            .insert({
              conversa_id: conversationId,
              remetente: 'cliente',
              conteudo: safeContent,
              telegram_mensagem_id: telegramMessageKey
            })

          if (insertGlobalOffError) {
            console.error('[Telegram Webhook] Erro ao salvar mensagem com Sofia globalmente desativada:', insertGlobalOffError)
            return Response.json({ ok: false, error: 'Erro ao salvar mensagem' }, { status: 500 })
          }
        } catch (conversationError: any) {
          console.error('[Telegram Webhook] Erro ao preparar conversa com Sofia globalmente desativada:', conversationError)
          return Response.json({ ok: false, error: conversationError.message || 'Erro ao preparar conversa' }, { status: 500 })
        }
      }

      console.log('[Telegram Webhook] Sofia globally disabled for Telegram. Inbound persisted without automation.')
      return Response.json({ ok: true, status: 'global_off' })
    }

    const horario = await verificarHorarioAtendimento()

    if (!horario.dentro) {
      const safeContent = getSafeTelegramMessageContent(message, senderName)
      if (safeContent) {
        try {
          const { conversationId } = await resolveTelegramConversation(supabaseAdmin, clienteId)
          const { error: insertOutOfHoursError } = await supabaseAdmin
            .from('mensagens')
            .insert({
              conversa_id: conversationId,
              remetente: 'cliente',
              conteudo: safeContent,
              telegram_mensagem_id: telegramMessageKey
            })

          if (insertOutOfHoursError) {
            console.error('[Telegram Webhook] Erro ao salvar mensagem fora de horário:', insertOutOfHoursError)
            return Response.json({ ok: false, error: 'Erro ao salvar mensagem' }, { status: 500 })
          }
        } catch (conversationError: any) {
          console.error('[Telegram Webhook] Erro ao preparar conversa fora de horário:', conversationError)
          return Response.json({ ok: false, error: conversationError.message || 'Erro ao preparar conversa' }, { status: 500 })
        }

        await enviarMensagemDireta(telegramChatId, horario.mensagem!)
      }
      return Response.json({ ok: true, status: 'out_of_hours' })
    }

    // ── TRATAR COMPARTILHAMENTO DE CONTATO ────────────────────
    if (message.contact && message.contact.phone_number) {
      const contatoNome = message.contact.first_name || senderName
      const contactIsOwnedBySender = isOwnTelegramContact(message)
      const safeContactDisplay = contactIsOwnedBySender
        ? `[📱 Contact shared: ${contatoNome} — +${normalizeCuritibaPhone(message.contact.phone_number) || message.contact.phone_number}]`
        : `[📱 Contact shared without verified ownership: ${contatoNome}]`

      if (contactIsOwnedBySender) {
        const telefoneNormalizado = normalizeCuritibaPhone(message.contact.phone_number)

        if (telefoneNormalizado) {
          console.log(`[Telegram Webhook] Verified contact shared: ${contatoNome} (${maskPhone(telefoneNormalizado)})`)

          // Atualizar telefone e metadados de verificação explícita no registro do cliente
          const { error: updatePhoneError } = await supabaseAdmin
            .from('clientes')
            .update({
              telefone: telefoneNormalizado,
              nome: contatoNome,
              telefone_verificado_em: new Date().toISOString(),
              telefone_verificado_origem: 'telegram',
              data_atualizacao: new Date().toISOString()
            })
            .eq('id', clienteId)

          if (updatePhoneError) {
            console.error('[Telegram Webhook] Erro ao salvar telefone do contato:', updatePhoneError)
            return Response.json({ ok: false, error: 'Erro ao salvar telefone' }, { status: 500 })
          }

          telefoneExistente = telefoneNormalizado
        } else {
          console.warn('[Telegram Webhook] Telefone fora do padrão de Curitiba:', maskPhone(message.contact.phone_number))
        }
      } else {
        console.warn('[Telegram Webhook] Contact ignored because Telegram ownership could not be verified.', {
          chatId: telegramChatId,
          messageId,
          contactUserId: message.contact.user_id,
          senderUserId: message.from?.id,
        })
      }

      // ── BUSCAR OU CRIAR CONVERSA ───────────────────────────
      let conversationId: string
      let iaAtiva: boolean
      try {
        const resolvedConversation = await resolveTelegramConversation(supabaseAdmin, clienteId)
        conversationId = resolvedConversation.conversationId
        iaAtiva = resolvedConversation.iaAtiva
      } catch (conversationError: any) {
        console.error('[Telegram Webhook] Erro ao resolver conversa:', conversationError)
        return Response.json({ ok: false, error: conversationError.message || 'Erro ao resolver conversa' }, { status: 500 })
      }

      // Salvar mensagem do contato
      const { error: insertMsgError } = await supabaseAdmin
        .from('mensagens')
        .insert({
          conversa_id: conversationId,
          remetente: 'cliente',
          conteudo: safeContactDisplay,
          telegram_mensagem_id: telegramMessageKey
        })

      if (insertMsgError) {
        console.error('[Telegram Webhook] Erro ao salvar mensagem de contato:', insertMsgError)
        return Response.json({ ok: false, error: 'Erro ao salvar mensagem' }, { status: 500 })
      }

      if (!contactIsOwnedBySender) {
        return Response.json({ ok: true, status: 'contact_unverified' })
      }

      // Responder com confirmação e disparar RAG
      await enviarMensagemDireta(telegramChatId,
        `✅ *Obrigado, ${contatoNome}!* Seu número foi registrado.

Como posso te ajudar com o churrasco hoje? 🥩`
      )

      if (iaAtiva) {
        processarRagPipeline(conversationId, safeContactDisplay, 'telegram').catch((err) => {
          console.error('[Telegram Webhook] Erro no RAG após contato:', err)
        })
      }

      return Response.json({ ok: true })
    }

    // ── MENSAGEM DE TEXTO ─────────────────────────────────────
    if (!message.text) {
      return Response.json({ ok: true })
    }

    const messageText = message.text

    // ── NOVO CLIENTE SEM TELEFONE → Pedir contato ────────────
    if (isNewClient || !telefoneExistente) {
      console.log(`[Telegram Webhook] Novo cliente sem telefone (${senderName}). Solicitando contato.`)

      try {
        const { conversationId } = await resolveTelegramConversation(supabaseAdmin, clienteId)
        const { error: insertMissingPhoneError } = await supabaseAdmin
          .from('mensagens')
          .insert({
            conversa_id: conversationId,
            remetente: 'cliente',
            conteudo: messageText,
            telegram_mensagem_id: telegramMessageKey
          })

        if (insertMissingPhoneError) {
          console.error('[Telegram Webhook] Erro ao salvar mensagem antes de solicitar telefone:', insertMissingPhoneError)
          return Response.json({ ok: false, error: 'Erro ao salvar mensagem' }, { status: 500 })
        }
      } catch (conversationError: any) {
        console.error('[Telegram Webhook] Erro ao preparar conversa para solicitar telefone:', conversationError)
        return Response.json({ ok: false, error: conversationError.message || 'Erro ao preparar conversa' }, { status: 500 })
      }

      await enviarMensagemDireta(telegramChatId, MENSAGEM_BOAS_VINDAS)

      // Também enviar um keyboard button para facilitar o compartilhamento
      try {
        const token = await obterConfiguracaoSistema('TELEGRAM_BOT_TOKEN')
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: 'Toque no botão abaixo para compartilhar:',
              reply_markup: {
                keyboard: [[{ text: '📱 Compartilhar meu número', request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            })
          })
        }
      } catch (err) {
        console.error('[Telegram Webhook] Erro ao enviar keyboard de contato:', err)
      }

      return Response.json({ ok: true })
    }

    // ── CLIENTE EXISTENTE COM TELEFONE → Fluxo normal ────────
    let conversationId: string
    let iaAtiva: boolean
    try {
      const resolvedConversation = await resolveTelegramConversation(supabaseAdmin, clienteId)
      conversationId = resolvedConversation.conversationId
      iaAtiva = resolvedConversation.iaAtiva
    } catch (conversationError: any) {
      console.error('[Telegram Webhook] Erro ao resolver conversa:', conversationError)
      return Response.json({ ok: false, error: conversationError.message || 'Erro ao resolver conversa' }, { status: 500 })
    }

    // Salvar mensagem do cliente
    const { error: insertMessageError } = await supabaseAdmin
      .from('mensagens')
      .insert({
        conversa_id: conversationId,
        remetente: 'cliente',
        conteudo: messageText,
        telegram_mensagem_id: telegramMessageKey
      })

    if (insertMessageError) {
      console.error('[Telegram Webhook] Erro ao inserir mensagem:', insertMessageError)
      return Response.json({ ok: false, error: 'Erro ao salvar mensagem' }, { status: 500 })
    }

    // Processar Governança de Contatos (Opt-In / Opt-Out / Candidatos / Timestamps)
    const statusContato = await processarStatusContatoInbound(supabaseAdmin, clienteId, messageText)

    if (statusContato.suprimirSofia) {
      console.log(`[Telegram Webhook] Sofia suprimida por solicitação de opt-out para cliente ${clienteId}.`)
      if (statusContato.mensagemRespostaCurta) {
        try {
          await enviarMensagemDireta(telegramChatId, statusContato.mensagemRespostaCurta)
          await supabaseAdmin.from('mensagens').insert({
            conversa_id: conversationId,
            remetente: 'ia',
            conteudo: statusContato.mensagemRespostaCurta,
          })
        } catch (err) {
          console.error('[Telegram Webhook] Erro ao enviar resposta curta de opt-out:', err)
        }
      }
      return Response.json({ ok: true, message: 'Opt-out processado' })
    }

    // Disparar pipeline RAG
    if (iaAtiva) {
      processarRagPipeline(conversationId, messageText, 'telegram').catch((err) => {
        console.error('[Telegram Webhook] Erro no processarRagPipeline:', err)
      })
    }

    return Response.json({ ok: true })
  } catch (err: any) {
    console.error('[Telegram Webhook] Erro crítico:', err)
    return Response.json({ ok: false, error: err.message || 'Erro interno' }, { status: 500 })
  }
}
