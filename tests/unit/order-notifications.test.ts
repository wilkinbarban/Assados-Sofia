import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notificarClienteAtualizacaoPedido } from '@/lib/orders/orderNotifications'

vi.mock('@/lib/whatsapp/send', () => ({
  enviarMensagemWhatsapp: vi.fn().mockResolvedValue({ sucesso: true, whatsappMensagemId: 'wamid.123' }),
}))

vi.mock('@/lib/telegram/send', () => ({
  enviarMensagemTelegram: vi.fn().mockResolvedValue({ success: true, messageId: 'tg.123' }),
}))

describe('Order Notifications Service (Omnichannel)', () => {
  let mockSupabase: any
  let mockPedido: any
  let insertMessage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    insertMessage = vi.fn().mockResolvedValue({ error: null })

    mockPedido = {
      id: 'pedido-12345678-0000-0000-0000-000000000000',
      conversa_id: 'conversa-123',
      cliente_id: 'cliente-123',
      clientes: {
        id: 'cliente-123',
        nome: 'João Web',
        telefone: '5541988888888',
        telegram_chat_id: '123456789',
      },
    }

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'pedidos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockPedido, error: null }),
          }
        }
        if (table === 'mensagens') {
          return {
            insert: insertMessage,
          }
        }
        if (table === 'conversas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conversa-123' }, error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    }
  })

  it('notifies client across Web Chat, WhatsApp, and Telegram on order confirmation', async () => {
    const result = await notificarClienteAtualizacaoPedido({
      pedidoId: mockPedido.id,
      tipo: 'status_pedido',
      novoStatus: 'confirmado',
      supabaseClient: mockSupabase,
    })

    expect(result.web).toBe(true)
    expect(result.whatsapp).toBe(true)
    expect(result.telegram).toBe(true)
    expect(result.erros).toHaveLength(0)
    expect(insertMessage).not.toHaveBeenCalled()
  })

  it('notifies client on payment approval', async () => {
    const result = await notificarClienteAtualizacaoPedido({
      pedidoId: mockPedido.id,
      tipo: 'status_pagamento',
      statusPagamento: 'aprovado',
      supabaseClient: mockSupabase,
    })

    expect(result.web).toBe(true)
    expect(result.whatsapp).toBe(true)
    expect(result.telegram).toBe(true)
  })

  it('gracefully handles client without Telegram or WhatsApp phone', async () => {
    mockPedido.clientes.telegram_chat_id = null
    mockPedido.clientes.telefone = null

    const result = await notificarClienteAtualizacaoPedido({
      pedidoId: mockPedido.id,
      tipo: 'status_pedido',
      novoStatus: 'entregue',
      supabaseClient: mockSupabase,
    })

    expect(result.web).toBe(true)
    expect(result.whatsapp).toBe(false)
    expect(result.telegram).toBe(false)
    expect(insertMessage).toHaveBeenCalledTimes(1)
  })
})
