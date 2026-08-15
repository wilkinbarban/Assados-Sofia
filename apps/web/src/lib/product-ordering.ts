type OfficiallyOrderedProduct = {
  id: string
  nome: string
  ordem_exibicao: number | null
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
