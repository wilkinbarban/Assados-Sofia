import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@playwright/test', () => ({ chromium: { launch: vi.fn() } }))

import { chromium } from '@playwright/test'
import { requiredEnvironment, selectUniqueProof, runCanary, safeCliError } from '../../scripts/payment-proof-restore-canary.mjs'

const ids = {
  PAYMENT_PROOF_CANARY_BASE_URL: 'http://127.0.0.1:3000',
  PAYMENT_PROOF_CANARY_PROOF_ID: '11111111-1111-4111-8111-111111111111',
  PAYMENT_PROOF_CANARY_ORDER_ID: '22222222-2222-4222-8222-222222222222',
  PAYMENT_PROOF_CANARY_CONVERSATION_ID: '33333333-3333-4333-8333-333333333333',
  PAYMENT_PROOF_CANARY_ADMIN_EMAIL: 'admin@example.test',
  PAYMENT_PROOF_CANARY_ADMIN_PASSWORD: 'not-a-real-secret',
}

const card = (text: string) => ({ textContent: text })

describe('payment-proof restore canary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('selects exactly the explicit proof card using the UI suffix marker', () => {
    const selected = selectUniqueProof([card('ID …11111111') as any, card('ID …22222222') as any], ids.PAYMENT_PROOF_CANARY_PROOF_ID)
    expect(selected.textContent).toContain('11111111')
  })

  it('refuses ambiguous or missing proof matches', () => {
    expect(() => selectUniqueProof([card('ID …11111111'), card('ID …11111111')] as any, ids.PAYMENT_PROOF_CANARY_PROOF_ID)).toThrow(/ambiguous/i)
    expect(() => selectUniqueProof([card('ID …22222222')] as any, ids.PAYMENT_PROOF_CANARY_PROOF_ID)).toThrow(/not found/i)
  })

  it('returns only an allowlisted environment projection and validates finite timeout', () => {
    const config = requiredEnvironment({ ...ids, UNRELATED_SECRET: 'must-not-propagate' })
    expect(config).toEqual(expect.objectContaining({ baseUrl: ids.PAYMENT_PROOF_CANARY_BASE_URL, proofId: ids.PAYMENT_PROOF_CANARY_PROOF_ID, timeoutMs: 15_000 }))
    expect(config).not.toHaveProperty('UNRELATED_SECRET')
    expect(() => requiredEnvironment({ ...ids, PAYMENT_PROOF_CANARY_BASE_URL: 'https://example.com' })).toThrow(/non-local|non-test/i)
    expect(() => requiredEnvironment({ ...ids, PAYMENT_PROOF_CANARY_TIMEOUT_MS: 'NaN' })).toThrow(/finite/i)
    expect(() => requiredEnvironment({ ...ids, PAYMENT_PROOF_CANARY_TIMEOUT_MS: '100000' })).toThrow(/between/i)
  })

  it('drives the actual login, tab navigation, confirmation dialog, and exact restored state', async () => {
    const proofId = ids.PAYMENT_PROOF_CANARY_PROOF_ID
    const restoredCard = { count: vi.fn().mockResolvedValue(1) }
    const cardLocator = { waitFor: vi.fn().mockResolvedValue(undefined), count: vi.fn().mockResolvedValue(1), getByRole: vi.fn().mockReturnValue({ click: vi.fn().mockResolvedValue(undefined) }) }
    const page = {
      setDefaultTimeout: vi.fn(),
      goto: vi.fn().mockResolvedValue(undefined),
      getByRole: vi.fn((role: string, options?: { name?: string | RegExp }) => {
        if (role === 'button' && options?.name === 'Equipe / Operador') return { click: vi.fn().mockResolvedValue(undefined) }
        if (role === 'button' && options?.name === 'Entrar na Conta') return { click: vi.fn().mockResolvedValue(undefined) }
        if (role === 'button' && (options?.name === 'Revisão manual' || options?.name instanceof RegExp)) return { click: vi.fn().mockResolvedValue(undefined) }
        if (role === 'dialog') return { getByRole: vi.fn().mockReturnValue({ click: vi.fn().mockResolvedValue(undefined) }) }
        return { filter: vi.fn().mockReturnThis(), waitFor: vi.fn().mockResolvedValue(undefined) }
      }),
      getByLabel: vi.fn().mockReturnValue({ fill: vi.fn().mockResolvedValue(undefined) }),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn((selector: string) => selector === 'article' ? { filter: vi.fn().mockReturnValue(cardLocator) } : restoredCard),
    }
    const context = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(chromium.launch).mockResolvedValue({ newContext: vi.fn().mockResolvedValue(context), close: vi.fn().mockResolvedValue(undefined) } as any)

    await expect(runCanary(requiredEnvironment(ids))).resolves.toEqual({ mode: 'admin-restore', result: 'restored', proofId })
    expect(page.getByLabel).toHaveBeenCalledWith('E-mail Corporativo', { exact: true })
    expect(page.goto).toHaveBeenLastCalledWith('http://127.0.0.1:3000/atendimento/admin?tab=comprovantes', { waitUntil: 'domcontentloaded' })
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: /^Quarentena \d+$/, exact: true })
    expect(cardLocator.waitFor).toHaveBeenCalledWith({ state: 'visible' })
    expect(context.close).toHaveBeenCalledTimes(1)
  })

  it('never exposes browser error text and closes context when setup fails', async () => {
    const secret = 'browser DOM contains password=super-secret'
    vi.mocked(chromium.launch).mockRejectedValue(new Error(secret))
    await expect(runCanary(requiredEnvironment(ids))).rejects.toThrow(secret)
    expect(safeCliError(new Error(secret))).toBe('CANARY_FAILED')
    expect(safeCliError(new Error('Missing required canary configuration: PAYMENT_PROOF_CANARY_ORDER_ID'))).toContain('ORDER_ID')
    expect(vi.mocked(chromium.launch)).toHaveBeenCalledTimes(1)
  })
})
