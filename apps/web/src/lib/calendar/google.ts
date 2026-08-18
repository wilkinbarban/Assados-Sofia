import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { allowsIntegrationMock } from '@/lib/runtime/environment'

/**
 * Agenda um pedido confirmado no Google Calendar.
 * Retorna o ID do evento agendado ou null em caso de erro ou modo mock.
 */
export async function agendarPedidoNoCalendario(pedidoId: string, supabaseClient?: any): Promise<string | null> {
  try {
    const clientEmail = await obterConfiguracaoSistema('GOOGLE_CLIENT_EMAIL')
    const privateKey = await obterConfiguracaoSistema('GOOGLE_PRIVATE_KEY')
    const calendarId = await obterConfiguracaoSistema('GOOGLE_CALENDAR_ID')

    const isMockMode =
      !clientEmail ||
      !privateKey ||
      !calendarId ||
      clientEmail.includes('placeholder') ||
      privateKey.includes('placeholder') ||
      calendarId.includes('placeholder')

    if (isMockMode) {
      if (!allowsIntegrationMock()) {
        console.error('[Google Calendar] Credenciais ausentes ou inválidas para este ambiente.')
        return null
      }

      console.warn('[Google Calendar] Servidor rodando em modo MOCK. Credenciais de calendário ausentes ou placeholders.')
      // Simula latência de rede conforme requisito (200ms)
      await new Promise((resolve) => setTimeout(resolve, 200))
      return `mock-event-id-${crypto.randomUUID()}`
    }

    // Busca detalhes do pedido no banco de dados
    const supabase = supabaseClient || (await createClient())
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        status,
        tipo_entrega,
        endereco_entrega,
        taxa_entrega_centavos,
        total_produtos_centavos,
        total_pedido_centavos,
        meio_pagamento,
        clientes:cliente_id (
          id,
          nome,
          telefone
        ),
        itens:itens_pedido (
          id,
          quantidade,
          preco_unitario_centavos,
          produtos:produto_id (
            nome
          )
        )
      `)
      .eq('id', pedidoId)
      .single()

    if (error || !pedido) {
      console.error(`[Google Calendar] Erro ao buscar pedido no banco de dados para agendamento. Código: ${error?.code || 'DESCONHECIDO'}`)
      return null
    }

    const cliente = pedido.clientes as any
    const itens = (pedido.itens || []) as any[]

    const formatarMoeda = (centavos: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
    }

    const idCurto = pedidoId.substring(0, 8)
    const nomeCliente = cliente?.nome || 'Cliente'
    const tipoEntregaStr = pedido.tipo_entrega === 'entrega' ? 'Entrega' : 'Retirada'
    const tituloEvento = `Pedido #${idCurto} - ${nomeCliente} (${tipoEntregaStr})`

    // Mapeamento em português
    const itensStr = itens
      .map((item) => {
        const prodNome = item.produtos?.nome || 'Produto'
        const unitario = formatarMoeda(item.preco_unitario_centavos)
        const subtotal = formatarMoeda(item.preco_unitario_centavos * item.quantidade)
        return `- ${item.quantidade}x ${prodNome} (${unitario}) - Subtotal: ${subtotal}`
      })
      .join('\n')

    // Ofuscação de telefone para privacidade nos logs, mas no calendar salvamos formatado.
    // Telefone cru de Curitiba: 55419XXXXXXXX
    const telefoneFormatado = cliente?.telefone
      ? cliente.telefone.replace(/^55(\d{2})(\d{9})$/, '+$1 ($2)')
      : 'Não informado'

    const descricaoEvento = `DETALHES DO PEDIDO #${idCurto}

Cliente: ${nomeCliente}
Telefone: ${telefoneFormatado}
Tipo de Entrega: ${tipoEntregaStr}
Endereço: ${pedido.endereco_entrega || 'Retirada no local'}
Meio de Pagamento: ${pedido.meio_pagamento.toUpperCase()}

ITENS DO PEDIDO:
${itensStr}

Taxa de Entrega: ${formatarMoeda(pedido.taxa_entrega_centavos)}
Valor Total do Pedido: ${formatarMoeda(pedido.total_pedido_centavos)}
`

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey!.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar']
    })

    const calendar = google.calendar({ version: 'v3', auth })

    const start = new Date()
    const end = new Date(start.getTime() + 60 * 60 * 1000) // 1 hora de duração

    const event = {
      summary: tituloEvento,
      description: descricaoEvento,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
    }

    const response = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: event,
    })

    return response.data.id || null
  } catch (err: any) {
    // Isolamento total: erros de rede/API não quebram o fluxo e não expõem PII
    console.error(`[Google Calendar] Falha no agendamento do pedido. Operação continua de forma resiliente. Erro: ${err.message || 'SEM_MENSAGEM'}`)
    return null
  }
}

/**
 * Atualiza o título de um evento existente no Google Calendar para incluir o prefixo [PAGO].
 * Retorna true se a atualização foi bem-sucedida ou no modo mock.
 */
export async function atualizarPedidoNoCalendarioComoPago(
  pedidoId: string,
  googleEventId: string
): Promise<boolean> {
  try {
    const clientEmail = await obterConfiguracaoSistema('GOOGLE_CLIENT_EMAIL')
    const privateKey = await obterConfiguracaoSistema('GOOGLE_PRIVATE_KEY')
    const calendarId = await obterConfiguracaoSistema('GOOGLE_CALENDAR_ID')

    const isMockMode =
      !clientEmail ||
      !privateKey ||
      !calendarId ||
      clientEmail.includes('placeholder') ||
      privateKey.includes('placeholder') ||
      calendarId.includes('placeholder')

    if (isMockMode) {
      if (!allowsIntegrationMock()) {
        console.error('[Google Calendar] Credenciais ausentes ou inválidas para este ambiente.')
        return false
      }

      console.warn('[Google Calendar] Servidor rodando em modo MOCK. Credenciais ausentes para atualizar evento.')
      // Simula latência de rede conforme requisito (200ms)
      await new Promise((resolve) => setTimeout(resolve, 200))
      return true
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey!.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar']
    })

    const calendar = google.calendar({ version: 'v3', auth })

    // Obter o evento atual para ler o summary original
    const eventResponse = await calendar.events.get({
      calendarId: calendarId,
      eventId: googleEventId,
    })

    const summaryOriginal = eventResponse.data.summary || ''
    
    // Se já contém [PAGO], não precisa atualizar
    if (summaryOriginal.includes('[PAGO]')) {
      return true
    }

    const novoSummary = `[PAGO] ${summaryOriginal}`

    await calendar.events.patch({
      calendarId: calendarId,
      eventId: googleEventId,
      requestBody: {
        summary: novoSummary,
      },
    })

    return true
  } catch (err: any) {
    // Isolamento total: erros de rede/API não quebram o fluxo e não expõem PII
    console.error(`[Google Calendar] Falha ao atualizar evento do pedido para PAGO. Operação continua de forma resiliente. Erro: ${err.message || 'SEM_MENSAGEM'}`)
    return false
  }
}
