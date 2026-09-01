import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(), obterConfiguracaoSistema: vi.fn(), obterSofiaGlobalChannelConfig: vi.fn(),
  verificarHorarioAtendimento: vi.fn(), processCanonicalPaymentProof: vi.fn(), downloadEvolutionPdf: vi.fn(),
  gates: { canonicalIngest: { effective: true }, whatsappIngest: { effective: true } },
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/config/sistema', () => ({ obterConfiguracaoSistema: mocks.obterConfiguracaoSistema, obterSofiaGlobalChannelConfig: mocks.obterSofiaGlobalChannelConfig }))
vi.mock('@/lib/horarios/verificar', () => ({ verificarHorarioAtendimento: mocks.verificarHorarioAtendimento }))
vi.mock('@/lib/payment-proofs/canonical-intake', () => ({ processCanonicalPaymentProof: mocks.processCanonicalPaymentProof }))
vi.mock('@/lib/whatsapp/evolution-media-download', () => ({ downloadEvolutionPdf: mocks.downloadEvolutionPdf }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: mocks.gates }))

import { POST } from '@/app/api/webhooks/evolution/route'
import { EVOLUTION_PAYMENT_PROOF_FIXTURE_SHA256, EVOLUTION_PAYMENT_PROOF_PROFILE } from '@/lib/whatsapp/evolution-payment-proof-compatibility'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const config: Record<string, string> = {
  EVOLUTION_WEBHOOK_SECRET: 'webhook-secret', EVOLUTION_API_KEY: 'api-key', EVOLUTION_API_URL: 'https://evolution.test', EVOLUTION_INSTANCE_NAME: 'main',
  PAYMENT_PROOF_CANONICAL_INGEST_ENABLED: 'true', WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED: 'true', PROVEDOR_WHATSAPP_ATIVO: 'evolution', WHATSAPP_PROVIDER: 'meta',
  EVOLUTION_PAYMENT_PROOF_ATTESTATION: JSON.stringify({
    release: 'v2.3.7', profile: EVOLUTION_PAYMENT_PROOF_PROFILE,
    fixtureSha256: EVOLUTION_PAYMENT_PROOF_FIXTURE_SHA256, attestedAt: new Date().toISOString(),
  }),
}
function request(
  headers: HeadersInit = { 'x-webhook-secret': 'webhook-secret' },
  mime = 'application/pdf',
  key: Record<string, unknown> = { id: 'message-77', fromMe: false, remoteJid: '5541999990003@s.whatsapp.net' },
  fileLength: unknown = PDF.length,
) {
  return new Request('https://asados.test/api/webhooks/evolution', { method: 'POST', headers, body: JSON.stringify({
    event: 'messages.upsert', instance: 'main', data: { key, pushName: 'Ana', message: { documentMessage: { mimetype: mime, fileLength } } },
  }) })
}
function adminClient(options: { customer?: { id: string } | null; customerLookupError?: boolean; customerCreateError?: boolean } = {}) {
  const storageBucket = { upload: vi.fn(), remove: vi.fn() }
  const customer = options.customer === undefined ? { id: 'customer-1' } : options.customer
  const client: any = { storage: { from: vi.fn(() => storageBucket) }, rpc: vi.fn(), from: vi.fn((table: string) => {
    const builder: any = {
      select: vi.fn(() => builder), eq: vi.fn(() => builder), order: vi.fn(() => builder), limit: vi.fn(() => builder), insert: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => table === 'clientes'
        ? { data: customer, error: options.customerLookupError ? { message: 'private lookup detail' } : null }
        : { data: null, error: null }),
      single: vi.fn(async () => table === 'clientes' && options.customerCreateError
        ? { data: null, error: { message: 'private create detail' } }
        : { data: { id: `${table}-1` }, error: null }),
    }
    return builder
  }) }
  return { client, storageBucket }
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.gates.canonicalIngest.effective = true; mocks.gates.whatsappIngest.effective = true; mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => config[key] ?? null)
  mocks.downloadEvolutionPdf.mockResolvedValue({ ok: true, bytes: PDF, mimeType: 'application/pdf' })
  mocks.processCanonicalPaymentProof.mockResolvedValue({ status: 'accepted', proofId: 'proof-1' })
})

