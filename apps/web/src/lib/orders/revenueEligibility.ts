export type OrderRevenueStatus = 'novo' | 'confirmado' | 'entregue' | 'cancelado'
export type OrderPaymentStatus = 'pendente' | 'aprovado' | 'rejeitado' | 'reembolsado'

export interface OrderRevenueInput {
  id: string
  status: OrderRevenueStatus
  status_pagamento: OrderPaymentStatus
  total_pedido_centavos: number
}

export interface RevenueEligibilityProjection {
  receita_realizada_centavos: number
  elegivel_para_comprovante: boolean
  continuacao:
    | 'MARCAR_PEDIDO_COMO_ENTREGUE'
    | 'APROVAR_PAGAMENTO'
    | 'PEDIDO_NAO_ELEGIVEL_PARA_COMPROVANTE'
    | null
}

export function projetarElegibilidadeReceita(
  pedido: OrderRevenueInput,
): RevenueEligibilityProjection {
  const elegivelParaComprovante =
    pedido.status === 'entregue' && pedido.status_pagamento === 'aprovado'

  if (elegivelParaComprovante) {
    return {
      receita_realizada_centavos: pedido.total_pedido_centavos,
      elegivel_para_comprovante: true,
      continuacao: null,
    }
  }

  if (pedido.status !== 'entregue' && pedido.status !== 'cancelado') {
    return {
      receita_realizada_centavos: 0,
      elegivel_para_comprovante: false,
      continuacao: 'MARCAR_PEDIDO_COMO_ENTREGUE',
    }
  }

  if (pedido.status === 'entregue' && pedido.status_pagamento !== 'aprovado') {
    return {
      receita_realizada_centavos: 0,
      elegivel_para_comprovante: false,
      continuacao: 'APROVAR_PAGAMENTO',
    }
  }

  return {
    receita_realizada_centavos: 0,
    elegivel_para_comprovante: false,
    continuacao: 'PEDIDO_NAO_ELEGIVEL_PARA_COMPROVANTE',
  }
}

export function resumirReceitaRealizada(pedidos: OrderRevenueInput[]) {
  return pedidos.reduce(
    (resumo, pedido) => {
      const projecao = projetarElegibilidadeReceita(pedido)

      if (projecao.elegivel_para_comprovante) {
        resumo.pedidos_realizados += 1
        resumo.receita_realizada_centavos += projecao.receita_realizada_centavos
      } else {
        resumo.pedidos_inelegiveis_para_comprovante += 1
      }

      return resumo
    },
    {
      pedidos_realizados: 0,
      receita_realizada_centavos: 0,
      pedidos_inelegiveis_para_comprovante: 0,
    },
  )
}
