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
  modoUtilizado: 'CAROUSEL_NATIVO' | 'CARDS_FALLBACK' | 'TEXT_FALLBACK'
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
      image: p.urlImagem || 'https://casadeasados.duckdns.org/logo-casa-de-assados-sofia.svg',
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
          displayText: '👀 Ver detalhes',
          id: `product:details:${p.id}`,
        },
      ],
    }
  })

  return {
    number: params.telefone,
    text: `🔥 *Cardápio Oficial de Domingo — Casa de Assados Sofia*\n_Tradição no Umbará • O que vai querer hoje?_`,
    cards,
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
      imageUrl: p.urlImagem || 'https://casadeasados.duckdns.org/logo-casa-de-assados-sofia.svg',
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

  // 1. Tentar Modo A: Carrusel Nativo (2.4.x) se feature flag estiver ativa
  if (carouselEnabled === 'true') {
    try {
      const carouselPayload = montarPayloadCarrossel(input)
      const res = await fetch(`${cleanUrl}/message/sendCarousel/${evolutionInstanceName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(carouselPayload),
      })

      if (res.ok) {
        return { success: true, modoUtilizado: 'CAROUSEL_NATIVO' }
      }

      console.warn(
        `[WhatsApp Gateway] Carrusel nativo retornou status ${res.status}. Ativando fallback para cartões simulados.`
      )
    } catch (err: any) {
      console.warn(
        `[WhatsApp Gateway] Erro ao enviar carrossel nativo: ${err.message}. Ativando fallback para cartões.`
      )
    }
  }

  // 2. Modo B: Fallback de Cartões Simulados com Fotos de Alta Resolução e Legendas
  try {
    const cards = montarPayloadCardsFallback(input)

    for (const card of cards) {
      await fetch(`${cleanUrl}/message/sendMedia/${evolutionInstanceName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          number: input.telefone,
          media: card.imageUrl,
          mediatype: 'image',
          caption: card.caption,
        }),
      })
    }

    return { success: true, modoUtilizado: 'CARDS_FALLBACK' }
  } catch (err: any) {
    console.error(`[WhatsApp Gateway] Erro no fallback de cartões:`, err)
    return {
      success: false,
      modoUtilizado: 'TEXT_FALLBACK',
      error: err.message || 'Falha ao entregar cardápio no WhatsApp',
    }
  }
}
