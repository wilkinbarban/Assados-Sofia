import { extrairAcaoInterativa } from './inbound-normalizer'
import {
  adicionarItemAoCarrinho,
  obterOuCriarCarrinhoAtivo,
  limparCarrinho,
  type CarrinhoCompleto,
} from '@/lib/carrinho/service'

export interface ProcessarAcaoInput {
  clienteId: string
  telefone: string
  interactiveId?: string | null
  supabaseClient?: any
}

export interface ProcessarAcaoOutput {
  handled: boolean
  respostaTexto?: string
  carrinho?: CarrinhoCompleto
  error?: string
}

function formatarMoeda(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatarResumoCarrinho(carrinho: CarrinhoCompleto): string {
  const itens = carrinho.itens_carrinho || []
  if (itens.length === 0) {
    return `🛒 *Seu carrinho está vazio.*\n\nQue tal dar uma olhadinha no nosso cardápio de assados especiais para o domingo?`
  }

  const linhas = itens.map((item, idx) => {
    const nome = item.produtos?.nome || 'Item'
    const total = formatarMoeda(item.preco_total_centavos)
    return `• *${item.quantidade}x ${nome}* — ${total}`
  })

  const totalFormatado = formatarMoeda(carrinho.total_centavos)

  return [
    `🛒 *Seu Carrinho de Pedido:*`,
    ``,
    linhas.join('\n'),
    ``,
    `💰 *Total:* ${totalFormatado}`,
    `⏰ *Retirada:* Domingo (Balcão Umbará)`,
    ``,
    `Para confirmar ou adicionar mais itens, pode me chamar por aqui! 😊`,
  ].join('\n')
}

/**
 * Roteia e executa a ação interativa disparada pelo cliente no WhatsApp.
 */
export async function processarAcaoInterativaWhatsApp(
  input: ProcessarAcaoInput
): Promise<ProcessarAcaoOutput> {
  const acao = extrairAcaoInterativa(input.interactiveId)
  if (!acao) {
    return { handled: false }
  }

  const { scope, action, entityId } = acao

  // 1. Escopo de Carrinho
  if (scope === 'cart') {
    if (action === 'add' && entityId) {
      const res = await adicionarItemAoCarrinho({
        clienteId: input.clienteId,
        produtoId: entityId,
        quantidade: 1,
        canal: 'whatsapp',
        supabaseClient: input.supabaseClient,
      })

      if (!res.success || !res.carrinho) {
        return {
          handled: true,
          error: res.error,
          respostaTexto: `⚠️ Não consegui adicionar o item ao seu carrinho: ${res.error || 'Produto indisponível.'}`,
        }
      }

      const itemAdicionado = res.carrinho.itens_carrinho.find((i) => i.produto_id === entityId)
      const nomeItem = itemAdicionado?.produtos?.nome || 'Produto'
      const valorItem = formatarMoeda(itemAdicionado?.preco_unitario_centavos || 0)
      const totalGeral = formatarMoeda(res.carrinho.total_centavos)

      const resposta = [
        `✅ *${nomeItem}* adicionado ao seu pedido! (${valorItem})`,
        ``,
        `🛒 *Resumo do Pedido:*`,
        ...res.carrinho.itens_carrinho.map(
          (i) => `• ${i.quantidade}x ${i.produtos?.nome || 'Item'} (${formatarMoeda(i.preco_total_centavos)})`
        ),
        ``,
        `💰 *Subtotal Atual:* ${totalGeral}`,
        ``,
        `Deseja adicionar mais algum assado ou já quer escolher o horário de retirada no domingo?`,
      ].join('\n')

      return {
        handled: true,
        carrinho: res.carrinho,
        respostaTexto: resposta,
      }
    }

    if (action === 'view') {
      const res = await obterOuCriarCarrinhoAtivo(input.clienteId, {
        canal: 'whatsapp',
        supabaseClient: input.supabaseClient,
      })

      if (!res.success || !res.carrinho) {
        return {
          handled: true,
          error: res.error,
          respostaTexto: `⚠️ Não foi possível carregar seu carrinho no momento.`,
        }
      }

      return {
        handled: true,
        carrinho: res.carrinho,
        respostaTexto: formatarResumoCarrinho(res.carrinho),
      }
    }

    if (action === 'clear') {
      const res = await limparCarrinho({
        clienteId: input.clienteId,
        supabaseClient: input.supabaseClient,
      })

      return {
        handled: true,
        carrinho: res.carrinho,
        respostaTexto: `🗑️ Seu carrinho foi esvaziado com sucesso. Quando quiser pedir, é só me avisar!`,
      }
    }
  }

  // 2. Escopo de Informações de Produto
  if (scope === 'product' && action === 'details' && entityId) {
    return {
      handled: true,
      respostaTexto: `🍗 *Detalhes do Produto selecionado!*\nPara adicionar ao seu pedido, basta clicar no botão correspondente ou me dizer a quantidade.`,
    }
  }

  // 3. Escopo de Transferência Humana
  if (scope === 'human' && action === 'request') {
    return {
      handled: true,
      respostaTexto: `🙋‍♀️ Entendido! Já estou transferindo sua conversa para a nossa equipe de atendimento no balcão. Um momento, por favor!`,
    }
  }

  return { handled: false }
}
