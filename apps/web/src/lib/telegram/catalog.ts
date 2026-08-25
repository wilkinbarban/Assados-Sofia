import { formatarPrecoBrl, type ProdutoCardapio } from '@/lib/cardapio/formatar'

const OFFICIAL_COMBO_IDS = [
  'a1111111-1111-4111-8111-111111111111',
  'a2222222-2222-4222-8222-222222222222',
  'a3333333-3333-4333-8333-333333333333',
  'a4444444-4444-4444-8444-444444444444',
] as const

export type TelegramCatalogCallback =
  | { action: 'add'; productId: string }
  | { action: 'details'; productId: string }
  | { action: 'cart' }

export function normalizeTelegramPhotoUrl(value: string | null | undefined, baseUrl: string) {
  if (!value || /\s/.test(value)) return null
  try {
    const url = new URL(value, `${baseUrl.replace(/\/+$/, '')}/`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function selectOfficialTelegramCombos<T extends ProdutoCardapio>(products: T[]): T[] {
  const byId = new Map(products.map((product) => [product.id, product]))
  return OFFICIAL_COMBO_IDS.flatMap((id) => {
    const product = byId.get(id)
    return product ? [product] : []
  })
}

export function buildTelegramCatalogCard(
  product: ProdutoCardapio,
  baseUrl = 'https://casadeasados.duckdns.org',
) {
  return {
    photo: normalizeTelegramPhotoUrl(product.url_imagem, baseUrl),
    caption: [
      `🔥 *${product.nome}*`,
      product.descricao || 'Assado preparado especialmente para o seu domingo.',
      '',
      `💰 *${formatarPrecoBrl(product.preco_centavos)}*`,
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🛒 Adicionar', callback_data: `catalog:add:${product.id}` },
          { text: '👀 Detalhes', callback_data: `catalog:details:${product.id}` },
        ],
        [{ text: '🧺 Ver carrinho', callback_data: 'catalog:cart' }],
      ],
    },
  }
}

export function parseTelegramCatalogCallback(value: string): TelegramCatalogCallback | null {
  if (value === 'catalog:cart') return { action: 'cart' }

  const [scope, action, ...productParts] = value.split(':')
  const productId = productParts.join(':')
  if (scope !== 'catalog' || !productId || (action !== 'add' && action !== 'details')) {
    return null
  }

  return { action, productId }
}
