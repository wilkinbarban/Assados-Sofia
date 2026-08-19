import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  chamarOmniRouteGateway,
  isOmniRouteEnabled,
  isLegacyFallbackEnabled,
} from '@/lib/ai/omniroute'

describe('OmniRoute Gateway Client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('verifica se o OmniRoute está habilitado via feature flag', () => {
    process.env.AI_ROUTING_V2_ENABLED = 'true'
    expect(isOmniRouteEnabled()).toBe(true)

    process.env.AI_ROUTING_V2_ENABLED = 'false'
    expect(isOmniRouteEnabled()).toBe(false)
  })

  it('verifica se o fallback legacy está ativo por padrão', () => {
    delete process.env.AI_ROUTING_LEGACY_FALLBACK_ENABLED
    expect(isLegacyFallbackEnabled()).toBe(true)

    process.env.AI_ROUTING_LEGACY_FALLBACK_ENABLED = 'false'
    expect(isLegacyFallbackEnabled()).toBe(false)
  })

  it('executa chamada com sucesso para o endpoint OpenAI-compatible', async () => {
    process.env.OMNIROUTE_BASE_URL = 'http://127.0.0.1:20128'
    process.env.OMNIROUTE_API_KEY = 'test-crm-key'

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-test',
        model: 'deepseek/deepseek-chat',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Olá! Como posso ajudar com o almoço de domingo?',
            },
          },
        ],
      }),
    })

    global.fetch = mockFetch

    const res = await chamarOmniRouteGateway({
      model: 'business-economy',
      messages: [{ role: 'user', content: 'Boa tarde!' }],
    })

    expect(res.success).toBe(true)
    expect(res.content).toBe('Olá! Como posso ajudar com o almoço de domingo?')
    expect(res.modelResoluvel).toBe('deepseek/deepseek-chat')
    expect(res.latenciaMs).toBeGreaterThanOrEqual(0)

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:20128/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-crm-key',
        }),
      })
    )
  })

  it('trata adequadamente respostas HTTP de erro (ex: 500)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Provider error',
    })

    const res = await chamarOmniRouteGateway({
      model: 'business-smart',
      messages: [{ role: 'user', content: 'Qual o melhor combo?' }],
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('HTTP_500')
  })

  it('trata adequadamente respostas com conteúdo vazio', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    })

    const res = await chamarOmniRouteGateway({
      model: 'business-economy',
      messages: [{ role: 'user', content: 'Olá' }],
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('RESPOSTA_VAZIA_OMNIROUTE')
  })
})