describe('Evolution canonical payment-proof intake', () => {
  it('authenticates before parsing and permits the legacy API key without activating canonical intake', async () => {
    const malformed: any = { headers: new Headers(), json: vi.fn() }
    const response = await POST(malformed)
    expect(response.status).toBe(401); expect(malformed.json).not.toHaveBeenCalled()

    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client); mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ enabled: false })
    const legacyResponse = await POST(request({ apikey: 'api-key' }))
    expect(legacyResponse.status).toBe(200)
    expect(mocks.downloadEvolutionPdf).not.toHaveBeenCalled()
    expect(mocks.processCanonicalPaymentProof).not.toHaveBeenCalled()
    expect(client.from).toHaveBeenCalledWith('mensagens')
  })

  it('routes a compatible PDF with a Long-shaped size directly to canonical intake without legacy message dedupe', async () => {
    const { client, storageBucket } = adminClient(); mocks.createAdminClient.mockReturnValue(client)
    const response = await POST(request(undefined, 'application/pdf', undefined, { low: PDF.length, high: 0, unsigned: true }))
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ success: true, status: 'payment_proof_received' })
    expect(client.from).not.toHaveBeenCalledWith('mensagens')
    expect(mocks.downloadEvolutionPdf).toHaveBeenCalledWith(expect.objectContaining({ instanceName: 'main', declaredMimeType: 'application/pdf', declaredSize: PDF.length }))
    expect(mocks.processCanonicalPaymentProof).toHaveBeenCalledWith(expect.objectContaining({ channel: 'whatsapp', deliveryId: 'evolution:main:message-77', customerId: 'customer-1', orderId: null, sender: '5541999990003', bytes: PDF, db: client, storage: storageBucket }))
  })

  it('rejects a noncanonical document size before download with only a static marker', async () => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const response = await POST(request(undefined, 'application/pdf', undefined, { low: PDF.length, high: 0, unsigned: true, extra: 'private' }))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ success: false, status: 'payment_proof_rejected' })
    expect(mocks.downloadEvolutionPdf).not.toHaveBeenCalled()
    expect(mocks.processCanonicalPaymentProof).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalledWith('mensagens')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[Evolution Webhook] CANONICAL_DOCUMENT_SIZE_REJECTED')
    warn.mockRestore()
  })

  it('routes an Evolution 2.3.7 LID sender through its structurally valid phone alternate', async () => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client)
    const response = await POST(request(undefined, 'application/pdf', {
      id: 'message-77', fromMe: false, addressingMode: 'lid',
      remoteJid: '123456789012345@lid', remoteJidAlt: '5541999990003@s.whatsapp.net',
    }))
    expect(response.status).toBe(202)
    expect(mocks.processCanonicalPaymentProof).toHaveBeenCalledWith(expect.objectContaining({ sender: '5541999990003' }))
  })

  it.each([
    ['CANONICAL_503_CUSTOMER_LOOKUP', () => adminClient({ customerLookupError: true }), () => undefined, mocks.downloadEvolutionPdf],
    ['CANONICAL_503_CUSTOMER_CREATE', () => adminClient({ customer: null, customerCreateError: true }), () => undefined, mocks.downloadEvolutionPdf],
    ['CANONICAL_503_EVOLUTION_CONFIG', () => adminClient(), () => mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => key === 'EVOLUTION_API_URL' ? null : config[key] ?? null), mocks.downloadEvolutionPdf],
    ['CANONICAL_503_MEDIA_TIMEOUT', () => adminClient(), () => mocks.downloadEvolutionPdf.mockResolvedValue({ ok: false, error: 'EVOLUTION_MEDIA_DOWNLOAD_TIMEOUT', retryable: true }), mocks.processCanonicalPaymentProof],
    ['CANONICAL_503_PROCESSING', () => adminClient(), () => mocks.processCanonicalPaymentProof.mockResolvedValue({ status: 'retryable' }), vi.fn()],
  ])('returns the canonical 503 body with only static marker %s and stops later work', async (marker, makeAdmin, arrange, laterStage) => {
    const { client } = makeAdmin(); mocks.createAdminClient.mockReturnValue(client); arrange()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ success: false, status: 'payment_proof_retryable' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(`[Evolution Webhook] ${marker}`)
    expect(laterStage).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it.each([
    ['EVOLUTION_MEDIA_HTTP_UPSTREAM', 'CANONICAL_503_MEDIA_UPSTREAM'],
    ['EVOLUTION_MEDIA_NETWORK', 'CANONICAL_503_MEDIA_NETWORK'],
    ['EVOLUTION_MEDIA_DOWNLOAD_TIMEOUT', 'CANONICAL_503_MEDIA_TIMEOUT'],
    ['EVOLUTION_MEDIA_FUTURE_RETRYABLE', 'CANONICAL_503_MEDIA_UNKNOWN'],
  ])('maps retryable media category %s to exact static marker %s and stops processing', async (error, marker) => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client)
    mocks.downloadEvolutionPdf.mockResolvedValue({ ok: false, error, retryable: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await POST(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ success: false, status: 'payment_proof_retryable' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(`[Evolution Webhook] ${marker}`)
    expect(mocks.processCanonicalPaymentProof).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalledWith('mensagens')
    warn.mockRestore()
  })

  it.each([
    'EVOLUTION_MEDIA_HTTP_AUTH',
    'EVOLUTION_MEDIA_HTTP_CONTRACT',
    'EVOLUTION_MEDIA_HTTP_UNEXPECTED',
    'EVOLUTION_MEDIA_MIME_INVALID',
  ])('rejects non-retryable media category %s generically without logging or later processing', async (error) => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client)
    mocks.downloadEvolutionPdf.mockResolvedValue({ ok: false, error, retryable: false })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(request())

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ success: false, status: 'payment_proof_rejected' })
    expect(warn).not.toHaveBeenCalled()
    expect(errorLog).not.toHaveBeenCalled()
    expect(mocks.processCanonicalPaymentProof).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalledWith('mensagens')
    warn.mockRestore()
    errorLog.mockRestore()
  })

  it.each([
    [{ status: 'duplicate' }, 200, 'payment_proof_duplicate'], [{ status: 'accepted' }, 202, 'payment_proof_received'], [{ status: 'retryable' }, 503, 'payment_proof_retryable'], [{ status: 'rejected' }, 422, 'payment_proof_rejected'],
  ])('maps canonical outcomes without approval or order association', async (processed, status, resultStatus) => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client); mocks.processCanonicalPaymentProof.mockResolvedValue(processed)
    const response = await POST(request()); expect(response.status).toBe(status); expect(await response.json()).toEqual({ success: status < 300, status: resultStatus })
  })

  it('does not admit a PDF when immutable gates are closed despite DB values being open', async () => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client)
    mocks.gates.canonicalIngest.effective = false
    mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ enabled: false })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.downloadEvolutionPdf).not.toHaveBeenCalled()
    expect(mocks.processCanonicalPaymentProof).not.toHaveBeenCalled()
    expect(mocks.obterConfiguracaoSistema).not.toHaveBeenCalledWith('PAYMENT_PROOF_CANONICAL_INGEST_ENABLED')
    expect(mocks.obterConfiguracaoSistema).not.toHaveBeenCalledWith('WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED')
  })

  it('makes no media request when compatibility is closed and follows the exact legacy path', async () => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client)
    mocks.gates.whatsappIngest.effective = false
    mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ enabled: false })
    const response = await POST(request()); expect(response.status).toBe(200); expect((await response.json()).message).toBe('Sofia globalmente desativada para WhatsApp')
    expect(mocks.downloadEvolutionPdf).not.toHaveBeenCalled(); expect(mocks.processCanonicalPaymentProof).not.toHaveBeenCalled(); expect(client.from).toHaveBeenCalledWith('mensagens')
  })

  it('never writes an Evolution payment document to the legacy proof table when canonical compatibility is closed', async () => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client)
    mocks.gates.whatsappIngest.effective = false
    mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ enabled: true })
    mocks.verificarHorarioAtendimento.mockResolvedValue({ dentro: true })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(client.from).not.toHaveBeenCalledWith('comprovantes')
  })

  it('does not treat non-PDF documents as canonical', async () => {
    const { client } = adminClient(); mocks.createAdminClient.mockReturnValue(client); mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ enabled: false })
    await POST(request(undefined, 'image/png')); expect(mocks.downloadEvolutionPdf).not.toHaveBeenCalled()
  })
})
