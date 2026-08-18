import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'
import { processarRagPipeline } from '@/lib/ai/openrouter'
import { obterConfiguracaoSistema, obterSofiaGlobalChannelConfig } from '@/lib/config/sistema'
import { resolveWhatsAppInboundConversation } from '@/lib/whatsapp/sofia-control'
import { verificarHorarioAtendimento } from '@/lib/horarios/verificar'
import { enviarMensagemWhatsapp } from '@/lib/whatsapp/send'
import { allowsIntegrationMock } from '@/lib/runtime/environment'
import { normalizeCuritibaPhone, maskPhone } from '@/lib/auth/phone'

/**
 * Helper to infer file extension from mime type
 */
function getExtensionFromMime(mimeType: string): string {
  const parts = mimeType.split('/')
  if (parts.length > 1) {
    const sub = parts[1].split(';')[0].toLowerCase()
    if (sub === 'jpeg') return 'jpg'
    if (sub === 'svg+xml') return 'svg'
    if (sub === 'ogg') return 'ogg'
    if (sub === 'plain') return 'txt'
    return sub
  }
  return 'bin'
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

export async function GET(request: Request) {
  try {
    const verifyToken = await obterConfiguracaoSistema('WHATSAPP_VERIFY_TOKEN')
    if (!verifyToken) {
      console.error('[WhatsApp Webhook] WHATSAPP_VERIFY_TOKEN não está configurado.')
      return new Response('Configuration Error', { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp Webhook] Handshake verificado com sucesso!')
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    console.warn('[WhatsApp Webhook] Handshake falhou: tokens não coincidem.')
    return new Response('Forbidden', { status: 403 })
  } catch (error) {
    console.error('[WhatsApp Webhook] Erro no handshake GET:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const appSecret = await obterConfiguracaoSistema('WHATSAPP_APP_SECRET')
    if (!appSecret) {
      console.error('[WhatsApp Webhook] WHATSAPP_APP_SECRET não está configurado.')
      return NextResponse.json({ error: 'Configuração ausente' }, { status: 500 })
    }

    // 1. Ler o raw body para validação de assinatura
    const rawBody = await request.text()

    // 2. Validar assinatura HMAC-SHA256
    const signatureHeader = request.headers.get('x-hub-signature-256')
    const isSecretMissingOrPlaceholder = !appSecret || 
      appSecret.includes('placeholder') || 
      appSecret === 'seu_app_secret_whatsapp_aqui' ||
      appSecret === 'your_app_secret' || 
      appSecret === 'your_whatsapp_app_secret'

    if (isSecretMissingOrPlaceholder && allowsIntegrationMock()) {
      console.warn('[WhatsApp Webhook] Ignorando validação de assinatura HMAC em local/test devido à falta do app secret.')
    } else if (isSecretMissingOrPlaceholder) {
      return NextResponse.json({ error: 'Configuração de assinatura indisponível' }, { status: 503 })
    } else {
      if (!signatureHeader) {
        return NextResponse.json({ error: 'Assinatura x-hub-signature-256 ausente' }, { status: 401 })
      }
      
      const signature = signatureHeader.startsWith('sha256=')
        ? signatureHeader.slice(7)
        : signatureHeader

      const computedHmac = crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex')

      const sigBuffer = Buffer.from(signature, 'hex')
      const computedBuffer = Buffer.from(computedHmac, 'hex')

      let signaturesMatch = false
      if (sigBuffer.length === computedBuffer.length) {
        signaturesMatch = crypto.timingSafeEqual(sigBuffer, computedBuffer)
      }

      if (!signaturesMatch) {
        console.warn('[WhatsApp Webhook] Assinatura inválida detectada.')
        return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
      }
    }

    // 3. Parsear o corpo JSON da requisição
    const body = JSON.parse(rawBody)

    // Meta envia object: 'whatsapp_business_account'
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ success: true, message: 'Objeto ignorado (não é whatsapp_business_account)' }, { status: 200 })
    }

    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value

    if (!value) {
      return NextResponse.json({ success: true, message: 'Payload vazio' }, { status: 200 })
    }

    // 4. Filtrar notificações de status (lida, entregue, etc.)
    if (value.statuses && value.statuses.length > 0) {
      return NextResponse.json({ success: true, message: 'Notificação de status ignorada' }, { status: 200 })
    }

    const message = value.messages?.[0]
    if (!message) {
      return NextResponse.json({ success: true, message: 'Nenhuma mensagem para processar' }, { status: 200 })
    }

    const messageId = message.id
    if (!messageId) {
      return NextResponse.json({ success: true, message: 'Mensagem sem ID ignorada' }, { status: 200 })
    }

    const supabaseAdmin = createAdminClient()

    // 5. Idempotência: verificar se whatsapp_mensagem_id já existe
    const { data: mensagemExistente, error: checkError } = await supabaseAdmin
      .from('mensagens')
      .select('id')
      .eq('whatsapp_mensagem_id', messageId)
      .maybeSingle()

    if (checkError) {
      console.error('[WhatsApp Webhook] Erro ao verificar idempotência:', checkError)
      return NextResponse.json({ error: 'Erro de banco ao verificar idempotência' }, { status: 500 })
    }

    if (mensagemExistente) {
      console.log(`[WhatsApp Webhook] Mensagem com ID ${messageId} já processada (duplicada). Ignorando.`)
      return NextResponse.json({ success: true, message: 'Mensagem duplicada ignorada' }, { status: 200 })
    }

    // 6. Validar telefone do cliente para Curitiba
    const sanitizedPhone = normalizeCuritibaPhone(message.from)
    if (!sanitizedPhone) {
      console.warn(`[WhatsApp Webhook] Telefone fora do padrão de Curitiba (${maskPhone(message.from)}). Descartando silenciosamente.`)
      return NextResponse.json({ success: true, message: 'Telefone fora do padrão descartado silenciosamente' }, { status: 200 })
    }

    // 7. Auto-registro inteligente do cliente
    const { data: cliente, error: clientError } = await supabaseAdmin
      .from('clientes')
      .select('id')
      .eq('telefone', sanitizedPhone)
      .maybeSingle()

    if (clientError) {
      console.error('[WhatsApp Webhook] Erro ao buscar cliente:', clientError)
      return NextResponse.json({ error: 'Erro de banco ao buscar cliente' }, { status: 500 })
    }

    let clienteId: string
    if (!cliente) {
      const profileName = value.contacts?.[0]?.profile?.name || 'Contato WhatsApp'
      console.log(`[WhatsApp Webhook] Registrando novo cliente: ${maskName(profileName)} (${maskPhone(sanitizedPhone)})`)
      
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
        console.error('[WhatsApp Webhook] Erro ao criar cliente:', insertClientError)
        return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 })
      }
      clienteId = novoCliente.id
    } else {
      clienteId = cliente.id
    }

    const textBody = message.text?.body || ''
    const caption = message.image?.caption || message.document?.caption || message.video?.caption || ''
    const sofiaGlobalWhatsApp = await obterSofiaGlobalChannelConfig('whatsapp')
    const horarioAtendimento = sofiaGlobalWhatsApp.enabled
      ? await verificarHorarioAtendimento()
      : null

    // 9. Ingestão de mídias
    let urlAnexo: string | null = null
    const mediaType = message.type // 'image' | 'audio' | 'document' | 'text' etc.
    let mediaId = ''
    let mimeType = ''

    if (mediaType === 'image' && message.image) {
      mediaId = message.image.id
      mimeType = message.image.mime_type
    } else if (mediaType === 'audio' && message.audio) {
      mediaId = message.audio.id
      mimeType = message.audio.mime_type
    } else if (mediaType === 'document' && message.document) {
      mediaId = message.document.id
      mimeType = message.document.mime_type
    }

    if (mediaId) {
      const extension = getExtensionFromMime(mimeType)
      const filename = `${crypto.randomUUID()}.${extension}`

      const accessToken = await obterConfiguracaoSistema('WHATSAPP_ACCESS_TOKEN')
      const isTokenMissingOrPlaceholder = !accessToken ||
        accessToken.includes('placeholder') ||
        accessToken === 'your_access_token' ||
        accessToken === 'your_whatsapp_access_token'

      if (isTokenMissingOrPlaceholder) {
        console.warn('[WhatsApp Webhook] Simulando download de mídia (token ausente ou placeholder)')
        const placeholderContent = `Mock media content for ID: ${mediaId}, Type: ${mediaType}, Mimetype: ${mimeType}`
        const buffer = Buffer.from(placeholderContent, 'utf-8')

        const { error: uploadError } = await supabaseAdmin
          .storage
          .from('chat-midias')
          .upload(filename, buffer, {
            contentType: 'text/plain',
            upsert: true
          })

        if (uploadError) {
          console.error('[WhatsApp Webhook] Erro ao fazer upload de anexo mockado:', uploadError)
        } else {
          urlAnexo = filename
        }
      } else {
        try {
          // Consultar a URL de download na Meta API
          const mediaResponse = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          })

          if (!mediaResponse.ok) {
            throw new Error(`Erro na API de mídia da Meta: ${mediaResponse.statusText}`)
          }

          const mediaInfo = await mediaResponse.json()
          const downloadUrl = mediaInfo.url

          if (!downloadUrl) {
            throw new Error('Nenhuma URL de download retornada pela API de mídia')
          }

          // Efetuar download
          const downloadResponse = await fetch(downloadUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          })

          if (!downloadResponse.ok) {
            throw new Error(`Falha ao baixar binário da mídia: ${downloadResponse.statusText}`)
          }

          // Efetuar download na memória do servidor
          // LGPD compliance: NENHUM arquivo físico é escrito no disco rígido do servidor.
          // Todo o fluxo de download e upload é realizado em memória utilizando ArrayBuffer e Buffer.
          const arrayBuffer = await downloadResponse.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          // Upload no storage privado 'chat-midias'
          const { error: uploadError } = await supabaseAdmin
            .storage
            .from('chat-midias')
            .upload(filename, buffer, {
              contentType: mimeType,
              upsert: true
            })

          if (uploadError) {
            throw uploadError
          }

          urlAnexo = filename
        } catch (err: any) {
          console.error('[WhatsApp Webhook] Erro ao obter/enviar mídia real. Fazendo fallback para mock:', err)
          const fallbackContent = `Fallback mock media content due to error: ${err.message}`
          const buffer = Buffer.from(fallbackContent, 'utf-8')
          const { error: uploadError } = await supabaseAdmin
            .storage
            .from('chat-midias')
            .upload(filename, buffer, {
              contentType: 'text/plain',
              upsert: true
            })

          if (!uploadError) {
            urlAnexo = filename
          }
        }
      }
    }

    // 10. Persistir a mensagem recebida
    const conteudo = textBody || caption || (mediaType ? `[WhatsApp ${mediaType}]` : null)

    const shouldBypassSofia = !sofiaGlobalWhatsApp.enabled || (horarioAtendimento && !horarioAtendimento.dentro)
    const inboundResolution = shouldBypassSofia
      ? null
      : await resolveWhatsAppInboundConversation({
          supabase: supabaseAdmin,
          clienteId,
          inboundText: textBody || caption || null,
          source: 'meta_webhook',
        })
    const conversaId = inboundResolution?.conversaId ?? await resolveWhatsAppPersistenceConversation(supabaseAdmin, clienteId)

    const { data: novaMensagem, error: insertMsgError } = await supabaseAdmin
      .from('mensagens')
      .insert({
        conversa_id: conversaId,
        remetente: 'cliente',
        conteudo,
        url_anexo: urlAnexo,
        whatsapp_mensagem_id: messageId
      })
      .select()
      .single()

    if (insertMsgError) {
      console.error('[WhatsApp Webhook] Erro ao salvar mensagem:', insertMsgError)
      return NextResponse.json({ error: 'Erro ao salvar mensagem' }, { status: 500 })
    }

    if (!sofiaGlobalWhatsApp.enabled) {
      console.log('[WhatsApp Webhook] Sofia globally disabled for WhatsApp. Inbound persisted without automation.')
      return NextResponse.json({ success: true, message: 'Sofia globalmente desativada para WhatsApp', data: novaMensagem }, { status: 200 })
    }

    if (horarioAtendimento && !horarioAtendimento.dentro) {
      if (horarioAtendimento.mensagem) {
        try {
          await enviarMensagemWhatsapp(conversaId, { texto: horarioAtendimento.mensagem, remetente: 'ia' })
        } catch (err) {
          console.error('[WhatsApp Webhook] Erro ao enviar mensagem fora de horário:', err)
        }
      }
      return NextResponse.json({ success: true, message: 'Fora do horário de atendimento', data: novaMensagem }, { status: 200 })
    }

    const iaAtiva = inboundResolution?.iaAtiva ?? false

    if (inboundResolution?.sleeping) {
      console.log(`[WhatsApp Webhook] Sofia dormindo para cliente ${clienteId}. Mensagem roteada para atendimento humano.`)
    }

    // Disparar o pipeline RAG em background (sem await) para responder à Meta imediatamente
    if (iaAtiva && conteudo) {
      console.log(`[WhatsApp Webhook] IA ativa na conversa. Disparando processarRagPipeline em background para conversaId: ${conversaId}`)
      processarRagPipeline(conversaId, conteudo, 'whatsapp').catch((err) => {
        console.error(`[WhatsApp Webhook] Erro em background ao processar RAG para conversaId ${conversaId}:`, err)
      })
    }

    console.log(`[WhatsApp Webhook] Mensagem processada e salva com sucesso. ID: ${novaMensagem.id}`)
    return NextResponse.json({
      success: true,
      message: 'Mensagem processada com sucesso',
      data: novaMensagem
    }, { status: 200 })

  } catch (error) {
    console.error('[WhatsApp Webhook] Erro crítico no handler POST:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
