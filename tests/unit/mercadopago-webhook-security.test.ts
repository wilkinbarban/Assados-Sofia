import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  obterConfiguracaoSistema: vi.fn(),
  createAdminClient: vi.fn(),
  admitDelivery: vi.fn(),
}))

vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: mocks.obterConfiguracaoSistema,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { POST, isMercadoPagoAccessTokenConfigured, isMercadoPagoWebhookSignatureValid } from '@/app/api/webhooks/mercadopago/route'

const secret = 'webhook-secret'
const requestId = 'request-123'
const paymentId = 'payment-456'
const nowMs = 1_705_000_000_000

function signature(timestamp: string | number = Math.floor(nowMs / 1000)) {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${timestamp};`
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  return `ts=${timestamp},v1=${hash}`
}

function request(headers: HeadersInit = {}) {
  return new Request(`https://asados.test/api/webhooks/mercadopago?data.id=${paymentId}&topic=payment`, {
    method: 'POST',
    headers,
    body: '{',
  })
}

function signedRequest() {
  return request({
    'x-request-id': requestId,
    'x-signature': signature(),
  })
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(nowMs)
  mocks.obterConfiguracaoSistema.mockResolvedValue(secret)
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '')
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.admitDelivery })
  mocks.admitDelivery.mockResolvedValue({ data: true, error: null })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('MercadoPago webhook signature', () => {
  it('accepts a valid signature', () => {
    expect(isMercadoPagoWebhookSignatureValid(signature(), requestId, paymentId, secret)).toBe(true)
  })

  it.each([
    [Math.floor(nowMs / 1000), true],
    [nowMs, true],
    [Math.floor((nowMs - 300_000) / 1000), true],
    [Math.floor((nowMs - 300_001) / 1000), false],
    [Math.floor((nowMs + 1_000) / 1000), false],
    ['not-a-timestamp', false],
  ])('validates the signed timestamp %s', (timestamp, expected) => {
    expect(isMercadoPagoWebhookSignatureValid(signature(timestamp), requestId, paymentId, secret)).toBe(expected)
  })

  it.each([
    [null, requestId, paymentId, secret],
    ['ts=1704908010,v1=invalid', requestId, paymentId, secret],
    [signature(), null, paymentId, secret],
    [signature(), requestId, null, secret],
    [signature(), requestId, paymentId, null],
  ])('rejects incomplete or invalid signatures', (header, id, dataId, configuredSecret) => {
    expect(isMercadoPagoWebhookSignatureValid(header, id, dataId, configuredSecret)).toBe(false)
  })
})

describe('MercadoPago credential validation', () => {
  it.each([undefined, 'placeholder', 'insert_here', 'your_access_token'])('rejects unavailable tokens', (token) => {
    expect(isMercadoPagoAccessTokenConfigured(token)).toBe(false)
  })

  it('accepts a configured access token', () => {
    expect(isMercadoPagoAccessTokenConfigured('APP_USR-configured-token')).toBe(true)
  })
})

describe('MercadoPago webhook endpoint', () => {
  it('rejects unsigned requests before parsing their body', async () => {
    const response = await POST(request())

    expect(response.status).toBe(401)
  })

  it('returns unavailable when a signed request arrives without a configured payment token', async () => {
    const response = await POST(signedRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'payment_processing_unavailable' })
  })

  it('admits a fresh delivery before queueing payment processing', async () => {
    vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', 'APP_USR-configured-token')

    const response = await POST(signedRequest())

    expect(response.status).toBe(200)
    expect(mocks.admitDelivery).toHaveBeenCalledWith('admitir_webhook_mercado_pago', {
      p_request_id: requestId,
      p_payment_id: paymentId,
    })
  })

  it('waits for durable admission before queueing payment processing', async () => {
    vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', 'APP_USR-configured-token')
    const admission = Promise.withResolvers<{ data: boolean; error: null }>()
    mocks.admitDelivery.mockReturnValueOnce(admission.promise)

    const responsePromise = POST(signedRequest())

    await vi.waitFor(() => expect(mocks.admitDelivery).toHaveBeenCalledTimes(1))
    expect(fetch).not.toHaveBeenCalled()

    admission.resolve({ data: true, error: null })

    await expect(responsePromise).resolves.toHaveProperty('status', 200)
  })

  it('acknowledges duplicate deliveries without queueing payment processing', async () => {
    vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', 'APP_USR-configured-token')
    mocks.admitDelivery.mockResolvedValue({ data: false, error: null })

    const response = await POST(signedRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'duplicate' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a retriable error when delivery admission is unavailable', async () => {
    vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', 'APP_USR-configured-token')
    mocks.admitDelivery.mockResolvedValue({ data: null, error: { message: 'unavailable' } })

    const response = await POST(signedRequest())

    expect(response.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
})
