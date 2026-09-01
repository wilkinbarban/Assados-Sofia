import { obterConfiguracaoSistema } from '@/lib/config/sistema'

export interface ProdutoCardapioItem {
  id: string
  nome: string
  descricao?: string | null
  precoCentavos: number
  urlImagem?: string | null
}

export interface EnviarCardapioInput {
  telefone: string
  produtos: ProdutoCardapioItem[]
}

export interface EnviarCardapioResult {
  success: boolean
  modoUtilizado: 'CAROUSEL_NATIVO' | 'BUTTONS_FALLBACK' | 'LIST_FALLBACK' | 'TEXT_FALLBACK'
  error?: string
}

function formatarMoeda(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/**
 * Monta o payload JSON esperado pelo endpoint sendCarousel da Evolution API 2.4.x
 */
export function montarPayloadCarrossel(params: EnviarCardapioInput) {
  const cards = params.produtos.map((p) => {
    const valor = formatarMoeda(p.precoCentavos)
    const icone = p.nome.toLowerCase().includes('costela') ? '🥩' : '🍗'

    return {
      imageUrl: p.urlImagem || 'https://casadeasados.duckdns.org/logo-brasa-sabor.png',
      title: `${icone} ${p.nome}`,
      body: `${p.descricao || 'Assado tradicional no bafo de domingo'}\n\n*Valor:* ${valor}`,
      buttons: [
        {
          type: 'reply',
          displayText: '🛒 Adicionar ao pedido',
          id: `cart:add:${p.id}`,
        },
        {
          type: 'reply',
          displayText: 'ℹ️ Ver detalhes',
          id: `product:details:${p.id}`,
        },
      ],
    }
  })

  return {
    number: params.telefone,
    body: `🔥 *Cardápio Oficial de Domingo — Casa de Assados Brasa & Sabor*\n_Tradição no Umbará • O que vai querer hoje?_`,
    cards,
  }
}

export function montarPayloadBotoes(params: EnviarCardapioInput) {
  return {
    number: params.telefone,
    title: '🔥 Cardápio Oficial de Domingo',
    description: 'Escolha um produto para adicionar ao pedido:',
    footer: 'Casa de Assados Brasa & Sabor · Umbará',
    buttons: params.produtos.slice(0, 3).map((produto) => ({
      type: 'reply',
      displayText: produto.nome.slice(0, 20),
      id: `cart:add:${produto.id}`,
    })),
  }
}

export function montarPayloadLista(params: EnviarCardapioInput) {
  return {
    number: params.telefone,
    title: '🔥 Cardápio Oficial de Domingo',
    description: 'Veja os assados disponíveis e escolha o seu.',
    footerText: 'Casa de Assados Brasa & Sabor · Umbará',
    buttonText: 'Ver cardápio',
    sections: [{
      title: 'Produtos',
      rows: params.produtos.map((produto) => ({
        title: produto.nome.slice(0, 24),
        description: formatarMoeda(produto.precoCentavos),
        rowId: `cart:add:${produto.id}`,
      })),
    }],
  }
}

export function montarPayloadTexto(params: EnviarCardapioInput) {
  const itens = params.produtos.map((produto, index) => [
    `${index + 1}. *${produto.nome}* — ${formatarMoeda(produto.precoCentavos)}`,
    produto.descricao ? `   ${produto.descricao}` : null,
  ].filter(Boolean).join('\n'))

  return {
    number: params.telefone,
    text: [
      '🔥 *Cardápio Oficial de Domingo — Casa de Assados Brasa & Sabor*',
      '',
      ...itens,
      '',
      'Responda *Quero o item N* para adicionar ao pedido.',
    ].join('\n'),
  }
}

async function postEvolution(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  mode: string,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Evolution API rejeitou ${mode} com status ${response.status}${detail ? `: ${detail}` : ''}`,
    )
  }
}

/**
 * Monta os cartões de fallback com foto e texto formatado (estilo Figura 4)
 */
export function montarPayloadCardsFallback(params: EnviarCardapioInput) {
  return params.produtos.map((p, idx) => {
    const valor = formatarMoeda(p.precoCentavos)
    const icone = p.nome.toLowerCase().includes('costela') ? '🥩' : '🍗'

    const caption = [
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `${icone} *${p.nome.toUpperCase()}*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📝 ${p.descricao || 'Assado lentamente com tempero especial de família.'}`,
      `💰 *Preço:* ${valor}`,
      `📍 *Retirada:* Domingo no Balcão Umbará`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `*Ações rápidas:*`,
      `1️⃣ Adicionar ao pedido (digite *"Quero o item ${idx + 1}"*)`,
      `2️⃣ Ver detalhes`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n')

    return {
      imageUrl: p.urlImagem || 'https://casadeasados.duckdns.org/logo-brasa-sabor.png',
      caption,
      produtoId: p.id,
    }
  })
}

/**
 * Envia o cardápio interativo com carrossel nativo e fallback automático em cascata.
 */
export async function enviarCardapioWhatsApp(
  input: EnviarCardapioInput
): Promise<EnviarCardapioResult> {
  const evolutionUrl = await obterConfiguracaoSistema('EVOLUTION_API_URL')
  const evolutionApiKey = await obterConfiguracaoSistema('EVOLUTION_API_KEY')
  const evolutionInstanceName = await obterConfiguracaoSistema('EVOLUTION_INSTANCE_NAME')
  const carouselEnabled = await obterConfiguracaoSistema('WHATSAPP_INTERACTIVE_CAROUSEL_ENABLED')

  if (!evolutionUrl || !evolutionApiKey || !evolutionInstanceName) {
    return {
      success: false,
      modoUtilizado: 'TEXT_FALLBACK',
      error: 'Configurações da Evolution API não encontradas no sistema.',
    }
  }

  const cleanUrl = evolutionUrl.replace(/\/$/, '')
  const headers = {
    apikey: evolutionApiKey,
    'Content-Type': 'application/json',
    Origin: process.env.NEXT_PUBLIC_APP_URL || 'https://casadeasados.duckdns.org',
  }

  // Native carousel stays opt-in until the pinned Evolution image passes the compatibility matrix.
  if (carouselEnabled === 'true') {
    try {
      await postEvolution(
        `${cleanUrl}/message/sendCarousel/${evolutionInstanceName}`,
        headers,
        montarPayloadCarrossel(input),
        'sendCarousel',
      )
      return { success: true, modoUtilizado: 'CAROUSEL_NATIVO' }
    } catch (err: any) {
      console.warn(
        `[WhatsApp Gateway] ${err.message}. Ativando fallback para botões.`,
      )
    }
  }

  try {
    await postEvolution(
      `${cleanUrl}/message/sendButtons/${evolutionInstanceName}`,
      headers,
      montarPayloadBotoes(input),
      'sendButtons',
    )
    return { success: true, modoUtilizado: 'BUTTONS_FALLBACK' }
  } catch (err: any) {
    console.warn(`[WhatsApp Gateway] ${err.message}. Ativando fallback para lista.`)
  }

  try {
    await postEvolution(
      `${cleanUrl}/message/sendList/${evolutionInstanceName}`,
      headers,
      montarPayloadLista(input),
      'sendList',
    )
    return { success: true, modoUtilizado: 'LIST_FALLBACK' }
  } catch (err: any) {
    console.warn(`[WhatsApp Gateway] ${err.message}. Ativando fallback para texto.`)
  }

  try {
    await postEvolution(
      `${cleanUrl}/message/sendText/${evolutionInstanceName}`,
      headers,
      montarPayloadTexto(input),
      'sendText',
    )
    return { success: true, modoUtilizado: 'TEXT_FALLBACK' }
  } catch (err: any) {
    console.error('[WhatsApp Gateway] Nenhum modo conseguiu entregar o cardápio:', err)
    return {
      success: false,
      modoUtilizado: 'TEXT_FALLBACK',
      error: err.message || 'Falha ao entregar cardápio no WhatsApp',
    }
  }
}
