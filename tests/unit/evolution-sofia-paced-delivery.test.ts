import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  obterConfiguracaoSistema: vi.fn(),
  validarEnvioWhatsAppSafety: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: mocks.obterConfiguracaoSistema,
}))

vi.mock('@/lib/whatsapp/safety', () => ({
  validarEnvioWhatsAppSafety: mocks.validarEnvioWhatsAppSafety,
}))

import { enviarMensagemEvolution } from '@/lib/whatsapp/evolution'

describe('Evolution Sofia paced delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => ({
      EVOLUTION_API_URL: 'https://evolution.test/',
      EVOLUTION_API_KEY: 'evolution-key',
      EVOLUTION_INSTANCE_NAME: 'asados-main',
    })[key] ?? null)
    mocks.validarEnvioWhatsAppSafety.mockResolvedValue({ permitido: true })
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue(
            table === 'mensagens'
              ? { data: { data_criacao: new Date().toISOString() }, error: null }
              : { data: null, error: null },
          ),
          single: vi.fn().mockResolvedValue({
            data: { id: 'conversation-1', cliente_id: 'customer-1', clientes: { telefone: '5541999990003', ultima_interacao_recebida_em: new Date().toISOString() } },
            error: null,
          }),
        }
        return builder
      }),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ key: { id: 'evolution-message-1' } }), { status: 200 })))
  })

  it('keeps Evolution composing for the durable worker remainder without persisting a second message', async () => {
    const result = await enviarMensagemEvolution('conversation-1', {
      texto: 'Resposta pronta',
      remetente: 'ia',
      salvarNoBanco: false,
      typingDelayMs: 37,
    })

    expect(result).toMatchObject({ sucesso: true, whatsappMensagemId: 'evolution-message-1', mensagem: null })
    expect(fetch).toHaveBeenCalledWith(
      'https://evolution.test/message/sendText/asados-main',
      expect.objectContaining({
        body: JSON.stringify({
          number: '5541999990003',
          options: { delay: 37, presence: 'composing' },
          text: 'Resposta pronta',
          textMessage: { text: 'Resposta pronta' },
        }),
      }),
    )
  })
})
