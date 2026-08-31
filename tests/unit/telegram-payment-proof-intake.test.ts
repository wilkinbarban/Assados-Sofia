import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  obterConfiguracaoSistema: vi.fn(),
  obterSofiaGlobalChannelConfig: vi.fn(),
  verificarHorarioAtendimento: vi.fn(),
  queueCanonicalPaymentProof: vi.fn(),
  downloadTelegramDocument: vi.fn(),
  gates: { canonicalIngest: { effective: true } },
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: mocks.obterConfiguracaoSistema,
  obterSofiaGlobalChannelConfig: mocks.obterSofiaGlobalChannelConfig,
}))
vi.mock('@/lib/horarios/verificar', () => ({ verificarHorarioAtendimento: mocks.verificarHorarioAtendimento }))
vi.mock('@/lib/payment-proofs/canonical-intake', () => ({ queueCanonicalPaymentProof: mocks.queueCanonicalPaymentProof }))
vi.mock('@/lib/telegram/document-download', () => ({ downloadTelegramDocument: mocks.downloadTelegramDocument }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: mocks.gates }))

import { POST } from '@/app/api/webhooks/telegram/route'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])

function request(document: Record<string, unknown>, secret = 'secret-token') {
  return new Request('https://asados.test/api/webhooks/telegram', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({
      message: {
        message_id: 77,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        document,
      },
    }),
  })
}

function adminClient(customer: { id: string; telefone: string | null } | null = { id: 'customer-1', telefone: null }) {
  const storageBucket = { upload: vi.fn(), remove: vi.fn() }
  const client = {
    storage: { from: vi.fn(() => storageBucket) },
    rpc: vi.fn(async () => ({ data: { state: 'missing' }, error: null })),
    from: vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === 'mensagens') return { data: null, error: null }
          if (table === 'clientes') return { data: customer, error: null }
          return { data: null, error: null }
        }),
        single: vi.fn(async () => ({ data: { id: 'created-customer' }, error: null })),
      }
      return builder
    }),
  }
  return { client, storageBucket }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.gates.canonicalIngest.effective = true
  mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => {
    if (key === 'TELEGRAM_WEBHOOK_SECRET_TOKEN') return 'secret-token'
    return 'bot-token'
  })
  mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ enabled: false })
  mocks.verificarHorarioAtendimento.mockResolvedValue({ dentro: false, mensagem: 'Fechado' })
  mocks.downloadTelegramDocument.mockResolvedValue({ ok: true, bytes: PDF, mimeType: 'application/pdf' })
  mocks.queueCanonicalPaymentProof.mockResolvedValue({ status: 'queued', proofId: 'proof-1' })
})

