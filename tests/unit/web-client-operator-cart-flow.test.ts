import { beforeAll, describe, expect, it } from 'vitest'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8000'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2NjMxMzM5LCJleHAiOjE5NDQzMTEzMzl9._X-OI8hh_bFU-7iYDjOnXfHFFoPl6ybpD5-mfuogNys'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODY2MzEzMzksImV4cCI6MTk0NDMxMTMzOX0.5CELS8sD90H8mWVfZ_kGoHDtTQfAfZvvlb8lavwkKdM'

process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey
process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey

import {
  obterOuCriarCarrinhoAtivo,
  adicionarItemAoCarrinho,
  atualizarQuantidadeItemCarrinho,
  removerItemDoCarrinho,
  limparCarrinho,
  converterCarrinhoEmPedido,
} from '@/lib/carrinho/service'
import { createClient } from '@supabase/supabase-js'

describe('Web Client & Operator Unified Cart Management Flow', () => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  it('allows client to assemble a custom order, recalculate totals and isolate from other clients', async () => {
    // 1. Obter produtos reais do banco de dados
    const { data: produtos } = await supabase
      .from('produtos')
      .select('id, nome, preco_centavos')
      .eq('ativo', true)
      .limit(2)

    expect(produtos).toBeDefined()
    expect(produtos!.length).toBeGreaterThanOrEqual(2)

    const prod1 = produtos![0]
    const prod2 = produtos![1]

    // Cliente A e Cliente B
    const clienteAId = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'
    const clienteBId = 'e1b19eff-ab67-4429-ad00-8b13276e4754'

    // Limpar carrinhos residuais
    await limparCarrinho({ clienteId: clienteAId })
    await limparCarrinho({ clienteId: clienteBId })

    // 2. Cliente A adiciona Produto 1
    const add1 = await adicionarItemAoCarrinho({
      clienteId: clienteAId,
      produtoId: prod1.id,
      quantidade: 1,
    })
    expect(add1.success).toBe(true)
    expect(add1.carrinho?.total_centavos).toBe(prod1.preco_centavos)

    // 3. Cliente A adiciona Produto 2
    const add2 = await adicionarItemAoCarrinho({
      clienteId: clienteAId,
      produtoId: prod2.id,
      quantidade: 2,
    })
    expect(add2.success).toBe(true)
    expect(add2.carrinho?.itens_carrinho?.length).toBe(2)
    const expectedTotalA = prod1.preco_centavos + prod2.preco_centavos * 2
    expect(add2.carrinho?.total_centavos).toBe(expectedTotalA)

    // 4. Cliente B adiciona apenas Produto 2 com quantidade 1
    const addB = await adicionarItemAoCarrinho({
      clienteId: clienteBId,
      produtoId: prod2.id,
      quantidade: 1,
    })
    expect(addB.success).toBe(true)
    expect(addB.carrinho?.total_centavos).toBe(prod2.preco_centavos)

    // 5. Garantir Isolamento Estrito: O carrinho do Cliente A NÃO foi afetado pelo Cliente B
    const cartA = await obterOuCriarCarrinhoAtivo(clienteAId)
    expect(cartA.success).toBe(true)
    expect(cartA.carrinho?.total_centavos).toBe(expectedTotalA)
    expect(cartA.carrinho?.itens_carrinho?.length).toBe(2)

    // 6. Atualização de quantidade no carrinho do Cliente A (diminui prod2 de 2 para 1)
    const updA = await atualizarQuantidadeItemCarrinho({
      clienteId: clienteAId,
      produtoId: prod2.id,
      quantidade: 1,
    })
    expect(updA.success).toBe(true)
    expect(updA.carrinho?.total_centavos).toBe(prod1.preco_centavos + prod2.preco_centavos)

    // 7. Remoção de item do carrinho
    const remA = await removerItemDoCarrinho({
      clienteId: clienteAId,
      produtoId: prod1.id,
    })
    expect(remA.success).toBe(true)
    expect(remA.carrinho?.itens_carrinho?.length).toBe(1)
    expect(remA.carrinho?.total_centavos).toBe(prod2.preco_centavos)
  })

  it('allows operator (admin, supervisor, vendedor) to convert client cart into confirmed order with pickup window', async () => {
    const clienteId = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'

    const { data: prod } = await supabase
      .from('produtos')
      .select('id, nome, preco_centavos')
      .eq('ativo', true)
      .limit(1)
      .single()

    // Limpar e criar novo item
    await limparCarrinho({ clienteId })
    const addRes = await adicionarItemAoCarrinho({
      clienteId,
      produtoId: prod!.id,
      quantidade: 1,
    })
    expect(addRes.success).toBe(true)
    const carrinhoId = addRes.carrinho!.id

    // Operador converte o carrinho em pedido oficial
    const convRes = await converterCarrinhoEmPedido({
      carrinhoId,
      meioPagamento: 'pix',
      horarioRetirada: '12:30',
    })

    expect(convRes.success).toBe(true)
    expect(convRes.pedidoId).toBeDefined()

    // Verificar se o pedido foi persistido no banco
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', convRes.pedidoId!)
      .single()

    expect(pedido).toBeDefined()
    expect(pedido?.cliente_id).toBe(clienteId)
    expect(pedido?.status).toBe('confirmado')
    expect(pedido?.meio_pagamento).toBe('pix')

    // Verificar se um novo carrinho limpo é gerado para o cliente
    const novoCarrinho = await obterOuCriarCarrinhoAtivo(clienteId)
    expect(novoCarrinho.success).toBe(true)
    expect(novoCarrinho.carrinho?.id).not.toBe(carrinhoId)
    expect(novoCarrinho.carrinho?.itens_carrinho?.length || 0).toBe(0)
  })
})
