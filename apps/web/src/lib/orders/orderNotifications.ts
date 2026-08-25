import { createAdminClient } from '@/lib/supabase/admin'
import { enviarMensagemWhatsapp } from '@/lib/whatsapp/send'
import { enviarMensagemTelegram } from '@/lib/telegram/send'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoNotificacaoPedido = 'status_pedido' | 'status_pagamento'

export interface NotificacaoPedidoParams {
  pedidoId: string
  tipo: TipoNotificacaoPedido
  novoStatus?: string
  statusPagamento?: string
  motivo?: string
  supabaseClient?: SupabaseClient
}

export interface ResultadoNotificacaoOmnichannel {
  web: boolean
  whatsapp: boolean
  telegram: boolean
  erros?: string[]
}

function formatarMensagemNotificacao(params: NotificacaoPedidoParams, nomeCliente?: string): string {
  const saudacao = nomeCliente ? `Olá, *${nomeCliente}*!` : 'Olá!'

  if (params.tipo === 'status_pedido') {
    switch (params.novoStatus) {
      case 'confirmado':
        return `${saudacao}\n\n🥩 *Pedido Confirmado!*\nSeu pedido foi aceito pela nossa equipe e já está sendo preparado com todo o carinho e sabor da Casa de Assados Sofia.\n\n⏰ Avisaremos assim que estiver pronto para retirada ou sair para entrega!`
      case 'entregue':
        return `${saudacao}\n\n✨ *Pedido Concluído!*\nSeu pedido foi finalizado com sucesso. Que Deus abençoe a mesa da sua família e tenham uma excelente refeição!\n\nSeu comprovante de venda digital (2ª Via) está disponível no seu painel.`
      case 'cancelado':
        const motivoTxt = params.motivo ? `\n*Motivo:* ${params.motivo}` : ''
        return `${saudacao}\n\n⚠️ *Atualização do Pedido: Cancelado*\nInformamos que seu pedido foi cancelado pelo atendimento.${motivoTxt}\n\nCaso tenha alguma dúvida, fale conosco aqui no chat.`
      default:
        return `${saudacao}\n\n📋 O status do seu pedido foi atualizado para: *${params.novoStatus}*.`
    }
  }

  if (params.tipo === 'status_pagamento') {
    switch (params.statusPagamento) {
      case 'aprovado':
        return `${saudacao}\n\n💳 *Pagamento Confirmado!*\nRecebemos a confirmação do seu pagamento com sucesso. Seu comprovante digital (2ª Via) já foi emitido.`
      case 'rejeitado':
        return `${saudacao}\n\n❌ *Aviso de Pagamento*\nNão conseguimos confirmar o pagamento do seu pedido. Por favor, verifique com nosso atendente para regularizar.`
      case 'reembolsado':
        return `${saudacao}\n\n🔄 *Pagamento Reembolsado*\nO reembolso referente ao seu pedido foi processado pelo atendimento.`
      default:
        return `${saudacao}\n\n💳 O status do pagamento do seu pedido foi atualizado para: *${params.statusPagamento}*.`
    }
  }

  return `${saudacao}\n\nHá uma nova atualização no seu pedido na Casa de Assados Sofia.`
}

/**
 * Despacha notificações em tempo real para todos os canais habilitados do cliente
 * (Web Chat, WhatsApp e Telegram). Não interrompe o fluxo caso um canal externo falhe (fail-safe).
 */
export async function notificarClienteAtualizacaoPedido(
  params: NotificacaoPedidoParams
): Promise<ResultadoNotificacaoOmnichannel> {
  const supabase = params.supabaseClient ?? createAdminClient()
  const resultado: ResultadoNotificacaoOmnichannel = {
    web: false,
    whatsapp: false,
    telegram: false,
    erros: [],
  }

  try {
    // 1. Buscar dados do pedido, cliente e conversa
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select(`
        id,
        conversa_id,
        cliente_id,
        clientes (
          id,
          nome,
          telefone,
          telegram_chat_id
        )
      `)
      .eq('id', params.pedidoId)
      .single()

    if (pedidoError || !pedido) {
      console.warn(`[Order Notifications] Pedido ${params.pedidoId} não encontrado para notificação:`, pedidoError)
      resultado.erros?.push('PEDIDO_NAO_ENCONTRADO')
      return resultado
    }

    const cliente = (pedido as any).clientes
    let conversaId = pedido.conversa_id

    // Se o pedido não tiver conversa_id associada diretamente, buscar a conversa mais recente do cliente
    if (!conversaId && pedido.cliente_id) {
      const { data: conversa } = await supabase
        .from('conversas')
        .select('id')
        .eq('cliente_id', pedido.cliente_id)
        .order('data_atualizacao', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (conversa) {
        conversaId = conversa.id
      }
    }

    const mensagemTexto = formatarMensagemNotificacao(params, cliente?.nome)

    // 2. Canal Web Chat (inserção de mensagem no chat)
    if (conversaId) {
      try {
        const { error: msgError } = await supabase.from('mensagens').insert({
          conversa_id: conversaId,
          remetente: 'operador',
          conteudo: mensagemTexto,
          url_anexo: null,
        })

        if (!msgError) {
          resultado.web = true
        } else {
          resultado.erros?.push(`WEB_ERROR: ${msgError.message}`)
        }
      } catch (err: any) {
        resultado.erros?.push(`WEB_EXCEPTION: ${err.message}`)
      }
    }

    // 3. Canal WhatsApp
    if (conversaId && cliente?.telefone) {
      try {
        const resWhatsapp = await enviarMensagemWhatsapp(conversaId, {
          texto: mensagemTexto,
          remetente: 'operador',
          categoria: 'REACTIVE',
        })
        if (resWhatsapp.sucesso) {
          resultado.whatsapp = true
        } else if (resWhatsapp.motivo) {
          resultado.erros?.push(`WHATSAPP_SKIPPED: ${resWhatsapp.motivo}`)
        }
      } catch (err: any) {
        resultado.erros?.push(`WHATSAPP_EXCEPTION: ${err.message}`)
      }
    }

    // 4. Canal Telegram
    if (conversaId && cliente?.telegram_chat_id) {
      try {
        const resTelegram = await enviarMensagemTelegram(conversaId, {
          texto: mensagemTexto,
          remetente: 'operador',
        })
        if (resTelegram.success) {
          resultado.telegram = true
        }
      } catch (err: any) {
        resultado.erros?.push(`TELEGRAM_EXCEPTION: ${err.message}`)
      }
    }

    return resultado
  } catch (error: any) {
    console.error('[Order Notifications] Falha geral ao notificar cliente:', error)
    resultado.erros?.push(`GLOBAL_ERROR: ${error.message}`)
    return resultado
  }
}
