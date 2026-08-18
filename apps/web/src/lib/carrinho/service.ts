import { createAdminClient } from '@/lib/supabase/admin'

export interface ItemCarrinho {
  id: string
  carrinho_id: string
  produto_id: string
  quantidade: number
  preco_unitario_centavos: number
  preco_total_centavos: number
  observacoes?: string | null
  produtos?: {
    id?: string
    nome: string
    descricao?: string | null
    url_imagem?: string | null
    preco_centavos?: number
    ativo?: boolean
  }
  data_criacao?: string
  data_atualizacao?: string
}

export interface Carrinho {
  id: string
  cliente_id: string
  conversa_id?: string | null
  canal: 'whatsapp' | 'telegram' | 'web'
  status: 'aberto' | 'convertido' | 'cancelado' | 'expirado'
  subtotal_centavos: number
  desconto_centavos: number
  taxa_entrega_centavos: number
  total_centavos: number
  tipo_entrega: 'retirada' | 'entrega'
  horario_retirada?: string | null
  observacoes?: string | null
  data_expiracao?: string
  data_criacao?: string
  data_atualizacao?: string
}

export interface CarrinhoCompleto extends Carrinho {
  itens_carrinho: ItemCarrinho[]
}

export interface ObterCarrinhoOptions {
  canal?: 'whatsapp' | 'telegram' | 'web'
  conversaId?: string | null
  supabaseClient?: any
}

export interface AdicionarItemInput {
  clienteId: string
  produtoId: string
  quantidade?: number
  observacoes?: string | null
  canal?: 'whatsapp' | 'telegram' | 'web'
  conversaId?: string | null
  supabaseClient?: any
}

export interface RemoverItemInput {
  clienteId: string
  produtoId: string
  supabaseClient?: any
}

export interface AtualizarQuantidadeInput {
  clienteId: string
  produtoId: string
  quantidade: number
  supabaseClient?: any
}

export interface LimparCarrinhoInput {
  clienteId: string
  supabaseClient?: any
}

export interface ConverterCarrinhoInput {
  carrinhoId: string
  meioPagamento?: 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'
  horarioRetirada?: string | null
  supabaseClient?: any
}

export interface CarrinhoResult {
  success: boolean
  carrinho?: CarrinhoCompleto
  error?: string
  pedidoId?: string
  totalCentavos?: number
}

function getSupabase(override?: any) {
  return override || createAdminClient()
}

/**
 * Obtém o carrinho com status 'aberto' do cliente ou cria um novo se não existir.
 */
