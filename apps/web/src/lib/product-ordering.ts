type OfficiallyOrderedProduct = {
  id: string
  nome: string
  ordem_exibicao: number | null
}

export function moveProduct<T extends { id: string }>(products: T[], draggedId: string, targetId: string): T[] {
  const fromIndex = products.findIndex((product) => product.id === draggedId)
  const toIndex = products.findIndex((product) => product.id === targetId)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return products

  const reordered = [...products]
  const [moved] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, moved)
  return reordered
}

export function buildGlobalProductOrderPayload(products: Array<{ id: string }>) {
  return products.map((product, index) => ({ id: product.id, ordem_exibicao: index + 1 }))
}

export function isProductReorderingDisabled(search: string, filter: string) {
  return search.trim().length > 0 || filter !== 'todos'
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'pt-BR')
}

export function sortProductsByOfficialOrder<T extends OfficiallyOrderedProduct>(products: T[]): T[] {
  return [...products].sort((left, right) => {
    const leftPosition = left.ordem_exibicao && left.ordem_exibicao > 0 ? left.ordem_exibicao : null
    const rightPosition = right.ordem_exibicao && right.ordem_exibicao > 0 ? right.ordem_exibicao : null

    if (leftPosition !== null && rightPosition !== null && leftPosition !== rightPosition) {
      return leftPosition - rightPosition
    }
    if (leftPosition !== null && rightPosition === null) return -1
    if (leftPosition === null && rightPosition !== null) return 1

    return compareText(left.nome, right.nome) || compareText(left.id, right.id)
  })
}