describe('Telegram canonical payment-proof intake', () => {
  it('receives a valid PDF while Sofia is globally off and uses the scoped message key as delivery identity', async () => {
    const { client, storageBucket } = adminClient()
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(request({ file_id: 'inbound-file-id', mime_type: 'application/pdf', file_size: PDF.length, file_name: 'pix.pdf' }))

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ ok: true, status: 'payment_proof_received' })
    expect(mocks.obterSofiaGlobalChannelConfig).not.toHaveBeenCalled()
    expect(mocks.verificarHorarioAtendimento).not.toHaveBeenCalled()
    expect(mocks.queueCanonicalPaymentProof).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'telegram',
      deliveryId: 'telegram:1001:77',
      customerId: 'customer-1',
      orderId: null,
      bytes: PDF,
      mimeType: 'application/pdf',
      db: client,
      storage: storageBucket,
    }))
    expect(client.storage.from).toHaveBeenCalledWith('payment-proofs')
  })

  it('acknowledges an already queued authenticated replay without token lookup or download', async () => {
    const { client } = adminClient()
    client.rpc.mockResolvedValueOnce({ data: { state: 'queued', proof_id: 'proof-1' }, error: null })
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(request({ file_id: 'file', mime_type: 'application/pdf', file_size: PDF.length }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, status: 'payment_proof_duplicate' })
    expect(client.rpc).toHaveBeenCalledWith('get_payment_proof_delivery_state', { p_channel: 'telegram', p_delivery_key: 'telegram:1001:77' })
    expect(mocks.obterConfiguracaoSistema).not.toHaveBeenCalledWith('TELEGRAM_BOT_TOKEN')
    expect(mocks.downloadTelegramDocument).not.toHaveBeenCalled()
    expect(mocks.queueCanonicalPaymentProof).not.toHaveBeenCalled()
  })

  it('uses the newly created customer when Telegram has not been linked before', async () => {
    const { client } = adminClient(null)
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(request({ file_id: 'file', mime_type: 'application/pdf', file_size: PDF.length }))

    expect(response.status).toBe(202)
    expect(mocks.queueCanonicalPaymentProof).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'created-customer' }))
  })

  it('acknowledges duplicate and validation rejection, but asks Telegram to retry infrastructure failure', async () => {
    const { client } = adminClient()
    mocks.createAdminClient.mockReturnValue(client)

    for (const [result, expectedStatus, expectedBodyStatus] of [
      [{ status: 'duplicate' }, 200, 'payment_proof_duplicate'],
      [{ status: 'rejected', error: 'PDF_SIGNATURE_INVALID' }, 422, 'payment_proof_rejected'],
      [{ status: 'retryable', error: 'PAYMENT_PROOF_STORAGE_FAILED' }, 503, 'payment_proof_retryable'],
    ] as const) {
      mocks.queueCanonicalPaymentProof.mockResolvedValueOnce(result)
      const response = await POST(request({ file_id: 'file', mime_type: 'application/pdf', file_size: PDF.length }))
      expect(response.status).toBe(expectedStatus)
      expect(await response.json()).toEqual(expect.objectContaining({ ok: expectedStatus < 300, status: expectedBodyStatus }))
    }
  })

  it('rejects invalid declared metadata without downloading', async () => {
    const { client } = adminClient()
    mocks.createAdminClient.mockReturnValue(client)

    for (const document of [
      { file_id: 'file', mime_type: 'image/png', file_size: 100 },
      { file_id: 'file', mime_type: 'application/pdf', file_size: 5 * 1024 * 1024 + 1 },
    ]) {
      const response = await POST(request(document))
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ ok: false, status: 'payment_proof_rejected', message: 'Documento PDF inválido.' })
    }
    expect(mocks.downloadTelegramDocument).not.toHaveBeenCalled()
  })

  it('maps a non-retryable Telegram download rejection to a safe validation response', async () => {
    const { client } = adminClient()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.downloadTelegramDocument.mockResolvedValue({ ok: false, error: 'TELEGRAM_FILE_TOO_LARGE', retryable: false })

    const response = await POST(request({ file_id: 'file', mime_type: 'application/pdf', file_size: PDF.length }))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ ok: false, status: 'payment_proof_rejected', message: 'Documento PDF inválido.' })
    expect(mocks.queueCanonicalPaymentProof).not.toHaveBeenCalled()
  })

  it('does not admit a PDF when the immutable gate is closed despite DB configuration being open', async () => {
    const { client } = adminClient()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.gates.canonicalIngest.effective = false

    const response = await POST(request({ file_id: 'file', mime_type: 'application/pdf', file_size: PDF.length }))

    expect(response.status).toBe(200)
    expect(mocks.downloadTelegramDocument).not.toHaveBeenCalled()
    expect(mocks.queueCanonicalPaymentProof).not.toHaveBeenCalled()
  })

  it('bypasses token lookup and download when canonical intake is disabled, then uses the legacy acknowledgement', async () => {
    const { client } = adminClient()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.gates.canonicalIngest.effective = false
    mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => {
      if (key === 'TELEGRAM_WEBHOOK_SECRET_TOKEN') return 'secret-token'
      if (key === 'TELEGRAM_BOT_TOKEN') throw new Error('disabled intake must not look up the bot token')
      return 'unused'
    })
    mocks.downloadTelegramDocument.mockRejectedValue(new Error('disabled intake must not download'))

    const response = await POST(request({ file_id: 'file', mime_type: 'application/pdf', file_size: PDF.length }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, status: 'global_off' })
    expect(mocks.obterConfiguracaoSistema).not.toHaveBeenCalledWith('TELEGRAM_BOT_TOKEN')
    expect(mocks.downloadTelegramDocument).not.toHaveBeenCalled()
    expect(mocks.queueCanonicalPaymentProof).not.toHaveBeenCalled()
  })

  it('does not parse or download a PDF when webhook authentication fails', async () => {
    const bodyRequest = {
      headers: new Headers({ 'x-telegram-bot-api-secret-token': 'wrong' }),
      json: vi.fn(),
    } as unknown as Request & { json: ReturnType<typeof vi.fn> }

    const response = await POST(bodyRequest)

    expect(response.status).toBe(401)
    expect(bodyRequest.json).not.toHaveBeenCalled()
    expect(mocks.downloadTelegramDocument).not.toHaveBeenCalled()
  })
})

