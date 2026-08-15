import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterConfiguracaoSistema, obterSofiaGlobalChannelConfig } from '@/lib/config/sistema'
import { processarRagPipeline } from '@/lib/ai/openrouter'
import { verificarHorarioAtendimento } from '@/lib/horarios/verificar'
import { resolveWhatsAppInboundConversation } from '@/lib/whatsapp/sofia-control'

/**
 * Mask phone number for LGPD compliance in production logs
 */
function maskPhone(phone: string): string {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '')
  if (clean.length <= 8) return '********'
  return clean.slice(0, 5) + '****' + clean.slice(-4)
}

/**
 * Mask customer name for LGPD compliance in production logs
 */
function maskName(name: string): string {
  if (!name) return ''
  const parts = name.split(' ')
  return parts.map(part => part.charAt(0) + '*'.repeat(Math.max(0, part.length - 1))).join(' ')
}


async function resolveWhatsAppPersistenceConversation(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  clienteId: string
): Promise<string> {
  const { data: activeConversation, error: findError } = await supabaseAdmin
    .from('conversas')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('status', 'aberta')
    .order('data_atualizacao', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) {
    throw new Error(`Failed to find persistence conversation: ${findError.message}`)
  }

  if (activeConversation?.id) return activeConversation.id

  const { data: newConversation, error: insertError } = await supabaseAdmin
    .from('conversas')
    .insert({ cliente_id: clienteId, status: 'aberta', ia_ativa: false })
    .select('id')
    .single()

  if (insertError) {
    throw new Error(`Failed to create persistence conversation: ${insertError.message}`)
  }

  return newConversation.id
}

async function sendEvolutionScheduleMessage(phone: string, message: string): Promise<void> {
  const evolutionUrl = await obterConfiguracaoSistema('EVOLUTION_API_URL')
  const evolutionApiKey = await obterConfiguracaoSistema('EVOLUTION_API_KEY')
  const evolutionInstanceName = await obterConfiguracaoSistema('EVOLUTION_INSTANCE_NAME')

  if (!evolutionUrl || !evolutionApiKey || !evolutionInstanceName) return

  const cleanUrl = evolutionUrl.replace(/\/$/, '')
  await fetch(`${cleanUrl}/message/sendText/${evolutionInstanceName}`, {
    method: 'POST',
    headers: {
      'apikey': evolutionApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      number: phone,
      text: message,
      textMessage: { text: message }
    })
  })
}

function isRequestAborted(error: unknown): boolean {
  return error instanceof Error && /aborted/i.test(error.message)
}

