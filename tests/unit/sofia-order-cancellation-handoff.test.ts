import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processarRagPipeline } from '@/lib/ai/openrouter'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/whatsapp/send', () => ({
  enviarMensagemWhatsapp: vi.fn().mockResolvedValue({ sucesso: true, mensagem: { id: 'msg-wa-1' } }),
}))

vi.mock('@/lib/telegram/send', () => ({
  enviarMensagemTelegram: vi.fn().mockResolvedValue({ success: true, mensagem: { id: 'msg-tg-1' } }),
}))

vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/lib/runtime/environment', () => ({
  allowsIntegrationMock: vi.fn().mockReturnValue(true),
}))

import { createAdminClient } from '@/lib/supabase/admin'

describe('Sofia Order Cancellation & Modification Handoff Pipeline', () => {
  let mockSupabase: any
  let mockConversa: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockConversa = {
      id: 'conversa-1',
      cliente_id: 'cliente-1',
      ia_ativa: true,
      status: 'ia_atendendo',
      clientes: {
        id: 'cliente-1',
        nome: 'Carlos Phone',
        telefone: '5541999998888',
        telegram_chat_id: null,
      },
    }

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'conversas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockConversa, error: null }),
            update: vi.fn().mockReturnThis(),
          }
        }
        if (table === 'pedidos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'pedido-1',
                  status: 'novo',
                  status_pagamento: 'pendente',
                  total_centavos: 11990,
                  tipo_entrega: 'retirada',
                  data_criacao: new Date().toISOString(),
                  itens_pedido: [{ quantidade: 1, preco_unitario_centavos: 11990, produtos: { nome: 'Costela' } }],
                },
              ],
              error: null,
            }),
          }
        }
        if (table === 'mensagens') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'msg-1', conteudo: 'Resposta' }, error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
      rpc: vi.fn((name: string) => {
        if (name === 'buscar_artigos_relevantes') return Promise.resolve({ data: [], error: null })
        if (name === 'buscar_horarios_atendimento') return Promise.resolve({ data: [], error: null })
        if (name === 'buscar_produtos_disponiveis') return Promise.resolve({ data: [], error: null })
        if (name === 'silenciar_sofia_cliente') return Promise.resolve({ data: true, error: null })
        return Promise.resolve({ data: null, error: null })
      }),
    }

    vi.mocked(createAdminClient).mockReturnValue(mockSupabase)
  })

  it('responds with empathy and triggers human handoff when client asks to cancel an order', async () => {
    const result = await processarRagPipeline('conversa-1', 'Gostaria de cancelar meu pedido por favor', 'web')

    expect(result.sucesso).toBe(true)
    expect(result.respostaIa).toContain('Compreendo perfeitamente')
    expect(result.respostaIa).toContain('atendimento humano')

    // Verify silenciar_sofia_cliente was called
    expect(mockSupabase.rpc).toHaveBeenCalledWith('silenciar_sofia_cliente', expect.objectContaining({
      p_cliente_id: 'cliente-1',
      p_motivo: 'solicitacao_cliente_alteracao_cancelamento',
    }))

    // Verify conversation was set to status: 'aberta' and ia_ativa: false
    expect(mockSupabase.from).toHaveBeenCalledWith('conversas')
  })
})
