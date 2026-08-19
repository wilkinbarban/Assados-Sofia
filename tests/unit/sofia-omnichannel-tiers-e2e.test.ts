import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processarRagPipeline } from '@/lib/ai/openrouter'
import * as omniroute from '@/lib/ai/omniroute'

// Mocks do Supabase e integrações de canais
vi.mock('@/lib/supabase/admin', () => {
  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        const createQueryBuilder = () => {
          const qb: any = {
            select: vi.fn(() => qb),
            eq: vi.fn(() => qb),
            order: vi.fn(() => qb),
            limit: vi.fn(() => qb),
            insert: vi.fn(() => qb),
            single: vi.fn(),
            maybeSingle: vi.fn(),
          }

          if (table === 'conversas') {
            qb.single.mockResolvedValue({
              data: {
                id: 'conversa-123',
                cliente_id: 'cliente-123',
                ia_ativa: true,
                clientes: {
                  telefone: '5541999998888',
                  nome: 'Wilkin',
                  telegram_chat_id: 'telegram-999',
                },
              },
              error: null,
            })
          } else if (table === 'mensagens') {
            qb.single.mockResolvedValue({
              data: { id: 'msg-1', conteudo: 'Resposta da Sofia' },
              error: null,
            })
            qb.limit.mockResolvedValue({ data: [], error: null })
          } else if (table === 'horarios_atendimento') {
            qb.order.mockResolvedValue({ data: [], error: null })
          } else if (table === 'carrinhos') {
            qb.maybeSingle.mockResolvedValue({ data: null, error: null })
          } else if (table === 'whatsapp_sofia_state') {
            qb.maybeSingle.mockResolvedValue({
              data: { sofia_dormindo: false, canal: 'whatsapp' },
              error: null,
            })
          } else {
            qb.maybeSingle.mockResolvedValue({ data: null, error: null })
            qb.single.mockResolvedValue({ data: null, error: null })
          }

          return qb
        }

        return createQueryBuilder()
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  }
})

vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/whatsapp/send', () => ({
  enviarMensagemWhatsapp: vi.fn().mockResolvedValue({
    sucesso: true,
    mensagem: { id: 'wpp-msg-1' },
  }),
}))

vi.mock('@/lib/telegram/send', () => ({
  enviarMensagemTelegram: vi.fn().mockResolvedValue({
    sucesso: true,
    mensagem: { id: 'tg-msg-1' },
  }),
}))

describe('Sofia Omnichannel RAG Pipeline — Roteamento em 3 Níveis', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('despacha para OmniRoute com tier business-economy quando recebe FAQ no canal Web', async () => {
    process.env.AI_ROUTING_V2_ENABLED = 'true'
    const spyChamarOmni = vi.spyOn(omniroute, 'chamarOmniRouteGateway').mockResolvedValue({
      success: true,
      content: 'Nosso horário de atendimento aos domingos é das 11h às 14h.',
      modelResoluvel: 'deepseek/deepseek-chat',
      latenciaMs: 120,
    })

    const res = await processarRagPipeline(
      'conversa-123',
      'Que horas vocês abrem no domingo?',
      'web'
    )

    expect(res.sucesso).toBe(true)
    expect(res.canal).toBe('web')
    expect(spyChamarOmni).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'business-economy',
      })
    )
  })

  it('despacha para OmniRoute com tier business-smart quando recebe objeção comercial no WhatsApp', async () => {
    process.env.AI_ROUTING_V2_ENABLED = 'true'
    const spyChamarOmni = vi.spyOn(omniroute, 'chamarOmniRouteGateway').mockResolvedValue({
      success: true,
      content: 'Nossa costela é assada lentamente por 8 horas no bafo com lenha nobre!',
      modelResoluvel: 'gpt-4o',
      latenciaMs: 250,
    })

    const res = await processarRagPipeline(
      'conversa-123',
      'Achei um pouco caro em relação ao concorrente, tem desconto?',
      'whatsapp'
    )

    expect(res.sucesso).toBe(true)
    expect(res.canal).toBe('whatsapp')
    expect(spyChamarOmni).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'business-smart',
      })
    )
  })

  it('despacha para OmniRoute com tier business-frontier quando recebe evento grande no Telegram', async () => {
    process.env.AI_ROUTING_V2_ENABLED = 'true'
    const spyChamarOmni = vi.spyOn(omniroute, 'chamarOmniRouteGateway').mockResolvedValue({
      success: true,
      content: 'Com certeza! Para 60 pessoas preparamos uma mesa farta e personalizada com nota fiscal PJ.',
      modelResoluvel: 'claude-3-5-sonnet',
      latenciaMs: 400,
    })

    const res = await processarRagPipeline(
      'conversa-123',
      'Gostaria de um orçamento corporativo de churrasco para 60 pessoas na nossa empresa.',
      'telegram'
    )

    expect(res.sucesso).toBe(true)
    expect(res.canal).toBe('telegram')
    expect(spyChamarOmni).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'business-frontier',
      })
    )
  })

  it('executa fallback suave para Mock/Legacy quando OmniRoute falha', async () => {
    process.env.AI_ROUTING_V2_ENABLED = 'true'
    process.env.AI_ROUTING_LEGACY_FALLBACK_ENABLED = 'true'

    vi.spyOn(omniroute, 'chamarOmniRouteGateway').mockResolvedValue({
      success: false,
      error: 'TIMEOUT_OMNIROUTE',
      latenciaMs: 5001,
    })

    const res = await processarRagPipeline(
      'conversa-123',
      'Qual o cardápio?',
      'web'
    )

    expect(res.sucesso).toBe(true)
    expect(res.canal).toBe('web')
    expect(res.respostaIa).toBeDefined()
  })
})
