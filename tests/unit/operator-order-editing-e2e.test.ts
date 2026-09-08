import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  actionEditarItensPedidoOperador,
} from '@/app/actions/pedidos'
import {
  actionListarCatalogoProdutos,
} from '@/app/actions/produtos'

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

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificarClienteAtualizacaoPedido } from '@/lib/orders/orderNotifications'

describe('Operator Order Item Editing & Real-Time Recalculation Flow', () => {
  let mockUserClient: any
  let mockAdminClient: any
  let mockPedidoExistente: any
  let mockProdutosDb: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockPedidoExistente = {
      id: 'ped-11111111-1111-1111-1111-111111111111',
      cliente_id: 'cli-11111111-1111-1111-1111-111111111111',
      conversa_id: 'conv-11111111-1111-1111-1111-111111111111',
      status: 'novo',
      status_pagamento: 'pendente',
      tipo_entrega: 'retirada',
      taxa_entrega_centavos: 0,
      total_produtos_centavos: 8990,
      total_pedido_centavos: 8990,
    }

    mockProdutosDb = [
      {
        id: 'prod-costela-1111-1111-1111-111111111111',
        nome: 'Costela Premium 1kg',
        preco_centavos: 8990,
        ativo: true,
      },
      {
        id: 'prod-paoalho-2222-2222-2222-222222222222',
        nome: 'Pão de Alho Especial 400g',
        preco_centavos: 1500,
        ativo: true,
      },
    ]

    mockUserClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'operador-uuid-123' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'operador-uuid-123', funcao: 'vendedor', ativo: true },
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
        if (table === 'produtos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: mockProdutosDb, error: null }),
            order: vi.fn().mockResolvedValue({ data: mockProdutosDb, error: null }),
          }
        }
        if (table === 'pedidos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockPedidoExistente, error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      ...mockPedidoExistente,
                      total_produtos_centavos: 11990,
                      total_pedido_centavos: 11990,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'itens_pedido') {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'mensagens') {
          return {
            insert: vi.fn().mockResolvedValue({ data: { id: 'msg-edit-123' }, error: null }),
          }
        }
        if (table === 'conversas') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    }

    vi.mocked(createClient).mockResolvedValue(mockUserClient)
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient)
  })

  it('lists active catalog products for operator selection', async () => {
    const res = await actionListarCatalogoProdutos()

    expect(res.success).toBe(true)
    expect(res.data).toHaveLength(2)
    expect(res.data[0].nome).toBe('Costela Premium 1kg')
  })

  it('keeps the legacy notification for non-canonical item edits while recalculating totals', async () => {
    // 1 Costela (89,90) + 2 Pães de Alho (2x 15,00 = 30,00) = Total 119,90 (11990 centavos)
    const novosItens = [
      {
        produto_id: mockProdutosDb[0].id,
        quantidade: 1,
        preco_unitario_centavos: 8990,
      },
      {
        produto_id: mockProdutosDb[1].id,
        quantidade: 2,
        preco_unitario_centavos: 1500,
      },
    ]

    const result = await actionEditarItensPedidoOperador({
      pedidoId: mockPedidoExistente.id,
      itens: novosItens,
      notificarCliente: true,
    })

    expect(result.success).toBe(true)
    expect(result.totalProdutosCentavos).toBe(11990)
    expect(result.totalPedidoCentavos).toBe(11990)

    // Verify deletion and replacement of items
    expect(mockAdminClient.from).toHaveBeenCalledWith('itens_pedido')

    // A single legacy dispatcher carries the detailed non-canonical update.
    expect(notificarClienteAtualizacaoPedido).toHaveBeenCalledTimes(1)
    expect(notificarClienteAtualizacaoPedido).toHaveBeenCalledWith(
      expect.objectContaining({
        pedidoId: mockPedidoExistente.id,
        tipo: 'status_pedido',
        mensagem: expect.stringContaining('Itens Atualizados'),
      })
    )
  })

  it('rejects editing if user is not authorized', async () => {
    mockUserClient.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'operador-uuid-123', funcao: 'cliente', ativo: true },
        error: null,
      }),
    })

    const result = await actionEditarItensPedidoOperador({
      pedidoId: mockPedidoExistente.id,
      itens: [
        {
          produto_id: mockProdutosDb[0].id,
          quantidade: 1,
          preco_unitario_centavos: 8990,
        },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('ACESSO_NEGADO_PERMISSAO_INSUFICIENTE')
  })
})
