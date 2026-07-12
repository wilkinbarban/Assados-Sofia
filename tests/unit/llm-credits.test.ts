import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getLlmCreditColor,
  getLlmCreditStatus,
  parseDeepSeekRemainingUsd,
  parseOpenRouterRemainingUsd,
  resetLlmCreditStatusCacheForTests,
  resolveLlmCreditProvider,
} from '@/lib/ai/credits'

const mocks = vi.hoisted(() => ({
  obterConfiguracaoSistema: vi.fn(),
}))

vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: mocks.obterConfiguracaoSistema,
}))

afterEach(() => {
  resetLlmCreditStatusCacheForTests()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('LLM credit helpers', () => {
  it('maps USD balance to status colors', () => {
    expect(getLlmCreditColor(2.01)).toBe('green')
    expect(getLlmCreditColor(1.5)).toBe('yellow')
    expect(getLlmCreditColor(1)).toBe('red')
    expect(getLlmCreditColor(0.75)).toBe('red')
    expect(getLlmCreditColor(null)).toBe('neutral')
  })

  it('detects direct DeepSeek keys stored in the legacy OpenRouter key slot', () => {
    expect(resolveLlmCreditProvider({
      openRouterApiKey: 'sk-direct-deepseek-key',
      model: 'deepseek-reasoner',
    })).toEqual({ provider: 'deepseek', apiKey: 'sk-direct-deepseek-key' })
  })

  it('uses OpenRouter when both OpenRouter and fallback DeepSeek keys are available', () => {
    expect(resolveLlmCreditProvider({
      openRouterApiKey: 'sk-or-openrouter-key',
      deepSeekApiKey: 'sk-deepseek-key',
    })).toEqual({ provider: 'openrouter', apiKey: 'sk-or-openrouter-key' })
  })

  it.each([
    'placeholder',
    'your_openrouter_api_key',
    'insert_here',
    'your_key',
    'your-api-key',
  ])('uses DeepSeek fallback when OpenRouter key is unusable: %s', (openRouterApiKey) => {
    expect(resolveLlmCreditProvider({
      openRouterApiKey,
      deepSeekApiKey: 'sk-deepseek-key',
    })).toEqual({ provider: 'deepseek', apiKey: 'sk-deepseek-key' })
  })

  it('keeps OpenRouter keys on the OpenRouter credit adapter', () => {
    expect(resolveLlmCreditProvider({
      openRouterApiKey: 'sk-or-openrouter-key',
      model: 'openrouter/deepseek/deepseek-r1',
    })).toEqual({ provider: 'openrouter', apiKey: 'sk-or-openrouter-key' })
  })

  it('parses DeepSeek USD balances when present', () => {
    expect(parseDeepSeekRemainingUsd({
      balance_infos: [
        { currency: 'CNY', total_balance: '18.50' },
        { currency: 'USD', total_balance: '2.75' },
      ],
    })).toBe(2.75)
  })

  it('does not convert DeepSeek CNY-only balances into fake USD', () => {
    expect(parseDeepSeekRemainingUsd({
      balance_infos: [
        { currency: 'CNY', total_balance: '18.50' },
      ],
    })).toBeNull()
  })

  it('prefers OpenRouter key remaining credits when available', () => {
    expect(parseOpenRouterRemainingUsd(
      { data: { total_credits: 10, total_usage: 7 } },
      { data: { limit_remaining: 4.5 } },
    )).toBe(4.5)
  })

  it('falls back to purchased minus used credits', () => {
    expect(parseOpenRouterRemainingUsd(
      { data: { total_credits: '12.25', total_usage: '3.25' } },
      { data: {} },
    )).toBe(9)
  })

  it('does not invent an OpenRouter balance when provider payload shape is unknown', () => {
    expect(parseOpenRouterRemainingUsd({ data: { balance: 'unknown' } }, { data: {} })).toBeNull()
  })

  it('returns neutral stale status without presenting cached balance as current when refresh fails', async () => {
    mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => {
      if (key === 'OPENROUTER_API_KEY') return 'sk-or-openrouter-key'
      if (key === 'OPENROUTER_MODEL') return 'openrouter/deepseek/deepseek-chat'
      return null
    })

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/key')) {
        return new Response(JSON.stringify({ data: { limit_remaining: 2.5 } }), { status: 200 })
      }

      return new Response(JSON.stringify({ data: {} }), { status: 200 })
    }))

    const fresh = await getLlmCreditStatus({ now: new Date('2026-07-10T12:00:00.000Z') })
    expect(fresh).toMatchObject({
      balanceUsd: 2.5,
      state: 'fresh',
      color: 'green',
      fetchedAt: '2026-07-10T12:00:00.000Z',
    })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('provider down', { status: 503 })))

    const stale = await getLlmCreditStatus({
      forceRefresh: true,
      now: new Date('2026-07-10T12:31:00.000Z'),
    })

    expect(stale).toMatchObject({
      balanceUsd: null,
      state: 'stale',
      color: 'neutral',
      fetchedAt: '2026-07-10T12:00:00.000Z',
    })
  })
})
