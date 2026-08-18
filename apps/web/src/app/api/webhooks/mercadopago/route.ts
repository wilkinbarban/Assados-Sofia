import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { agendarPedidoNoCalendario, atualizarPedidoNoCalendarioComoPago } from '@/lib/calendar/google'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { allowsIntegrationMock } from '@/lib/runtime/environment'

const MERCADO_PAGO_MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000

function parseMercadoPagoSignature(header: string | null): { timestamp: string; signature: string } | null {
  if (!header) return null

  const entries = new Map(
    header.split(',').map((entry) => {
      const [key, value] = entry.trim().split('=', 2)
      return [key, value]
    })
  )
  const timestamp = entries.get('ts')
  const signature = entries.get('v1')

  return timestamp && signature ? { timestamp, signature } : null
}

function isMercadoPagoSignatureTimestampFresh(timestamp: string): boolean {
  if (!/^\d{10}$|^\d{13}$/.test(timestamp)) return false

  const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp)
  if (!Number.isSafeInteger(timestampMs)) return false

  const receivedAtMs = Date.now()
  return timestampMs <= receivedAtMs && receivedAtMs - timestampMs <= MERCADO_PAGO_MAX_SIGNATURE_AGE_MS
}

export function isMercadoPagoWebhookSignatureValid(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
  secret: string | null,
): boolean {
  if (!xRequestId || !dataId || !secret) return false

  const parsed = parseMercadoPagoSignature(xSignature)
  if (!parsed || !isMercadoPagoSignatureTimestampFresh(parsed.timestamp) || !/^[a-f0-9]{64}$/i.test(parsed.signature)) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parsed.timestamp};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  const received = Buffer.from(parsed.signature, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')

  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer)
}

export function isMercadoPagoAccessTokenConfigured(token: string | undefined): boolean {
  if (!token) return false

  return ![
    'placeholder',
    'insert_here',
    'seu_access_token_mercado_pago_aqui',
    'your_access_token',
  ].some((placeholder) => token.toLowerCase().includes(placeholder))
}

/**
 * Auxiliar para obter um ID ofuscado para logs seguros.
 */
function obfuscateId(id: string | null | undefined): string {
  if (!id) return 'null'
  if (id.length <= 8) return '********'
  return id.substring(0, 8) + '...'
}

/**
 * Executa o processamento do pagamento em background assíncrono.
 * Garante que nenhuma PII ou segredos sejam logados de forma insegura.
 */
