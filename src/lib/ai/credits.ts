import { obterConfiguracaoSistema } from '@/lib/config/sistema'

export type LlmCreditProvider = 'deepseek' | 'openrouter'
export type LlmCreditColor = 'green' | 'yellow' | 'red' | 'neutral'
export type LlmCreditState = 'fresh' | 'stale' | 'unknown'

export type LlmCreditStatus = {
  provider: LlmCreditProvider
  balanceUsd: number | null
  state: LlmCreditState
  fetchedAt: string | null
  expiresAt: string | null
  freshnessMs: number
  color: LlmCreditColor
  error?: string
}

type JsonRecord = Record<string, unknown>

type ProviderResolutionInput = {
  openRouterApiKey?: string | null
  deepSeekApiKey?: string | null
  model?: string | null
  provider?: string | null
}

type ProviderResolution = {
  provider: LlmCreditProvider
  apiKey: string | null
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000
const OPENROUTER_CREDITS_URL = 'https://openrouter.ai/api/v1/credits'
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key'
const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance'

let cachedStatus: LlmCreditStatus | null = null

export function getLlmCreditColor(balanceUsd: number | null): LlmCreditColor {
  if (balanceUsd == null || !Number.isFinite(balanceUsd)) return 'neutral'
  if (balanceUsd > 2) return 'green'
  if (balanceUsd > 1) return 'yellow'
  return 'red'
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function readNumber(source: JsonRecord | null, keys: string[]): number | null {
  if (!source) return null

  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return null
}

function nestedData(payload: unknown): JsonRecord | null {
  const root = asRecord(payload)
  if (!root) return null
  return asRecord(root.data) ?? root
}

function isPlaceholder(value: string | null | undefined): boolean {
  if (!value) return true

  const placeholders = [
    'placeholder',
    'your_openrouter_api_key',
    'insert_here',
    'your_key',
    'your-api-key',
  ]

  const lowerValue = value.toLowerCase()
  return placeholders.some((placeholder) => lowerValue.includes(placeholder))
}

function isDirectDeepSeekKey(apiKey: string | null | undefined): boolean {
  return Boolean(apiKey?.startsWith('sk-') && !apiKey.includes('sk-or-'))
}

function isUsableApiKey(apiKey: string | null | undefined): boolean {
  return !isPlaceholder(apiKey)
}

export function resolveLlmCreditProvider(input: ProviderResolutionInput): ProviderResolution {
  const openRouterApiKey = input.openRouterApiKey?.trim() || null
  const deepSeekApiKey = input.deepSeekApiKey?.trim() || null
  const providerHint = input.provider?.toLowerCase() ?? ''
  const modelHint = input.model?.toLowerCase() ?? ''

  if (isUsableApiKey(openRouterApiKey)) {
    if (isDirectDeepSeekKey(openRouterApiKey)) {
      return { provider: 'deepseek', apiKey: openRouterApiKey }
    }

    return { provider: 'openrouter', apiKey: openRouterApiKey }
  }

  if (isUsableApiKey(deepSeekApiKey)) {
    return { provider: 'deepseek', apiKey: deepSeekApiKey }
  }

  if (providerHint.includes('openrouter') || modelHint.includes('openrouter')) {
    return { provider: 'openrouter', apiKey: openRouterApiKey }
  }

  return { provider: 'openrouter', apiKey: openRouterApiKey }
}

export function parseOpenRouterRemainingUsd(creditsPayload: unknown, keyPayload: unknown): number | null {
  const credits = nestedData(creditsPayload)
  const key = nestedData(keyPayload)

  const directKeyRemaining = readNumber(key, [
    'limit_remaining',
    'credits_remaining',
    'remaining_credits',
    'remaining',
  ])
  if (directKeyRemaining != null) return Math.max(0, directKeyRemaining)

  const limit = readNumber(key, ['limit', 'credit_limit', 'credits_limit'])
  const keyUsage = readNumber(key, ['usage', 'used', 'credits_used'])
  if (limit != null && keyUsage != null) return Math.max(0, limit - keyUsage)

  const totalCredits = readNumber(credits, ['total_credits', 'credits', 'purchased', 'total_purchased'])
  const totalUsage = readNumber(credits, ['total_usage', 'usage', 'used', 'credits_used'])
  if (totalCredits != null && totalUsage != null) return Math.max(0, totalCredits - totalUsage)

  return null
}

export function parseDeepSeekRemainingUsd(balancePayload: unknown): number | null {
  const root = asRecord(balancePayload)
  const balanceInfos = Array.isArray(root?.balance_infos) ? root.balance_infos : []

  for (const item of balanceInfos) {
    const balance = asRecord(item)
    if (typeof balance?.currency !== 'string') continue
    if (balance.currency.toUpperCase() !== 'USD') continue
    return readNumber(balance, ['total_balance'])
  }

  return null
}

function freshStatus(provider: LlmCreditProvider, balanceUsd: number | null, now: Date): LlmCreditStatus {
  const fetchedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + THIRTY_MINUTES_MS).toISOString()

  return {
    provider,
    balanceUsd,
    state: balanceUsd == null ? 'unknown' : 'fresh',
    fetchedAt,
    expiresAt,
    freshnessMs: THIRTY_MINUTES_MS,
    color: getLlmCreditColor(balanceUsd),
  }
}

function staleStatus(provider: LlmCreditProvider, now: Date, error: string): LlmCreditStatus {
  return {
    provider,
    balanceUsd: null,
    state: cachedStatus ? 'stale' : 'unknown',
    fetchedAt: cachedStatus?.fetchedAt ?? null,
    expiresAt: cachedStatus?.expiresAt ?? null,
    freshnessMs: THIRTY_MINUTES_MS,
    color: 'neutral',
    error,
  }
}

function isCacheFresh(now: Date): boolean {
  if (!cachedStatus || cachedStatus.state !== 'fresh' || !cachedStatus.expiresAt) return false
  return new Date(cachedStatus.expiresAt).getTime() > now.getTime()
}

async function fetchJson(url: string, apiKey: string, provider: LlmCreditProvider): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`${provider} credits request failed with HTTP ${response.status}`)
  }

  return response.json()
}

