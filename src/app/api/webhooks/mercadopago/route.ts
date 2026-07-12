import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { agendarPedidoNoCalendario, atualizarPedidoNoCalendarioComoPago } from '@/lib/calendar/google'

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
    const isPlaceholder = !token || 
      token.includes('placeholder') || 
      token.includes('insert_here') || 
      token.includes('seu_access_token_mercado_pago_aqui') ||
      token.includes('your_access_token')

    let status: string | null = null
    let pedidoId: string | null = null

    if (isPlaceholder) {
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
      status_pagamento: statusPagamentoBanco
    }
    if (statusPedidoBanco) {
      updatePayload.status = statusPedidoBanco
    }

    console.log(`[MercadoPago Webhook] [BG] Atualizando pedido ${pedidoIdLog} no banco...`)
    const { data: pedido, error: updateError } = await supabaseAdmin
      .from('pedidos')
      .update(updatePayload)
      .eq('id', pedidoId)
      .select('id, google_event_id')
      .single()

    if (updateError || !pedido) {
      console.error(`[MercadoPago Webhook] [BG] Erro ao atualizar pedido ${pedidoIdLog} no banco: ${updateError?.message || 'Pedido nao encontrado'}`)
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
    
    // Ler do Query Params
    let topic = searchParams.get('topic') || searchParams.get('type')
    let paymentId = searchParams.get('id') || searchParams.get('data.id')
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