export async function POST(request: Request) {
  try {
    // 1. Autenticação por apikey
    const evolutionApiKey = await obterConfiguracaoSistema('EVOLUTION_API_KEY')
    const webhookSecret = await obterConfiguracaoSistema('EVOLUTION_WEBHOOK_SECRET')
    const requestApiKey = request.headers.get('apikey') || request.headers.get('apiKey')
    const requestSecret = new URL(request.url).searchParams.get('webhook_secret')

    const isApiKeyAuthorized = Boolean(evolutionApiKey && requestApiKey === evolutionApiKey)
    const isWebhookSecretAuthorized = Boolean(webhookSecret && requestSecret === webhookSecret)

    if (!isApiKeyAuthorized && !isWebhookSecretAuthorized) {
      console.warn('[Evolution Webhook] Autenticação falhou: credenciais de webhook inválidas.')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parsear corpo da requisição
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // 3. Validar tipo de evento (MESSAGES_UPSERT)
    const event = body.event || ''
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      return NextResponse.json({ success: true, message: `Evento ${event} ignorado` }, { status: 200 })
    }

    const data = body.data
    if (!data || !data.key) {
      return NextResponse.json({ success: true, message: 'Dados da mensagem ausentes' }, { status: 200 })
    }

    // 4. Ignorar mensagens enviadas pelo próprio número (fromMe: true)
    if (data.key.fromMe) {
      return NextResponse.json({ success: true, message: 'Mensagem enviada pelo próprio número ignorada' }, { status: 200 })
    }

    const messageId = data.key.id
    if (!messageId) {
      return NextResponse.json({ success: true, message: 'ID da mensagem ausente' }, { status: 200 })
    }

    const supabaseAdmin = createAdminClient()

    // 5. Idempotência: verificar se whatsapp_mensagem_id já existe
    const { data: mensagemExistente, error: checkError } = await supabaseAdmin
      .from('mensagens')
      .select('id')
      .eq('whatsapp_mensagem_id', messageId)
      .maybeSingle()

    if (checkError) {
      console.error('[Evolution Webhook] Erro ao verificar idempotência:', checkError)
      return NextResponse.json({ error: 'Erro de banco ao verificar idempotência' }, { status: 500 })
    }

    if (mensagemExistente) {
      console.log(`[Evolution Webhook] Mensagem com ID ${messageId} já processada (duplicada). Ignorando.`)
      return NextResponse.json({ success: true, message: 'Mensagem duplicada ignorada' }, { status: 200 })
    }

    // 6. Validar telefone do cliente (Brasil, DDD 41 — Curitiba)
    const remoteJid = data.key.remoteJid || ''
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
      return NextResponse.json({ success: true, message: 'Mensagem de grupo/status ignorada' }, { status: 200 })
    }

    let sanitizedPhone = remoteJid.split('@')[0].replace(/\D/g, '')
    if (sanitizedPhone.length === 11 && sanitizedPhone.startsWith('419')) {
      sanitizedPhone = '55' + sanitizedPhone
    }
    if (sanitizedPhone.length === 12 && sanitizedPhone.startsWith('5541')) {
      // Número sem o prefixo 9 — adiciona o 9 após DDD
      sanitizedPhone = sanitizedPhone.slice(0, 4) + '9' + sanitizedPhone.slice(4)
    }

    const curitibaRegex = /^55419[0-9]{8}$/
    if (!curitibaRegex.test(sanitizedPhone)) {
      console.log(`[Evolution Webhook] Telefone fora do padrão de Curitiba (${maskPhone(sanitizedPhone)}). Descartando silenciosamente.`)
      return NextResponse.json({ success: true, message: 'Telefone fora do padrão descartado silenciosamente' }, { status: 200 })
    }

    // 7. Auto-registro do cliente
    const { data: cliente, error: clientError } = await supabaseAdmin
      .from('clientes')
      .select('id')
      .eq('telefone', sanitizedPhone)
      .maybeSingle()

    if (clientError) {
      console.error('[Evolution Webhook] Erro ao buscar cliente:', clientError)
      return NextResponse.json({ error: 'Erro de banco ao buscar cliente' }, { status: 500 })
    }

    let clienteId: string
    if (!cliente) {
      const profileName = data.pushName || 'Contato Evolution'
      console.log(`[Evolution Webhook] Registrando novo cliente: ${maskName(profileName)} (${maskPhone(sanitizedPhone)})`)
      
      const { data: novoCliente, error: insertClientError } = await supabaseAdmin
        .from('clientes')
        .insert({
          usuario_id: null,
          nome: profileName,
          telefone: sanitizedPhone
        })
        .select('id')
        .single()

      if (insertClientError) {
        console.error('[Evolution Webhook] Erro ao criar cliente:', insertClientError)
        return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 })
      }
      clienteId = novoCliente.id
    } else {
      clienteId = cliente.id
    }

    // 8. Normalização de payloads
    const messageContent = data.message
    let mediaType: string | null = null

    if (messageContent) {
      if (messageContent.imageMessage) {
        mediaType = 'image'
      } else if (messageContent.audioMessage) {
        mediaType = 'audio'
      } else if (messageContent.documentMessage) {
        mediaType = 'document'
      } else if (messageContent.videoMessage) {
        mediaType = 'video'
      }
    }

    const textBody = 
      messageContent?.conversation ||
      messageContent?.extendedTextMessage?.text ||
      ''

    const caption = 
      messageContent?.imageMessage?.caption ||
      messageContent?.documentMessage?.caption ||
      messageContent?.videoMessage?.caption ||
      ''

    const conteudo = textBody || caption || (mediaType ? `[Evolution ${mediaType}]` : null)

    const sofiaGlobalWhatsApp = await obterSofiaGlobalChannelConfig('whatsapp')
    const horarioAtendimento = sofiaGlobalWhatsApp.enabled
      ? await verificarHorarioAtendimento()
      : null
    const shouldBypassSofia = !sofiaGlobalWhatsApp.enabled || (horarioAtendimento && !horarioAtendimento.dentro)
    const inboundResolution = shouldBypassSofia
      ? null
      : await resolveWhatsAppInboundConversation({
          supabase: supabaseAdmin,
          clienteId,
          inboundText: textBody || caption || null,
          source: 'evolution_webhook',
        })
    const conversaId = inboundResolution?.conversaId ?? await resolveWhatsAppPersistenceConversation(supabaseAdmin, clienteId)
    const iaAtiva = inboundResolution?.iaAtiva ?? false

    if (inboundResolution?.sleeping) {
      console.log(`[Evolution Webhook] Sofia dormindo para cliente ${clienteId}. Mensagem roteada para atendimento humano.`)
    }

    // 10. Persistir a mensagem recebida
    const { data: novaMensagem, error: insertMsgError } = await supabaseAdmin
      .from('mensagens')
      .insert({
        conversa_id: conversaId,
        remetente: 'cliente',
        conteudo,
        url_anexo: null,
        whatsapp_mensagem_id: messageId
      })
      .select()
      .single()

    if (insertMsgError) {
      console.error('[Evolution Webhook] Erro ao salvar mensagem:', insertMsgError)
      return NextResponse.json({ error: 'Erro ao salvar mensagem' }, { status: 500 })
    }

    if (!sofiaGlobalWhatsApp.enabled) {
      console.log('[Evolution Webhook] Sofia globally disabled for WhatsApp. Inbound persisted without automation.')
      return NextResponse.json({ success: true, message: 'Sofia globalmente desativada para WhatsApp', data: novaMensagem }, { status: 200 })
    }

    if (horarioAtendimento && !horarioAtendimento.dentro) {
      if (horarioAtendimento.mensagem) {
        try {
          await sendEvolutionScheduleMessage(sanitizedPhone, horarioAtendimento.mensagem)
        } catch (err) {
          console.error('[Evolution Webhook] Erro ao enviar mensagem fora de horário:', err)
        }
      }
      return NextResponse.json({ success: true, message: 'Fora do horário de atendimento', data: novaMensagem }, { status: 200 })
    }

    // 11. Disparar o pipeline RAG se iaAtiva for verdadeira
    if (iaAtiva && conteudo) {
      console.log(`[Evolution Webhook] IA ativa na conversa. Disparando processarRagPipeline em background para conversaId: ${conversaId}`)
      processarRagPipeline(conversaId, conteudo, 'whatsapp').catch((err) => {
        console.error(`[Evolution Webhook] Erro em background ao processar RAG para conversaId ${conversaId}:`, err)
      })
    }

    console.log(`[Evolution Webhook] Mensagem processada e salva com sucesso. ID: ${novaMensagem.id}`)
    return NextResponse.json({
      success: true,
      message: 'Mensagem processada com sucesso',
      data: novaMensagem
    }, { status: 200 })

  } catch (error) {
    if (isRequestAborted(error)) {
      return NextResponse.json({ error: 'Request aborted' }, { status: 499 })
    }

    console.error('[Evolution Webhook] Erro crítico no handler POST:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