export async function getLlmCreditStatus(options: { forceRefresh?: boolean; now?: Date } = {}): Promise<LlmCreditStatus> {
  const now = options.now ?? new Date()

  if (!options.forceRefresh && isCacheFresh(now)) {
    return cachedStatus as LlmCreditStatus
  }

  const [openRouterApiKey, configuredDeepSeekApiKey, model] = await Promise.all([
    obterConfiguracaoSistema('OPENROUTER_API_KEY'),
    obterConfiguracaoSistema('DEEPSEEK_API_KEY'),
    obterConfiguracaoSistema('OPENROUTER_MODEL'),
  ])

  const { provider, apiKey } = resolveLlmCreditProvider({
    openRouterApiKey,
    deepSeekApiKey: configuredDeepSeekApiKey || process.env.DEEPSEEK_API_KEY,
    model,
  })

  if (isPlaceholder(apiKey)) {
    return staleStatus(provider, now, `${provider} API key is not configured`)
  }

  try {
    if (provider === 'deepseek') {
      const payload = await fetchJson(DEEPSEEK_BALANCE_URL, apiKey as string, provider)
      const status = freshStatus(provider, parseDeepSeekRemainingUsd(payload), now)
      cachedStatus = status
      return status
    }

    const [creditsPayload, keyPayload] = await Promise.all([
      fetchJson(OPENROUTER_CREDITS_URL, apiKey as string, provider),
      fetchJson(OPENROUTER_KEY_URL, apiKey as string, provider),
    ])
    const status = freshStatus(provider, parseOpenRouterRemainingUsd(creditsPayload, keyPayload), now)
    cachedStatus = status
    return status
  } catch (error) {
    return staleStatus(provider, now, error instanceof Error ? error.message : 'Unknown credit provider error')
  }
}

export function resetLlmCreditStatusCacheForTests() {
  cachedStatus = null
}