export async function obterOuCriarCarrinhoAtivo(
  clienteId: string,
  options?: ObterCarrinhoOptions
): Promise<CarrinhoResult> {
  const supabase = getSupabase(options?.supabaseClient)

  try {
    // 1. Buscar carrinho aberto existente
    const { data: cartExistente, error: findError } = await supabase
      .from('carrinhos')
      .select('*, itens_carrinho(*, produtos(id, nome, descricao, url_imagem, preco_centavos, ativo))')
      .eq('cliente_id', clienteId)
      .eq('status', 'aberto')
      .maybeSingle()

    if (findError) {
      return { success: false, error: `Erro ao buscar carrinho ativo: ${findError.message}` }
    }

    if (cartExistente) {
      return { success: true, carrinho: cartExistente as CarrinhoCompleto }
    }

    // 2. Criar novo carrinho aberto se não houver
    const canal = options?.canal || 'whatsapp'
    const conversaId = options?.conversaId || null

    const { data: novoCarrinho, error: insertError } = await supabase
      .from('carrinhos')
      .insert({
        cliente_id: clienteId,
        conversa_id: conversaId,
        canal,
        status: 'aberto',
        subtotal_centavos: 0,
        desconto_centavos: 0,
        taxa_entrega_centavos: 0,
        total_centavos: 0,
        tipo_entrega: 'retirada',
      })
      .select()
      .single()

    if (insertError) {
      return { success: false, error: `Erro ao criar carrinho: ${insertError.message}` }
    }

    return {
      success: true,
      carrinho: {
        ...novoCarrinho,
        itens_carrinho: [],
      } as CarrinhoCompleto,
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro inesperado ao obter/criar carrinho' }
  }
}

/**
 * Recarrega e retorna o carrinho completo com seus itens e produtos associados.
 */
export async function obterCarrinhoPorId(
  carrinhoId: string,
  supabaseClient?: any
): Promise<CarrinhoResult> {
  const supabase = getSupabase(supabaseClient)

  try {
    const { data: carrinho, error } = await supabase
      .from('carrinhos')
      .select('*, itens_carrinho(*, produtos(id, nome, descricao, url_imagem, preco_centavos, ativo))')
      .eq('id', carrinhoId)
      .single()

    if (error || !carrinho) {
      return { success: false, error: error?.message || 'Carrinho não encontrado' }
    }

    return { success: true, carrinho: carrinho as CarrinhoCompleto }
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao obter carrinho' }
  }
}

/**
 * Adiciona um produto ao carrinho ativo do cliente, lendo o preço oficial do banco.
 */
export async function adicionarItemAoCarrinho(
  input: AdicionarItemInput
): Promise<CarrinhoResult> {
  const supabase = getSupabase(input.supabaseClient)
  const quantidade = input.quantidade && input.quantidade > 0 ? input.quantidade : 1

  try {
    // 1. Obter ou criar carrinho ativo
    const cartRes = await obterOuCriarCarrinhoAtivo(input.clienteId, {
      canal: input.canal,
      conversaId: input.conversaId,
      supabaseClient: supabase,
    })

    if (!cartRes.success || !cartRes.carrinho) {
      return { success: false, error: cartRes.error || 'Não foi possível inicializar carrinho' }
    }

    const carrinhoId = cartRes.carrinho.id

    // 2. Buscar o produto no banco para validar preço e status ativo
    const { data: produto, error: prodError } = await supabase
      .from('produtos')
      .select('id, nome, preco_centavos, ativo')
      .eq('id', input.produtoId)
      .maybeSingle()

    if (prodError || !produto) {
      return { success: false, error: 'Produto não encontrado no catálogo' }
    }

    if (!produto.ativo) {
      return { success: false, error: `O produto ${produto.nome} está temporariamente indisponível` }
    }

    const precoUnitario = produto.preco_centavos

    // 3. Verificar se o item já está no carrinho
    const { data: itemExistente } = await supabase
      .from('itens_carrinho')
      .select('id, quantidade')
      .eq('carrinho_id', carrinhoId)
      .eq('produto_id', produto.id)
      .maybeSingle()

    if (itemExistente) {
      const novaQuantidade = itemExistente.quantidade + quantidade
      const novoTotal = novaQuantidade * precoUnitario

      const { error: updateError } = await supabase
        .from('itens_carrinho')
        .update({
          quantidade: novaQuantidade,
          preco_total_centavos: novoTotal,
          observacoes: input.observacoes || undefined,
        })
        .eq('id', itemExistente.id)

      if (updateError) {
        return { success: false, error: `Erro ao atualizar quantidade: ${updateError.message}` }
      }
    } else {
      const precoTotal = quantidade * precoUnitario
      const { error: insertItemError } = await supabase
        .from('itens_carrinho')
        .insert({
          carrinho_id: carrinhoId,
          produto_id: produto.id,
          quantidade,
          preco_unitario_centavos: precoUnitario,
          preco_total_centavos: precoTotal,
          observacoes: input.observacoes || null,
        })

      if (insertItemError) {
        return { success: false, error: `Erro ao inserir item no carrinho: ${insertItemError.message}` }
      }
    }

    // 4. Retornar carrinho atualizado
    return await obterCarrinhoPorId(carrinhoId, supabase)
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro inesperado ao adicionar item' }
  }
}

/**
 * Remove um item do carrinho ativo do cliente.
 */
export async function removerItemDoCarrinho(
  input: RemoverItemInput
): Promise<CarrinhoResult> {
  const supabase = getSupabase(input.supabaseClient)

  try {
    const cartRes = await obterOuCriarCarrinhoAtivo(input.clienteId, { supabaseClient: supabase })
    if (!cartRes.success || !cartRes.carrinho) {
      return { success: false, error: cartRes.error || 'Carrinho não encontrado' }
    }

    const carrinhoId = cartRes.carrinho.id

    await supabase
      .from('itens_carrinho')
      .delete()
      .eq('carrinho_id', carrinhoId)
      .eq('produto_id', input.produtoId)

    return await obterCarrinhoPorId(carrinhoId, supabase)
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao remover item' }
  }
}

/**
 * Atualiza a quantidade de um item no carrinho. Se <= 0, remove o item.
 */
export async function atualizarQuantidadeItemCarrinho(
  input: AtualizarQuantidadeInput
): Promise<CarrinhoResult> {
  if (input.quantidade <= 0) {
    return removerItemDoCarrinho({
      clienteId: input.clienteId,
      produtoId: input.produtoId,
      supabaseClient: input.supabaseClient,
    })
  }

  const supabase = getSupabase(input.supabaseClient)

  try {
    const cartRes = await obterOuCriarCarrinhoAtivo(input.clienteId, { supabaseClient: supabase })
    if (!cartRes.success || !cartRes.carrinho) {
      return { success: false, error: cartRes.error || 'Carrinho não encontrado' }
    }

    const carrinhoId = cartRes.carrinho.id

    const { data: item } = await supabase
      .from('itens_carrinho')
      .select('id, preco_unitario_centavos')
      .eq('carrinho_id', carrinhoId)
      .eq('produto_id', input.produtoId)
      .maybeSingle()

    if (!item) {
      return { success: false, error: 'Item não encontrado no carrinho' }
    }

    const precoTotal = input.quantidade * item.preco_unitario_centavos

    await supabase
      .from('itens_carrinho')
      .update({
        quantidade: input.quantidade,
        preco_total_centavos: precoTotal,
      })
      .eq('id', item.id)

    return await obterCarrinhoPorId(carrinhoId, supabase)
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao atualizar quantidade' }
  }
}

/**
 * Limpa todos os itens do carrinho ativo do cliente.
 */
export async function limparCarrinho(
  input: LimparCarrinhoInput
): Promise<CarrinhoResult> {
  const supabase = getSupabase(input.supabaseClient)

  try {
    const cartRes = await obterOuCriarCarrinhoAtivo(input.clienteId, { supabaseClient: supabase })
    if (!cartRes.success || !cartRes.carrinho) {
      return { success: false, error: cartRes.error || 'Carrinho não encontrado' }
    }

    const carrinhoId = cartRes.carrinho.id

    await supabase
      .from('itens_carrinho')
      .delete()
      .eq('carrinho_id', carrinhoId)

    return await obterCarrinhoPorId(carrinhoId, supabase)
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao limpar carrinho' }
  }
}

/**
 * Converte o carrinho aberto em um Pedido confirmado com reserva atômica de estoque.
 */
export async function converterCarrinhoEmPedido(
  input: ConverterCarrinhoInput
): Promise<CarrinhoResult> {
  const supabase = getSupabase(input.supabaseClient)

  try {
    const { data, error } = await supabase.rpc('converter_carrinho_em_pedido', {
      p_carrinho_id: input.carrinhoId,
      p_meio_pagamento: input.meioPagamento || 'pix',
      p_horario_retirada: input.horarioRetirada || null,
    })

    if (error) {
      return { success: false, error: `Erro na conversão do pedido: ${error.message}` }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row || !row.pedido_id) {
      return { success: false, error: 'Falha ao obter ID do pedido convertido' }
    }

    return {
      success: true,
      pedidoId: row.pedido_id,
      totalCentavos: row.total_centavos,
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro inesperado na conversão do carrinho' }
  }
}
