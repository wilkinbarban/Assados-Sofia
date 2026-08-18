'use server'

import { revalidatePath } from 'next/cache'
import {
  obterOuCriarCarrinhoAtivo,
  obterCarrinhoPorId,
  adicionarItemAoCarrinho,
  removerItemDoCarrinho,
  atualizarQuantidadeItemCarrinho,
  limparCarrinho,
  converterCarrinhoEmPedido,
  type CarrinhoResult,
} from '@/lib/carrinho/service'

export async function actionObterCarrinhoAtivo(clienteId: string): Promise<CarrinhoResult> {
  if (!clienteId) return { success: false, error: 'ID do cliente é obrigatório' }
  return await obterOuCriarCarrinhoAtivo(clienteId)
}

export async function actionObterCarrinhoPorId(carrinhoId: string): Promise<CarrinhoResult> {
  if (!carrinhoId) return { success: false, error: 'ID do carrinho é obrigatório' }
  return await obterCarrinhoPorId(carrinhoId)
}

export async function actionAdicionarItemAoCarrinho(params: {
  clienteId: string
  produtoId: string
  quantidade?: number
  observacoes?: string | null
}): Promise<CarrinhoResult> {
  const res = await adicionarItemAoCarrinho(params)
  if (res.success) {
    revalidatePath('/atendimento')
    revalidatePath('/cliente/pedidos')
  }
  return res
}

export async function actionRemoverItemDoCarrinho(params: {
  clienteId: string
  produtoId: string
}): Promise<CarrinhoResult> {
  const res = await removerItemDoCarrinho(params)
  if (res.success) {
    revalidatePath('/atendimento')
    revalidatePath('/cliente/pedidos')
  }
  return res
}

export async function actionAtualizarQuantidadeItem(params: {
  clienteId: string
  produtoId: string
  quantidade: number
}): Promise<CarrinhoResult> {
  const res = await atualizarQuantidadeItemCarrinho(params)
  if (res.success) {
    revalidatePath('/atendimento')
    revalidatePath('/cliente/pedidos')
  }
  return res
}

export async function actionLimparCarrinho(clienteId: string): Promise<CarrinhoResult> {
  const res = await limparCarrinho({ clienteId })
  if (res.success) {
    revalidatePath('/atendimento')
    revalidatePath('/cliente/pedidos')
  }
  return res
}

export async function actionConverterCarrinhoEmPedido(params: {
  carrinhoId: string
  meioPagamento?: 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'
  horarioRetirada?: string | null
}): Promise<CarrinhoResult> {
  const res = await converterCarrinhoEmPedido(params)
  if (res.success) {
    revalidatePath('/atendimento')
    revalidatePath('/cliente/pedidos')
    revalidatePath('/admin/pedidos')
  }
  return res
}
