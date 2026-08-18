'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { agendarPedidoNoCalendario } from '@/lib/calendar/google'


// Schema para validação dos dados do pedido recebidos pelo operador
const itemPedidoSchema = z.object({
  produto_id: z.string().uuid('ID do produto inválido'),
  quantidade: z.number().int().min(1, 'A quantidade deve ser de pelo menos 1'),
})

const criarPedidoSchema = z.object({
  cliente_id: z.string().uuid('ID do cliente inválido'),
  conversa_id: z.string().uuid('ID da conversa inválido').nullable().optional(),
  tipo_entrega: z.enum(['entrega', 'retirada']),
  endereco_entrega: z.string().nullable().optional(),
  taxa_entrega_centavos: z.number().int().min(0, 'A taxa de entrega não pode ser negativa'),
  meio_pagamento: z.enum(['pix', 'cartao_credito', 'cartao_debito', 'dinheiro']),
  itens: z.array(itemPedidoSchema).min(1, 'O pedido deve conter pelo menos um item'),
})

/**
 * Helper para validar se o usuário atual está autenticado, ativo
 * e se possui papel de operador ('admin', 'supervisor', 'vendedor').
 */
async function verificarPermissaoOperador() {
  const supabase = await createClient()

  // 1. Obter usuário autenticado da sessão
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { authorized: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO', supabase }
  }

  // 2. Buscar o perfil do usuário e validar suas permissões e status
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('funcao, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil) {
    return { authorized: false, error: 'PERFIL_NAO_ENCONTRADO', supabase }
  }

  if (!perfil.ativo) {
    return { authorized: false, error: 'PERFIL_INATIVO', supabase }
  }

  const funcoesAutorizadas = ['admin', 'supervisor', 'vendedor']
  if (!funcoesAutorizadas.includes(perfil.funcao)) {
    return { authorized: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE', supabase }
  }

  return { authorized: true, user, supabase }
}

export async function criarPedidoOperador(data: {
  cliente_id: string
  conversa_id?: string | null
  tipo_entrega: 'entrega' | 'retirada'
  endereco_entrega?: string | null
  taxa_entrega_centavos: number
  meio_pagamento: 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'
  itens: {
    produto_id: string
    quantidade: number
  }[]
}) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    // 1. Validar dados recebidos
    const validation = criarPedidoSchema.safeParse(data)
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    const input = validation.data

    // 2. Buscar produtos no banco para resgatar os preços unitários atuais em centavos
    const produtoIds = input.itens.map((item) => item.produto_id)
    const { data: produtos, error: produtosError } = await supabase
      .from('produtos')
      .select('id, preco_centavos, nome, ativo')
      .in('id', produtoIds)

    if (produtosError || !produtos) {
      return {
        success: false,
        error: 'ERRO_PRODUTOS',
        message: produtosError ? produtosError.message : 'Produtos não encontrados no catálogo',
      }
    }

    // Validar se todos os produtos requisitados existem e estão ativos
    const mapaProdutos = new Map<string, { preco_centavos: number; ativo: boolean }>()
    produtos.forEach((p) => mapaProdutos.set(p.id, { preco_centavos: p.preco_centavos, ativo: p.ativo }))

    for (const item of input.itens) {
      const prod = mapaProdutos.get(item.produto_id)
      if (!prod) {
        return { success: false, error: 'PRODUTO_NAO_ENCONTRADO', message: `Produto ${item.produto_id} não encontrado` }
      }
      if (!prod.ativo) {
        return { success: false, error: 'PRODUTO_INATIVO', message: `Produto ${item.produto_id} não está ativo` }
      }
    }

    // 3. Calcular totais em centavos
    let totalProdutosCentavos = 0
    const itensComPreco = input.itens.map((item) => {
      const prod = mapaProdutos.get(item.produto_id)!
      const precoUnitario = prod.preco_centavos
      totalProdutosCentavos += precoUnitario * item.quantidade

      return {
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario_centavos: precoUnitario,
      }
    })

    const totalPedidoCentavos = totalProdutosCentavos + input.taxa_entrega_centavos

    // 4. Inserir o Pedido (transação lógica usando try-catch no nível da aplicação)
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        cliente_id: input.cliente_id,
        conversa_id: input.conversa_id || null,
        status: 'novo',
        tipo_entrega: input.tipo_entrega,
        endereco_entrega: input.tipo_entrega === 'entrega' ? input.endereco_entrega : null,
        taxa_entrega_centavos: input.tipo_entrega === 'entrega' ? input.taxa_entrega_centavos : 0,
        total_produtos_centavos: totalProdutosCentavos,
        total_pedido_centavos: input.tipo_entrega === 'entrega' ? totalPedidoCentavos : totalProdutosCentavos,
        status_pagamento: 'pendente',
        meio_pagamento: input.meio_pagamento,
      })
      .select()
      .single()

    if (pedidoError || !pedido) {
      console.error('Erro ao inserir pedido:', pedidoError)
      return { success: false, error: `ERRO_CRIACAO_PEDIDO: ${pedidoError?.message || 'Falha desconhecida'}` }
    }

    // 5. Inserir os itens vinculados ao pedido criado
    const itensInsertData = itensComPreco.map((item) => ({
      pedido_id: pedido.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      preco_unitario_centavos: item.preco_unitario_centavos,
    }))

    const { error: itensError } = await supabase
      .from('itens_pedido')
      .insert(itensInsertData)

    if (itensError) {
      console.error('Erro ao inserir itens do pedido, revertendo pedido...', itensError)
      
      // Simulação de Rollback: Deletar o pedido para não deixar órfãos no banco
      await supabase
        .from('pedidos')
        .delete()
        .eq('id', pedido.id)

      return { success: false, error: `ERRO_ITENS_PEDIDO: ${itensError.message}` }
    }

    revalidatePath('/atendimento')
    return { success: true, data: pedido }
  } catch (error: any) {
    console.error('Erro na action criarPedidoOperador:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

function mapearErroEstoquePedido(error: { code?: string; message?: string }) {
  if (error.message?.includes('ESTOQUE_INSUFICIENTE')) return 'ESTOQUE_INSUFICIENTE'
  if (error.message?.includes('CANCELAMENTO_SEM_CONFIRMACAO')) return 'CANCELAMENTO_SEM_CONFIRMACAO'
  if (error.message?.includes('EFEITOS_ESTOQUE_INDISPONIVEIS')) return 'EFEITOS_ESTOQUE_INDISPONIVEIS'
  if (error.message?.includes('IDEMPOTENCY_CONFLICT') || error.code === '23505') return 'CONFLITO_IDEMPOTENCIA'
  if (error.message?.includes('PEDIDO_NAO_ENCONTRADO')) return 'PEDIDO_NAO_ENCONTRADO'
  if (error.code === '42501') return 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE'
  return 'ERRO_ESTOQUE_PEDIDO'
}

export async function confirmarPedidoOperador(pedidoId: string, correlationId = pedidoId) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    const { data: pedido, error: stockError } = await supabase.rpc('confirmar_pedido_estoque', {
      p_pedido_id: pedidoId,
      p_correlation_id: correlationId,
    }).single()
    if (stockError || !pedido) return { success: false, error: mapearErroEstoquePedido(stockError || {}) }

    // 2. Agendar no Google Calendar de forma resiliente
    const googleEventId = await agendarPedidoNoCalendario(pedidoId)

    if (googleEventId) {
      // Grava o google_event_id no banco
      const { error: updateCalError } = await supabase
        .from('pedidos')
        .update({ google_event_id: googleEventId })
        .eq('id', pedidoId)

      if (updateCalError) {
        console.error(`[Pedidos] Erro ao gravar google_event_id no pedido: ${updateCalError.message}`)
      }
    }

    revalidatePath('/atendimento')

    // Buscar o pedido atualizado para retornar
    const { data: pedidoAtualizado } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', pedidoId)
      .single()

    return { success: true, data: pedidoAtualizado || pedido }
  } catch (error: any) {
    console.error('Erro na action confirmarPedidoOperador:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action para gerar uma preferência de pagamento no Mercado Pago.
 * Suporta o modo real e um modo mock (caso o token não esteja configurado).
 * 
 * @param pedidoId ID do pedido a ser pago
 */
export async function gerarPreferenciaPagamento(pedidoId: string) {
  try {
    const supabase = await createClient()

    // 1. Obter usuário autenticado da sessão
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    // 2. Buscar o perfil do usuário para verificar permissões de operador
    const { data: perfil } = await supabase
      .from('perfis')
      .select('funcao, ativo')
      .eq('id', user.id)
      .maybeSingle()

    // 3. Buscar os detalhes do pedido, cliente e itens
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select(`
        id,
        status,
        tipo_entrega,
        endereco_entrega,
        taxa_entrega_centavos,
        total_produtos_centavos,
        total_pedido_centavos,
        meio_pagamento,
        cliente_id,
        clientes:cliente_id (
          id,
          usuario_id,
          nome,
          telefone
        ),
        itens:itens_pedido (
          id,
          quantidade,
          preco_unitario_centavos,
          produtos:produto_id (
            id,
            nome
          )
        )
      `)
      .eq('id', pedidoId)
      .single()

    if (pedidoError || !pedido) {
      console.error('[gerarPreferenciaPagamento] Pedido não encontrado:', pedidoError)
      return { success: false, error: 'PEDIDO_NAO_ENCONTRADO' }
    }

    // 4. Validar permissão: operador (admin/supervisor/vendedor) ou cliente dono do pedido
    const funcoesAutorizadas = ['admin', 'supervisor', 'vendedor']
    const isOperador = perfil && perfil.ativo && funcoesAutorizadas.includes(perfil.funcao)
    const clienteDono = pedido.clientes as any
    const isDono = clienteDono && clienteDono.usuario_id === user.id

    if (!isOperador && !isDono) {
      return { success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
    }

    // 5. Validar credencial do Mercado Pago e ativar modo mock se necessário
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN
    const isPlaceholder = !token || 
      token.includes('placeholder') || 
      token.includes('insert_here') || 
      token.includes('seu_access_token_mercado_pago_aqui') ||
      token.includes('your_access_token')

    if (isPlaceholder) {
      const mockPrefId = `mock_pref_${pedidoId}`
      const mockUrl = `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=${mockPrefId}`

      // Persistir o ID de preferência mock no pedido (usando admin client para contornar RLS)
      const supabaseAdmin = createAdminClient()
      const { error: updateError } = await supabaseAdmin
        .from('pedidos')
        .update({ mercado_pago_preferencia_id: mockPrefId })
        .eq('id', pedidoId)

      if (updateError) {
        console.error('[gerarPreferenciaPagamento] Erro ao persistir preferência mock:', updateError)
        return { success: false, error: 'ERRO_PERSISTENCIA_MOCK' }
      }

      return { success: true, url: mockUrl }
    }

    // 6. Preparar itens para a requisição real no Mercado Pago
    // Converter valores de centavos para decimais de Real (BRL)
    const itensPedido = (pedido.itens || []) as any[]
    const items = itensPedido.map((item) => ({
      id: item.produtos?.id || item.produto_id,
      title: item.produtos?.nome || 'Item do Pedido',
      quantity: item.quantidade,
      unit_price: item.preco_unitario_centavos / 100,
      currency_id: 'BRL'
    }))

    // Se houver taxa de entrega, incluir como item
    if (pedido.taxa_entrega_centavos > 0) {
      items.push({
        id: 'taxa-entrega',
        title: 'Taxa de Entrega',
        quantity: 1,
        unit_price: pedido.taxa_entrega_centavos / 100,
        currency_id: 'BRL'
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const notificationUrl = `${appUrl}/api/webhooks/mercadopago`
    
    const payload = {
      items,
      back_urls: {
        success: `${appUrl}/cliente/chat?status=success&pedido_id=${pedidoId}`,
        failure: `${appUrl}/cliente/chat?status=failure&pedido_id=${pedidoId}`,
        pending: `${appUrl}/cliente/chat?status=pending&pedido_id=${pedidoId}`
      },
      auto_return: 'approved',
      external_reference: pedidoId,
      notification_url: notificationUrl
    }

    // 7. Chamar a API do Mercado Pago para gerar a preferência
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[gerarPreferenciaPagamento] Falha ao criar preferência no Mercado Pago:', response.status, errorText)
      return { success: false, error: 'ERRO_API_MERCADO_PAGO', details: errorText }
    }

    const responseData = await response.json()
    const preferenceId = responseData.id
    const initPoint = responseData.sandbox_init_point || responseData.init_point

    if (!preferenceId || !initPoint) {
      console.error('[gerarPreferenciaPagamento] Resposta inválida do Mercado Pago:', responseData)
      return { success: false, error: 'RESPOSTA_INVALIDA_MERCADO_PAGO' }
    }

    // 8. Persistir o ID de preferência real no banco de dados (usando admin client para contornar RLS)
    const supabaseAdmin = createAdminClient()
    const { error: updateError } = await supabaseAdmin
      .from('pedidos')
      .update({ mercado_pago_preferencia_id: preferenceId })
      .eq('id', pedidoId)

    if (updateError) {
      console.error('[gerarPreferenciaPagamento] Erro ao persistir preferência real no banco:', updateError)
      return { success: false, error: 'ERRO_PERSISTENCIA_REAL' }
    }

    return { success: true, url: initPoint }
  } catch (error: any) {
    console.error('Erro na action gerarPreferenciaPagamento:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Cancela um pedido e restaura o estoque dos produtos vendidos.
 * Registra movimentações de estoque do tipo 'cancelamento'.
 */
export async function cancelarPedido(pedidoId: string, correlationId = pedidoId) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check
    const { error } = await supabase.rpc('cancelar_pedido_estoque', {
      p_pedido_id: pedidoId,
      p_correlation_id: correlationId,
    }).single()
    if (error) return { success: false, error: mapearErroEstoquePedido(error) }

    return { success: true, message: 'Pedido cancelado e estoque restaurado.' }
  } catch (error: any) {
    console.error('Erro na action cancelarPedido:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Lista pedidos com filtros para o console de atendimento e painel de pedidos.
 */
export async function actionListarPedidos(filtros?: {
  status?: 'novo' | 'confirmado' | 'entregue' | 'cancelado' | 'todos'
  clienteId?: string
  limite?: number
}) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check
    let query = supabase
      .from('pedidos')
      .select(`
        id,
        status,
        tipo_entrega,
        endereco_entrega,
        taxa_entrega_centavos,
        total_produtos_centavos,
        total_pedido_centavos,
        status_pagamento,
        meio_pagamento,
        mercado_pago_preferencia_id,
        google_event_id,
        data_criacao,
        data_atualizacao,
        cliente_id,
        conversa_id,
        clientes:cliente_id (
          id,
          nome,
          telefone,
          email
        ),
        itens:itens_pedido (
          id,
          quantidade,
          preco_unitario_centavos,
          produtos:produto_id (
            id,
            nome,
            url_imagem,
            url_imagem_thumb
          )
        )
      `)
      .order('data_criacao', { ascending: false })

    if (filtros?.status && filtros.status !== 'todos') {
      query = query.eq('status', filtros.status)
    }

    if (filtros?.clienteId) {
      query = query.eq('cliente_id', filtros.clienteId)
    }

    if (filtros?.limite) {
      query = query.limit(filtros.limite)
    } else {
      query = query.limit(100)
    }

    const { data, error } = await query
    if (error) {
      console.error('[actionListarPedidos] Erro na consulta:', error)
      return { success: false, error: error.message }
    }

    const mapped = (data || []).map((pedido: any) => ({
      ...pedido,
      itens: (pedido.itens || []).map((item: any) => ({
        ...item,
        preco_total_centavos: item.preco_total_centavos ?? ((item.preco_unitario_centavos || 0) * (item.quantidade || 1)),
      })),
    }))

    return { success: true, data: mapped }
  } catch (error: any) {
    console.error('Erro na action actionListarPedidos:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Atualiza o status de um pedido (ex: confirmado -> entregue ou cancelado).
 */
export async function actionAtualizarStatusPedido(params: {
  pedidoId: string
  novoStatus: 'novo' | 'confirmado' | 'entregue' | 'cancelado'
}) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check
    const { pedidoId, novoStatus } = params

    if (novoStatus === 'cancelado') {
      const res = await cancelarPedido(pedidoId)
      if (res.success) {
        revalidatePath('/atendimento')
        revalidatePath('/atendimento/pedidos')
      }
      return res
    }

    const updatePayload: Record<string, any> = { status: novoStatus }
    if (novoStatus === 'entregue') {
      updatePayload.status_pagamento = 'aprovado'
    }

    const { data, error } = await supabase
      .from('pedidos')
      .update(updatePayload)
      .eq('id', pedidoId)
      .select()
      .single()

    if (error) {
      console.error('[actionAtualizarStatusPedido] Erro ao atualizar status:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/atendimento')
    revalidatePath('/atendimento/pedidos')
    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action actionAtualizarStatusPedido:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Atualiza o status do pagamento do pedido (ex: aprovado para pagamento em dinheiro ou PIX conferido).
 */
export async function actionAtualizarStatusPagamento(params: {
  pedidoId: string
  statusPagamento: 'pendente' | 'aprovado' | 'rejeitado' | 'reembolsado'
}) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check
    const { pedidoId, statusPagamento } = params

    const { data, error } = await supabase
      .from('pedidos')
      .update({ status_pagamento: statusPagamento })
      .eq('id', pedidoId)
      .select()
      .single()

    if (error) {
      console.error('[actionAtualizarStatusPagamento] Erro ao atualizar pagamento:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/atendimento')
    revalidatePath('/atendimento/pedidos')
    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action actionAtualizarStatusPagamento:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
