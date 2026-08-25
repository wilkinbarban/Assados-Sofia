export interface WebCatalogProduct {
  id: string
  nome: string
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

export function resolveCatalogProduct<T extends WebCatalogProduct>(
  block: string,
  products: T[],
): T | null {
  const marker = block.match(/🔖\s*product:([^\s]+)/i)?.[1]
  if (marker) {
    return products.find((product) => product.id === marker) ?? null
  }

  const normalizedBlock = normalize(block)
  const candidates = products.filter((product) => {
    const normalizedName = normalize(product.nome)
    return normalizedName.length > 0 && (
      normalizedBlock.includes(normalizedName) ||
      normalizedName.includes(normalizedBlock.split('\n')[0])
    )
  })

  return candidates.length === 1 ? candidates[0] : null
}
