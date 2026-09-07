import { chromium } from '@playwright/test'

const DEFAULT_TIMEOUT_MS = 15_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 60_000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const requiredNames = [
  'PAYMENT_PROOF_CANARY_BASE_URL',
  'PAYMENT_PROOF_CANARY_PROOF_ID',
  'PAYMENT_PROOF_CANARY_ORDER_ID',
  'PAYMENT_PROOF_CANARY_CONVERSATION_ID',
  'PAYMENT_PROOF_CANARY_ADMIN_EMAIL',
  'PAYMENT_PROOF_CANARY_ADMIN_PASSWORD',
]

/** @param {Record<string, string | undefined>} env */
export function requiredEnvironment(env = process.env) {
  const missing = requiredNames.filter((name) => typeof env[name] !== 'string' || !env[name].trim())
  if (missing.length) throw new Error(`Missing required canary configuration: ${missing.join(', ')}`)
  if (!uuid.test(env.PAYMENT_PROOF_CANARY_PROOF_ID) || !uuid.test(env.PAYMENT_PROOF_CANARY_ORDER_ID) || !uuid.test(env.PAYMENT_PROOF_CANARY_CONVERSATION_ID)) {
    throw new Error('Fixture proof, order, and conversation identifiers must be UUIDs')
  }
  let url
  try { url = new URL(env.PAYMENT_PROOF_CANARY_BASE_URL) } catch { throw new Error('Canary base URL must be a valid URL') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Canary base URL must use HTTP(S)')
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) && !url.hostname.endsWith('.test')) {
    throw new Error('Refusing non-local/non-test canary base URL')
  }
  const mode = env.PAYMENT_PROOF_CANARY_MODE || 'admin-restore'
  if (!['admin-restore', 'closed-gate-denial'].includes(mode)) throw new Error('Canary mode must be admin-restore or closed-gate-denial')
  const timeoutMs = env.PAYMENT_PROOF_CANARY_TIMEOUT_MS === undefined ? DEFAULT_TIMEOUT_MS : Number(env.PAYMENT_PROOF_CANARY_TIMEOUT_MS)
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error('Canary timeout must be a finite integer between 1000 and 60000 milliseconds')
  }
  return {
    baseUrl: env.PAYMENT_PROOF_CANARY_BASE_URL,
    proofId: env.PAYMENT_PROOF_CANARY_PROOF_ID,
    orderId: env.PAYMENT_PROOF_CANARY_ORDER_ID,
    conversationId: env.PAYMENT_PROOF_CANARY_CONVERSATION_ID,
    adminEmail: env.PAYMENT_PROOF_CANARY_ADMIN_EMAIL,
    adminPassword: env.PAYMENT_PROOF_CANARY_ADMIN_PASSWORD,
    mode,
    timeoutMs,
  }
}

function proofSuffix(proofId) { return proofId.slice(-8) }
function proofMarker(proofId) { return `ID …${proofSuffix(proofId)}` }

export function selectUniqueProof(cards, proofId) {
  const matches = cards.filter((card) => card.textContent?.includes(proofMarker(proofId)))
  if (matches.length !== 1) throw new Error(matches.length ? 'Refusing ambiguous proof card match' : 'Explicit proof card was not found')
  return matches[0]
}

async function login(page, config) {
  await page.goto(new URL('/login', config.baseUrl).toString(), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Equipe / Operador', exact: true }).click()
  await page.getByLabel('E-mail Corporativo', { exact: true }).fill(config.adminEmail)
  await page.getByLabel('Senha', { exact: true }).fill(config.adminPassword)
  await page.getByRole('button', { name: 'Entrar na Conta', exact: true }).click()
  await page.waitForURL(/\/atendimento(\/admin)?/, { timeout: config.timeoutMs })
}

export async function runCanary(config = requiredEnvironment()) {
  let browser
  let context
  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(config.timeoutMs)
    await login(page, config)
    await page.goto(new URL('/atendimento/admin?tab=comprovantes', config.baseUrl).toString(), { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: /^Quarentena \d+$/, exact: true }).click()
    const marker = proofMarker(config.proofId)
    const cardLocator = page.locator('article').filter({ hasText: marker })
    await cardLocator.waitFor({ state: 'visible' })
    const count = await cardLocator.count()
    if (count !== 1) throw new Error(count ? 'Refusing ambiguous proof card match' : 'Explicit proof card was not found')

    if (config.mode === 'closed-gate-denial') {
      await cardLocator.getByRole('button', { name: 'Restaurar', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Confirmar restauração', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'Você não tem permissão para esta operação.' }).waitFor()
      return { mode: config.mode, result: 'denied', proofId: config.proofId }
    }

    await cardLocator.getByRole('button', { name: 'Restaurar', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar restauração', exact: true }).click()
    await page.getByRole('button', { name: 'Revisão manual', exact: false }).click()
    const restoredCard = page.locator('article').filter({ hasText: marker })
    if (await restoredCard.count() !== 1) throw new Error('Restore did not produce the expected review state')
    return { mode: config.mode, result: 'restored', proofId: config.proofId }
  } finally {
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }
}

export function safeCliError(error) {
  if (error instanceof Error && error.message.startsWith('Missing required canary configuration:')) return error.message
  if (error instanceof Error && error.message.startsWith('Fixture proof, order, and conversation identifiers')) return error.message
  if (error instanceof Error && error.message.startsWith('Canary ')) return error.message
  if (error instanceof Error && error.message.startsWith('Refusing non-local')) return error.message
  if (error instanceof Error && error.message.startsWith('Canary mode')) return error.message
  return 'CANARY_FAILED'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await runCanary()
    process.stdout.write(`payment-proof-restore-canary: ${result.result} (${result.mode})\n`)
  } catch (error) {
    process.stderr.write(`payment-proof-restore-canary: ${safeCliError(error)}\n`)
    process.exitCode = 1
  }
}
