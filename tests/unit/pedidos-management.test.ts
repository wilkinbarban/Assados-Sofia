import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  actionListarPedidos,
  actionAtualizarStatusPedido,
  actionAtualizarStatusPagamento,
} from '@/app/actions/pedidos'
import { createClient } from '@/lib/supabase/server'

// Mock Supabase Server Client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/calendar/google', () => ({
  agendarPedidoNoCalendario: vi.fn().mockResolvedValue('mock-google-event-id'),
}))

describe('Gestão de Pedidos - Server Actions (TDD)', () => {
  const mockUser = { id: 'user-op-1', email: 'atendente@asados.com' }
  const mockPerfil = { id: 'user-op-1', funcao: 'vendedor', ativo: true }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejeita listagem de pedidos se o operador não estiver autenticado', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Não autenticado') }),
      },
    }
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const res = await actionListarPedidos()
    expect(res.success).toBe(false)
    expect(res.error).toBe('ACESSO_NEGADO_NAO_AUTENTICADO')
  })

  it('lista pedidos com sucesso para operador autorizado', async () => {
    const mockPedidosData = [
      {
        id: 'ped-1',
        status: 'confirmado',
        tipo_entrega: 'retirada',
        total_pedido_centavos: 6990,
        status_pagamento: 'aprovado',
        meio_pagamento: 'pix',
        data_criacao: '2026-08-17T12:00:00Z',
        cliente_id: 'cli-1',
        clientes: { id: 'cli-1', nome: 'Carlos Silva', telefone: '5541999998888' },
        itens: [
          {
            id: 'item-1',
            quantidade: 1,
            preco_unitario_centavos: 6990,
            preco_total_centavos: 6990,
            produtos: { id: 'prod-1', nome: 'Combo 1 - Clássico' },
          },
        ],
      },
    ]

    const mockQueryBuilder: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockPedidosData, error: null }),
    }

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockPerfil, error: null }),
              }),
            }),
          }
        }
        if (table === 'pedidos') {
          return mockQueryBuilder
        }
        return {}
      }),
    }

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const res = await actionListarPedidos({ status: 'confirmado' })
    expect(res.success).toBe(true)
    expect(res.data).toHaveLength(1)
    expect(res.data?.[0].id).toBe('ped-1')
  })

  it('atualiza status do pedido para entregue e aprova pagamento', async () => {
    const mockUpdatedPedido = {
      id: 'ped-1',
      status: 'entregue',
      status_pagamento: 'aprovado',
    }

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockPerfil, error: null }),
              }),
            }),
          }
        }
        if (table === 'pedidos') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockUpdatedPedido, error: null }),
                }),
              }),
            }),
          }
        }
        return {}
      }),
    }

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const res = await actionAtualizarStatusPedido({
      pedidoId: 'ped-1',
      novoStatus: 'entregue',
    })

    expect(res.success).toBe(true)
    expect(res.data?.status).toBe('entregue')
  })

  it('cancela o pedido restaurando o estoque via RPC', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockPerfil, error: null }),
              }),
            }),
          }
        }
        return {}
      }),
      rpc: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { status: 'cancelado' }, error: null }),
      }),
    }

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const res = await actionAtualizarStatusPedido({
      pedidoId: 'ped-1',
      novoStatus: 'cancelado',
    })

    expect(res.success).toBe(true)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('cancelar_pedido_estoque', {
      p_pedido_id: 'ped-1',
      p_correlation_id: 'ped-1',
    })
  })

  it('atualiza o status de pagamento para aprovado', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockPerfil, error: null }),
              }),
            }),
          }
        }
        if (table === 'pedidos') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'ped-1', status_pagamento: 'aprovado' }, error: null }),
                }),
              }),
            }),
          }
        }
        return {}
      }),
    }

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const res = await actionAtualizarStatusPagamento({
      pedidoId: 'ped-1',
      statusPagamento: 'aprovado',
    })

    expect(res.success).toBe(true)
    expect(res.data?.status_pagamento).toBe('aprovado')
  })
})