async function processarPagamentoBackground(paymentId: string, pedidoIdMock?: string | null) {
  try {
    const paymentIdLog = obfuscateId(paymentId)
    console.log(`[MercadoPago Webhook] [BG] Iniciando processamento do pagamento ${paymentIdLog}`)

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN
    const isPlaceholder = !isMercadoPagoAccessTokenConfigured(token)

    let status: string | null = null
    let pedidoId: string | null = null

    if (isPlaceholder) {
      if (!allowsIntegrationMock()) {
        console.error(`[MercadoPago Webhook] [BG] Credenciais indisponíveis para processar ${paymentIdLog}.`)
        return
      }

      // MOCK MODE
      console.log(`[MercadoPago Webhook] [BG] Rodando em modo MOCK devido a token ausente ou placeholder.`)
      
      if (paymentId.includes('approved')) {
        status = 'approved'
      } else if (paymentId.includes('rejected')) {
        status = 'rejected'
      } else if (paymentId.includes('cancelled')) {
        status = 'cancelled'
      } else {
        // Fallback default
        status = 'approved'
      }

      pedidoId = pedidoIdMock || null
    } else {
      // MODO REAL
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const errorMsg = `HTTP Error ${response.status} ao consultar API do Mercado Pago`
        console.error(`[MercadoPago Webhook] [BG] Falha ao consultar pagamento ${paymentIdLog}: ${errorMsg}`)
        return
      }

      const paymentData = await response.json()
      status = paymentData.status
      pedidoId = paymentData.external_reference
    }

    if (!pedidoId) {
      console.error(`[MercadoPago Webhook] [BG] Cancelando processamento: 'external_reference' (pedidoId) nao encontrado para o pagamento ${paymentIdLog}.`)
      return
    }

    if (!status) {
      console.error(`[MercadoPago Webhook] [BG] Cancelando processamento: 'status' nao encontrado para o pagamento ${paymentIdLog}.`)
      return
    }

    const pedidoIdLog = obfuscateId(pedidoId)
    console.log(`[MercadoPago Webhook] [BG] Pagamento ${paymentIdLog} resolvido. Status: ${status}, Pedido: ${pedidoIdLog}`)

    let statusPagamentoBanco: 'aprovado' | 'rejeitado' | null = null
    let statusPedidoBanco: 'confirmado' | null = null

    if (status === 'approved') {
      statusPagamentoBanco = 'aprovado'
      statusPedidoBanco = 'confirmado'
    } else if (status === 'rejected' || status === 'cancelled') {
      statusPagamentoBanco = 'rejeitado'
    }

    if (!statusPagamentoBanco) {
      console.log(`[MercadoPago Webhook] [BG] Status de pagamento '${status}' nao requer atualizacao para o pedido ${pedidoIdLog}.`)
      return
    }

    // Instanciar admin client para contornar RLS
    const supabaseAdmin = createAdminClient()

    // Preparar payload de atualizacao
    const updatePayload: any = {
      status_pagamento: statusPagamentoBanco,
      mercado_pago_pagamento_id: paymentId,
    }
    if (statusPedidoBanco) {
      updatePayload.status = statusPedidoBanco
    }

    console.log(`[MercadoPago Webhook] [BG] Atualizando pedido ${pedidoIdLog} no banco...`)
    const { data: pedido, error: updateError } = await supabaseAdmin
      .from('pedidos')
      .update(updatePayload)
      .eq('id', pedidoId)
      .is('mercado_pago_pagamento_id', null)
      .select('id, google_event_id')
      .maybeSingle()

    if (updateError) {
      console.error(`[MercadoPago Webhook] [BG] Erro ao atualizar pedido ${pedidoIdLog} no banco: ${updateError?.message || 'Pedido nao encontrado'}`)
      return
    }

    if (!pedido) {
      console.info(`[MercadoPago Webhook] [BG] Notificação duplicada ou pagamento já associado ao pedido ${pedidoIdLog}.`)
      return
    }

    console.log(`[MercadoPago Webhook] [BG] Pedido ${pedidoIdLog} atualizado com sucesso no banco de dados.`)

    // Acoplamento com Google Calendar
    if (status === 'approved') {
      let googleEventId = pedido.google_event_id

      if (!googleEventId) {
        console.log(`[MercadoPago Webhook] [BG] Pedido ${pedidoIdLog} nao possui ID de evento do Google Calendar. Agendando...`)
        // Passando supabaseAdmin para permitir que o agendador leia o pedido burlado pelo RLS
        googleEventId = await agendarPedidoNoCalendario(pedidoId, supabaseAdmin)
        
        if (googleEventId) {
          const { error: updateCalError } = await supabaseAdmin
            .from('pedidos')
            .update({ google_event_id: googleEventId })
            .eq('id', pedidoId)

          if (updateCalError) {
            console.error(`[MercadoPago Webhook] [BG] Erro ao gravar google_event_id no banco para o pedido ${pedidoIdLog}: ${updateCalError.message}`)
          } else {
            console.log(`[MercadoPago Webhook] [BG] Google Event ID ${obfuscateId(googleEventId)} salvo com sucesso para o pedido ${pedidoIdLog}`)
          }
        }
      }

      if (googleEventId) {
        console.log(`[MercadoPago Webhook] [BG] Marcando evento ${obfuscateId(googleEventId)} como PAGO no calendario...`)
        const success = await atualizarPedidoNoCalendarioComoPago(pedidoId, googleEventId)
        if (success) {
          console.log(`[MercadoPago Webhook] [BG] Evento de calendario atualizado para PAGO com sucesso.`)
        } else {
          console.warn(`[MercadoPago Webhook] [BG] Falha ao atualizar evento de calendario para o pedido ${pedidoIdLog}.`)
        }
      }
    }

  } catch (error: any) {
    // Isolamento completo de erros para LGPD e resiliencia de infraestrutura
    console.error(`[MercadoPago Webhook] [BG] Erro critico no loop de background: ${error.message || 'Sem mensagem'}`)
  }
}