describe('Telegram document download boundary', () => {
  async function actualDownloader() {
    return (await vi.importActual<typeof import('@/lib/telegram/document-download')>('@/lib/telegram/document-download')).downloadTelegramDocument
  }

  it('uses only Telegram API URLs assembled from a safe relative file path', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'documents/proof.pdf' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(PDF, { status: 200, headers: { 'content-length': String(PDF.length) } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await (await actualDownloader())({ token: 'token', fileId: 'opaque', maxBytes: 5 * 1024 * 1024, timeoutMs: 1000 })

    expect(result).toEqual({ ok: true, bytes: PDF, mimeType: 'application/pdf' })
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.telegram.org/bottoken/getFile?file_id=opaque',
      'https://api.telegram.org/file/bottoken/documents/proof.pdf',
    ])
  })

  it('rejects getFile redirects without following them to another origin', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.redirect !== 'error') {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'https://evil.test/proof.pdf' } }), { status: 200 })
      }
      return new Response(null, { status: 302, headers: { location: 'https://evil.test/getFile' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect((await actualDownloader())({ token: 'token', fileId: 'opaque', maxBytes: 10, timeoutMs: 1000 }))
      .resolves.toEqual({ ok: false, error: 'TELEGRAM_GET_FILE_FAILED', retryable: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/getFile?'), expect.objectContaining({ redirect: 'error' }))
  })

  it('rejects file download redirects without following them to another origin', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'documents/proof.pdf' } }), { status: 200 }))
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        if (init?.redirect !== 'error') return new Response(PDF, { status: 200 })
        return new Response(null, { status: 302, headers: { location: 'https://evil.test/proof.pdf' } })
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect((await actualDownloader())({ token: 'token', fileId: 'opaque', maxBytes: 10, timeoutMs: 1000 }))
      .resolves.toEqual({ ok: false, error: 'TELEGRAM_FILE_DOWNLOAD_FAILED', retryable: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://api.telegram.org/file/bottoken/documents/proof.pdf',
      expect.objectContaining({ redirect: 'error' }),
    ])
  })

  it('rejects unsafe paths and actual oversized downloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'https://evil.test/proof.pdf' } }), { status: 200 })))
    const download = await actualDownloader()
    await expect(download({ token: 'token', fileId: 'opaque', maxBytes: 10, timeoutMs: 1000 })).resolves.toEqual({ ok: false, error: 'TELEGRAM_FILE_PATH_INVALID', retryable: false })

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'documents/proof.pdf' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(11), { status: 200 })))
    await expect(download({ token: 'token', fileId: 'opaque', maxBytes: 10, timeoutMs: 1000 })).resolves.toEqual({ ok: false, error: 'TELEGRAM_FILE_TOO_LARGE', retryable: false })
  })

  it('turns a download timeout into a safe retryable failure', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))

    await expect((await actualDownloader())({ token: 'token', fileId: 'opaque', maxBytes: 10, timeoutMs: 1 }))
      .resolves.toEqual({ ok: false, error: 'TELEGRAM_FILE_DOWNLOAD_TIMEOUT', retryable: true })
  })
})
