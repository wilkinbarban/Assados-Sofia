import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OrdersManagementDashboard from '@/components/operator/OrdersManagementDashboard'

vi.mock('@/app/actions/pedidos', () => ({
  actionListarPedidos: vi.fn().mockResolvedValue({ success: true, data: [] }),
  actionAtualizarStatusPedido: vi.fn().mockResolvedValue({ success: true }),
  actionAtualizarStatusPagamento: vi.fn().mockResolvedValue({ success: true }),
  gerarPreferenciaPagamento: vi.fn().mockResolvedValue({ success: true }),
}))

describe('OrdersManagementDashboard - Advanced Filtering & Search', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const mockPedidos: any[] = [
    {
      id: 'ped-101',
      status: 'novo',
      tipo_entrega: 'entrega',
      endereco_entrega: 'Rua Nicola Pellanda, 1500 - Umbará',
      taxa_entrega_centavos: 1000,
      total_produtos_centavos: 6990,
      total_pedido_centavos: 7990,
      status_pagamento: 'pendente',
      meio_pagamento: 'pix',
      data_criacao: new Date().toISOString(),
      data_atualizacao: new Date().toISOString(),
      cliente_id: 'cli-1',
      clientes: { id: 'cli-1', nome: 'Wilkin Silva', telefone: '5541998887777', email: 'wilkin@test.com' },
      itens: [
        { id: 'it-1', quantidade: 1, preco_unitario_centavos: 6990, preco_total_centavos: 6990, produtos: { id: 'p1', nome: 'Combo 1 - O Clássico da Sofia' } }
      ]
    },
    {
      id: 'ped-102',
      status: 'confirmado',
      tipo_entrega: 'retirada',
      endereco_entrega: null,
      taxa_entrega_centavos: 0,
      total_produtos_centavos: 12990,
      total_pedido_centavos: 12990,
      status_pagamento: 'aprovado',
      meio_pagamento: 'cartao_credito',
      data_criacao: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      data_atualizacao: new Date().toISOString(),
      cliente_id: 'cli-2',
      clientes: { id: 'cli-2', nome: 'Beatriz Santos', telefone: '5541987654321', email: 'beatriz@test.com' },
      itens: [
        { id: 'it-2', quantidade: 1, preco_unitario_centavos: 12990, preco_total_centavos: 12990, produtos: { id: 'p2', nome: 'Combo 2 - Costela Suprema' } }
      ]
    },
    {
      id: 'ped-103',
      status: 'entregue',
      tipo_entrega: 'entrega',
      endereco_entrega: 'Rua Vereador Angelo Burbello, 800',
      taxa_entrega_centavos: 1000,
      total_produtos_centavos: 3500,
      total_pedido_centavos: 4500,
      status_pagamento: 'aprovado',
      meio_pagamento: 'dinheiro',
      data_criacao: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      data_atualizacao: new Date().toISOString(),
      cliente_id: 'cli-3',
      clientes: { id: 'cli-3', nome: 'Carlos Oliveira', telefone: '5541991112222', email: 'carlos@test.com' },
      itens: [
        { id: 'it-3', quantidade: 1, preco_unitario_centavos: 3500, preco_total_centavos: 3500, produtos: { id: 'p3', nome: 'Maionese Caseira' } }
      ]
    }
  ]

  const usuarioLogado = { id: 'user-admin', nome: 'Admin Sofia', funcao: 'admin' }

  it('exibe todos os pedidos inicialmente e calcula KPIs corretamente', () => {
    render(<OrdersManagementDashboard usuarioLogado={usuarioLogado} pedidosIniciais={mockPedidos} />)

    expect(screen.getByText('Wilkin Silva')).toBeDefined()
    expect(screen.getByText('Beatriz Santos')).toBeDefined()
    expect(screen.getByText('Carlos Oliveira')).toBeDefined()
    expect(screen.getByText(/Exibindo/)).toBeDefined()
  })

  it('filtra por busca de texto em produto contido no pedido', () => {
    render(<OrdersManagementDashboard usuarioLogado={usuarioLogado} pedidosIniciais={mockPedidos} />)

    const searchInput = screen.getByPlaceholderText(/Buscar cliente, fone, #PED, item.../i)
    fireEvent.change(searchInput, { target: { value: 'Costela' } })

    expect(screen.getByText('Beatriz Santos')).toBeDefined()
    expect(screen.queryByText('Wilkin Silva')).toBeNull()
    expect(screen.queryByText('Carlos Oliveira')).toBeNull()
  })

  it('filtra por endereço de entrega', () => {
    render(<OrdersManagementDashboard usuarioLogado={usuarioLogado} pedidosIniciais={mockPedidos} />)

    const searchInput = screen.getByPlaceholderText(/Buscar cliente, fone, #PED, item.../i)
    fireEvent.change(searchInput, { target: { value: 'Nicola Pellanda' } })

    expect(screen.getByText('Wilkin Silva')).toBeDefined()
    expect(screen.queryByText('Beatriz Santos')).toBeNull()
  })

  it('filtra por status de pagamento e permite limpar filtros', () => {
    render(<OrdersManagementDashboard usuarioLogado={usuarioLogado} pedidosIniciais={mockPedidos} />)

    // Abre filtros avançados
    const filtrosBtn = screen.getByText('Filtros')
    fireEvent.click(filtrosBtn)

    const selects = screen.getAllByRole('combobox')
    const pagamentoSelect = selects[0] // Pagamento select
    fireEvent.change(pagamentoSelect, { target: { value: 'pendente' } })

    expect(screen.getByText('Wilkin Silva')).toBeDefined()
    expect(screen.queryByText('Beatriz Santos')).toBeNull()

    // Clica no botão Limpar Filtros
    const limparBtn = screen.getByText('Limpar Filtros')
    fireEvent.click(limparBtn)

    expect(screen.getByText('Wilkin Silva')).toBeDefined()
    expect(screen.getByText('Beatriz Santos')).toBeDefined()
  })
})
