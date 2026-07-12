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

export async function confirmarPedidoOperador(pedidoId: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    // 1. Atualizar o status do pedido para 'confirmado'
    const { data: pedido, error: updateError } = await supabase
      .from('pedidos')
      .update({ status: 'confirmado' })
      .eq('id', pedidoId)
      .select()
      .single()

    if (updateError || !pedido) {
      console.error(`[Pedidos] Erro ao confirmar pedido: ${updateError?.message || 'Pedido não encontrado'}`)
      return { success: false, error: `ERRO_CONFIRMACAO_PEDIDO: ${updateError?.message || 'Falha ao atualizar status'}` }
    }

    // Integração de estoque: baixar produtos vendidos
    try {
      const supabaseAdmin = createAdminClient()

      // Obter usuário atual para registro de movimentação
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const usuarioId = currentUser?.id

      const { data: itensPedido, error: itensError } = await supabaseAdmin
        .from('itens_pedido')
        .select('produto_id, quantidade')
        .eq('pedido_id', pedidoId)

      if (!itensError && itensPedido && itensPedido.length > 0) {
        for (const item of itensPedido) {
          const { data: produto, error: prodError } = await supabaseAdmin
            .from('produtos')
            .select('quantidade_estoque, controlar_estoque')
            .eq('id', item.produto_id)
            .single()

          if (prodError || !produto || !produto.controlar_estoque) continue

          const qtdAnterior = produto.quantidade_estoque
          const qtdNova = qtdAnterior - item.quantidade

          const { error: updateEstoqueError } = await supabaseAdmin
            .from('produtos')
            .update({
              quantidade_estoque: qtdNova,
              ativo: qtdNova > 0,
              data_atualizacao: new Date().toISOString(),
            })
            .eq('id', item.produto_id)

          if (updateEstoqueError) {
            console.error(`[Pedidos] Erro ao atualizar estoque do produto ${item.produto_id}:`, updateEstoqueError)
            continue
          }

          const { error: movError } = await supabaseAdmin
            .from('movimentacoes_estoque')
            .insert({
              produto_id: item.produto_id,
              tipo: 'saida',
              quantidade: item.quantidade,
              quantidade_anterior: qtdAnterior,
              quantidade_nova: qtdNova,
              motivo: 'Venda confirmada',
              usuario_id: usuarioId,
              pedido_id: pedidoId,
            })

          if (movError) {
            console.error(`[Pedidos] Erro ao registrar movimentação de estoque para produto ${item.produto_id}:`, movError)
          }
        }
      }
    } catch (stockError) {
      console.error('[Pedidos] Erro na integração de estoque:', stockError)
    }

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
export async function cancelarPedido(pedidoId: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check
    const supabaseAdmin = createAdminClient()

    // Obter usuário atual
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    const usuarioId = currentUser?.id

    // 1. Buscar pedido e validar
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, status')
      .eq('id', pedidoId)
      .single()

    if (pedidoError || !pedido) {
      return { success: false, error: 'PEDIDO_NAO_ENCONTRADO' }
    }

    if (pedido.status === 'cancelado') {
      return { success: false, error: 'PEDIDO_JA_CANCELADO' }
    }

    // 2. Buscar itens do pedido para restaurar estoque
    const { data: itensPedido, error: itensError } = await supabaseAdmin
      .from('itens_pedido')
      .select('produto_id, quantidade')
      .eq('pedido_id', pedidoId)

    if (!itensError && itensPedido && itensPedido.length > 0) {
      for (const item of itensPedido) {
        const { data: produto } = await supabaseAdmin
          .from('produtos')
          .select('quantidade_estoque, controlar_estoque')
          .eq('id', item.produto_id)
          .single()

        if (!produto || !produto.controlar_estoque) continue

        const qtdAnterior = produto.quantidade_estoque
        const qtdNova = qtdAnterior + item.quantidade

        // Restaurar estoque
        await supabaseAdmin
          .from('produtos')
          .update({
            quantidade_estoque: qtdNova,
            ativo: true, // reativa o produto ao restaurar estoque
            data_atualizacao: new Date().toISOString(),
          })
          .eq('id', item.produto_id)

        // Registrar movimentação
        await supabaseAdmin
          .from('movimentacoes_estoque')
          .insert({
            produto_id: item.produto_id,
            tipo: 'cancelamento',
            quantidade: item.quantidade,
            quantidade_anterior: qtdAnterior,
            quantidade_nova: qtdNova,
            motivo: 'Pedido cancelado',
            usuario_id: usuarioId,
            pedido_id: pedidoId,
          })
      }
    }

    // 3. Atualizar status do pedido
    const { error: updateError } = await supabaseAdmin
      .from('pedidos')
      .update({ status: 'cancelado' })
      .eq('id', pedidoId)

    if (updateError) {
      return { success: false, error: `ERRO_CANCELAMENTO: ${updateError.message}` }
    }

    return { success: true, message: 'Pedido cancelado e estoque restaurado.' }
  } catch (error: any) {
    console.error('Erro na action cancelarPedido:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
