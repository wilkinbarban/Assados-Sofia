import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  actionCriarPedidoCliente,
  actionListarMeusPedidosCliente,
  actionAtualizarStatusPedido,
  actionAtualizarStatusPagamento,
} from '@/app/actions/pedidos'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/orders/orderNotifications', () => ({
  notificarClienteAtualizacaoPedido: vi.fn().mockResolvedValue({
    web: true,
    whatsapp: true,
    telegram: false,
    erros: [],
  }),
}))

vi.mock('@/app/actions/chat', () => ({
  processarIaChat: vi.fn().mockResolvedValue({ success: true }),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

describe('End-to-End Client Order Submission, Locking & Tracking Flow', () => {
  let mockUserClient: any
  let mockAdminClient: any
  let mockCliente: any
  let mockCarrinho: any
  let mockPedidoInserido: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockCliente = {
      id: 'cliente-c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
      nome: 'Carlos Phone',
      telefone: '5541999998888',
      usuario_id: 'user-c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
    }

    mockCarrinho = {
      id: 'carrinho-123',
      cliente_id: mockCliente.id,
      horario_retirada: '12:30',
      itens_carrinho: [
        {
          id: 'item-cart-1',
          produto_id: 'prod-1',
          quantidade: 2,
          preco_unitario_centavos: 8990,
          produtos: {
            id: 'prod-1',
            nome: 'Costela Premium',
            preco_centavos: 8990,
            ativo: true,
          },
        },
      ],
    }

    mockPedidoInserido = {
      id: 'ped-99999999-0000-0000-0000-000000000000',
      cliente_id: mockCliente.id,
      conversa_id: 'conversa-123',
      status: 'novo',
      tipo_entrega: 'retirada',
      total_produtos_centavos: 17980,
      total_pedido_centavos: 17980,
      status_pagamento: 'pendente',
      meio_pagamento: 'pix',
      data_criacao: new Date().toISOString(),
    }

    mockUserClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: mockCliente.usuario_id } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: mockCliente.usuario_id, funcao: 'admin', ativo: true },
              error: null,
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    }

    mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockCliente, error: null }),
          }
        }
        if (table === 'carrinhos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockCarrinho, error: null }),
            single: vi.fn().mockResolvedValue({ data: mockCarrinho, error: null }),
          }
        }
        if (table === 'pedidos') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockPedidoInserido, error: null }),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [mockPedidoInserido], error: null }),
            delete: vi.fn().mockReturnThis(),
          }
        }
        if (table === 'itens_pedido') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'itens_carrinho') {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'mensagens') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'msg-123',
                conversa_id: 'conversa-123',
                remetente: 'cliente',
                conteudo: 'Pedido Registrado',
              },
              error: null,
            }),
          }
        }
        if (table === 'conversas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { ia_ativa: true }, error: null }),
            update: vi.fn().mockReturnThis(),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
      rpc: vi.fn((name: string) => {
        if (name === 'transicionar_status_pedido') {
          return Promise.resolve({ data: true, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    }

    vi.mocked(createClient).mockResolvedValue(mockUserClient)
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient)
  })

  it('submits cart as a real order in pedidos, clears cart, and records chat message', async () => {
    const result = await actionCriarPedidoCliente({
      conversaId: 'conversa-123',
      horarioRetirada: '12:30',
    })

    expect(result.success).toBe(true)
    expect(result.pedido).toBeDefined()
    expect(result.pedido?.status).toBe('novo')
    expect(result.pedido?.total_pedido_centavos).toBe(17980)

    // Verify itens_pedido insertion
    expect(mockAdminClient.from).toHaveBeenCalledWith('itens_pedido')

    // Verify cart clearance
    expect(mockAdminClient.from).toHaveBeenCalledWith('itens_carrinho')

    // Verify chat message insertion
    expect(mockAdminClient.from).toHaveBeenCalledWith('mensagens')
  })

  it('lists client orders for tracking history in web dashboard', async () => {
    const res = await actionListarMeusPedidosCliente()

    expect(res.success).toBe(true)
    expect(res.data).toHaveLength(1)
    expect(res.data[0].id).toBe(mockPedidoInserido.id)
  })
})