/**
 * Route Handler para receber notificacoes HTTP POST do Mercado Pago.
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dataId = searchParams.get('data.id')
    const requestId = request.headers.get('x-request-id')
    const webhookSecret = await obterConfiguracaoSistema('MERCADO_PAGO_WEBHOOK_SECRET')

    if (!isMercadoPagoWebhookSignatureValid(
      request.headers.get('x-signature'),
      requestId,
      dataId,
      webhookSecret,
    )) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!allowsIntegrationMock() && !isMercadoPagoAccessTokenConfigured(process.env.MERCADO_PAGO_ACCESS_TOKEN)) {
      return NextResponse.json({ error: 'payment_processing_unavailable' }, { status: 503 })
    }
    
    // Ler do Query Params
    let topic = searchParams.get('topic') || searchParams.get('type')
    let paymentId = searchParams.get('id') || dataId
    let pedidoIdMock = searchParams.get('pedidoId') || searchParams.get('pedido_id') || searchParams.get('external_reference')

    // Ler do Body
    try {
      const body = await request.clone().json()
      if (body) {
        if (!topic) {
          topic = body.type || body.action
        }
        if (!paymentId) {
          paymentId = body.data?.id || body.id
        }
        if (!pedidoIdMock) {
          pedidoIdMock = body.pedidoId || body.pedido_id || body.external_reference || body.data?.external_reference
        }
      }
    } catch {
      // Ignorar se nao for JSON ou estiver vazio
    }

    const paymentIdStr = paymentId ? String(paymentId) : null

    // Validar se e um topico de pagamento relevante
    const isPaymentTopic = !topic || topic === 'payment' || topic === 'payment.created'

    if (paymentIdStr && isPaymentTopic) {
      if (!requestId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      let admission: { data: boolean | null; error: { message: string } | null }
      try {
        admission = await createAdminClient().rpc('admitir_webhook_mercado_pago', {
          p_request_id: requestId,
          p_payment_id: paymentIdStr,
        })
      } catch {
        return NextResponse.json({ error: 'payment_delivery_unavailable' }, { status: 503 })
      }

      if (admission.error || admission.data === null) {
        return NextResponse.json({ error: 'payment_delivery_unavailable' }, { status: 503 })
      }

      if (!admission.data) {
        return NextResponse.json({ status: 'duplicate' }, { status: 200 })
      }

      // 2.4 Iniciar uma Promise de execucao em background assincrona nao-bloqueante
      processarPagamentoBackground(paymentIdStr, pedidoIdMock).catch((err) => {
        console.error(`[MercadoPago Webhook] [POST] Falha ao disparar background task:`, err)
      })
    } else {
      console.log(`[MercadoPago Webhook] [POST] Notificacao ignorada. Topico: ${topic || 'desconhecido'}, ID: ${obfuscateId(paymentIdStr)}`)
    }

    // 2.3 Responder imediatamente à requisicao do Mercado Pago com HTTP 200 OK
    return NextResponse.json({ status: 'received' }, { status: 200 })
  } catch (error: any) {
    // Garantir que erros de parse de request nao derrubem a rota e responda 200 para evitar retentativas agressivas
    console.error(`[MercadoPago Webhook] [POST] Erro ao tratar requisicao: ${error.message || 'Sem mensagem'}`)
    return NextResponse.json({ status: 'received' }, { status: 200 })
  }
}
