import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePaymentProofDelivery, validatePaymentProofPdf } from '@/lib/payment-proofs/intake'

const expensive = vi.hoisted(() => ({
  render: vi.fn(async () => ({ png: new Uint8Array([1]), sha256: 'render-sha', width: 1, height: 1, version: 'test' })),
  extract: vi.fn(() => ({ getText: vi.fn(async () => ({ text: '' })), destroy: vi.fn(async () => undefined) })),
  classify: vi.fn(async () => ({ reasonCode: 'low_signal' })),
}))
vi.mock('@/lib/payment-proofs/render-png', () => ({ renderPaymentProofPageOne: expensive.render }))
vi.mock('pdf-parse', () => ({ PDFParse: expensive.extract }))
vi.mock('@/lib/payment-proofs/advisory-extraction', () => ({ classifyPaymentProof: expensive.classify }))
const gates = vi.hoisted(() => ({ canonicalIngest: { effective: true }, whatsappIngest: { effective: true } }))
vi.mock('@/lib/payment-proofs/operational-gates', () => ({ paymentProofOperationalGates: gates }))

import { ingestCanonicalPaymentProof, ingestEvolutionCanonicalPaymentProof, processCanonicalPaymentProof } from '@/lib/payment-proofs/canonical-intake'

const pdf = new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31])

function boundary(result: { data?: unknown; error?: unknown } = {}) {
  const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: result.data ?? null, error: result.error ?? null }))
  const upload = vi.fn<(path: string, bytes: Uint8Array, options?: Record<string, unknown>) => Promise<{ error: null }>>(async () => ({ error: null }))
  const remove = vi.fn<(paths: string[]) => Promise<{ error: null }>>(async () => ({ error: null }))
  return { db: { rpc }, storage: { upload, remove }, rpc, upload, remove }
}

function input(channel: 'web'|'telegram'|'whatsapp', deliveryId: string, edge = boundary()) {
  return { channel, deliveryId, customerId: 'customer-1', bytes: pdf, mimeType: 'application/pdf', db: edge.db, storage: edge.storage }
}

describe('payment proof intake adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gates.canonicalIngest.effective = true
    gates.whatsappIngest.effective = true
  })

  it('normalizes Web, Telegram and WhatsApp into stable delivery identities', () => {
    expect(normalizePaymentProofDelivery({channel:'web',deliveryId:' msg-1 ',customerId:'customer-1'})).toEqual({channel:'web',deliveryKey:'msg-1',customerId:'customer-1',senderReference:null})
    expect(normalizePaymentProofDelivery({channel:'telegram',deliveryId:'tg-1',sender:' 5541999999999 '})).toEqual({channel:'telegram',deliveryKey:'tg-1',customerId:null,senderReference:'5541999999999'})
    expect(normalizePaymentProofDelivery({channel:'whatsapp',deliveryId:'wa-1',sender:'+55 (41) 99999-9999'}).senderReference).toBe('5541999999999')
  })

  it('returns disabled before storage or database effects when canonical intake is closed', async () => {
    gates.canonicalIngest.effective = false
    const edge = boundary()
    await expect(ingestCanonicalPaymentProof(input('web', 'closed', edge))).resolves.toEqual({ status: 'disabled' })
    expect(edge.upload).not.toHaveBeenCalled()
    expect(edge.rpc).not.toHaveBeenCalled()
  })

  it('returns disabled before storage or database effects when WhatsApp intake is closed', async () => {
    gates.whatsappIngest.effective = false
    const edge = boundary()
    await expect(ingestCanonicalPaymentProof(input('whatsapp', 'closed', edge))).resolves.toEqual({ status: 'disabled' })
    expect(edge.upload).not.toHaveBeenCalled()
    expect(edge.rpc).not.toHaveBeenCalled()
  })

  it('rejects spoofed MIME, bad magic and oversized bytes', () => {
    expect(validatePaymentProofPdf(pdf,'application/pdf')).toEqual({ok:true,sizeBytes:6})
    expect(validatePaymentProofPdf(pdf,'image/png')).toEqual({ok:false,error:'PDF_MIME_INVALID'})
    expect(validatePaymentProofPdf(new Uint8Array([1,2,3,4,5]),'application/pdf')).toEqual({ok:false,error:'PDF_SIGNATURE_INVALID'})
    expect(validatePaymentProofPdf(new Uint8Array(5*1024*1024+1),'application/pdf')).toEqual({ok:false,error:'PDF_SIZE_INVALID'})
  })

  it('binds storage keys to both delivery identity and exact content bytes', async () => {
    const first = boundary({ data: { proof_id: 'proof-1', duplicate: false } })
    const same = boundary({ data: { proof_id: 'proof-1', duplicate: false } })
    const changed = boundary({ data: { proof_id: 'proof-2', duplicate: false } })
    const sameLengthPdf = new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x32])

    await ingestCanonicalPaymentProof(input('web', 'delivery-1', first))
    await ingestCanonicalPaymentProof(input('web', 'delivery-1', same))
    await ingestCanonicalPaymentProof({ ...input('web', 'delivery-1', changed), bytes: sameLengthPdf })

    const firstUploadKey = first.upload.mock.calls[0]?.[0]
    const sameUploadKey = same.upload.mock.calls[0]?.[0]
    const changedUploadKey = changed.upload.mock.calls[0]?.[0]
    const firstRpcArgs = first.rpc.mock.calls[0]?.[1]
    const sameRpcArgs = same.rpc.mock.calls[0]?.[1]
    const changedRpcArgs = changed.rpc.mock.calls[0]?.[1]

    expect(firstUploadKey).toBe(sameUploadKey)
    expect(firstUploadKey).not.toBe(changedUploadKey)
    expect(firstRpcArgs?.p_sha256).toBe(sameRpcArgs?.p_sha256)
    expect(firstRpcArgs?.p_sha256).not.toBe(changedRpcArgs?.p_sha256)
  })

  it('returns the supported accepted result after atomic admission and queueing', async () => {
    const edge = boundary({ data: { proof_id: 'proof-1', duplicate: false } })

    await expect(ingestCanonicalPaymentProof(input('web', 'delivery-1', edge)))
      .resolves.toEqual({ status: 'accepted', proofId: 'proof-1', storageKey: expect.any(String) })
    expect(edge.rpc).toHaveBeenCalledOnce()
  })

  it('returns the supported retryable result and cleans up the object when atomic admission fails', async () => {
    const edge = boundary({ error: { message: 'PAYMENT_PROOF_ENQUEUE_UNAVAILABLE' } })

    const result = await ingestCanonicalPaymentProof(input('telegram', 'delivery-2', edge))

    expect(result).toEqual({ status: 'retryable', error: 'PAYMENT_PROOF_INTAKE_FAILED' })
    expect(result.status).not.toBe('accepted')
    expect(edge.remove).toHaveBeenCalledOnce()
  })

  it('namespaces equal delivery identities by channel while globally deduplicating equal bytes', async () => {
    const web = boundary({ data: { proof_id: 'proof-1', queue_id: 'queue-1', duplicate: false } })
    const telegram = boundary({ data: { proof_id: 'delivery-2', canonical_proof_id: 'proof-1', duplicate: true } })

    await ingestCanonicalPaymentProof(input('web', 'same-delivery', web))
    await expect(ingestCanonicalPaymentProof(input('telegram', 'same-delivery', telegram)))
      .resolves.toEqual({ status: 'duplicate', proofId: 'delivery-2', canonicalProofId: 'proof-1' })
    expect(web.rpc.mock.calls[0][1]).toMatchObject({ p_channel: 'web', p_delivery_key: 'same-delivery' })
    expect(telegram.rpc.mock.calls[0][1]).toMatchObject({ p_channel: 'telegram', p_delivery_key: 'same-delivery' })
    expect(web.rpc.mock.calls[0][1].p_sha256).toBe(telegram.rpc.mock.calls[0][1].p_sha256)
  })

  it('rejects invalid input without creating storage or queued work', async () => {
    const edge = boundary()

    await expect(ingestCanonicalPaymentProof({ ...input('web', 'invalid', edge), bytes: new Uint8Array([1,2,3,4,5]) }))
      .resolves.toEqual({ status: 'rejected', error: 'PAYMENT_PROOF_SIGNATURE_INVALID' })
    expect(edge.upload).not.toHaveBeenCalled()
    expect(edge.rpc).not.toHaveBeenCalled()
  })

  it('admits PNG proofs through the same canonical queue with their normalized MIME type', async () => {
    const edge = boundary({ data: { proof_id: 'proof-image-1', duplicate: false } })
    const png = new Uint8Array(await sharp({ create: { width: 1, height: 1, channels: 4, background: 'red' } }).png().toBuffer())

    await expect(ingestCanonicalPaymentProof({ ...input('web', 'image-1', edge), bytes: png, mimeType: 'image/png' }))
      .resolves.toEqual({ status: 'accepted', proofId: 'proof-image-1', storageKey: expect.stringMatching(/\.png$/) })
    expect(edge.upload).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), expect.any(Uint8Array), expect.objectContaining({ contentType: 'image/png' }))
    expect(edge.rpc).toHaveBeenCalledWith('admit_and_enqueue_payment_proof', expect.objectContaining({ p_mime_type: 'image/png' }))
  })

  it('stops at accepted admission without doing worker-owned processing', async () => {
    const edge = boundary({ data: { proof_id: 'proof-1', duplicate: false } })

    await expect(processCanonicalPaymentProof(input('web', 'delivery-3', edge)))
      .resolves.toEqual({ status: 'accepted', proofId: 'proof-1', storageKey: expect.any(String) })
    expect(expensive.render).not.toHaveBeenCalled()
    expect(expensive.extract).not.toHaveBeenCalled()
    expect(expensive.classify).not.toHaveBeenCalled()
    expect(edge.upload).toHaveBeenCalledOnce()
    expect(edge.rpc).toHaveBeenCalledOnce()
    expect(edge.rpc).toHaveBeenCalledWith('admit_and_enqueue_payment_proof', expect.any(Object))
  })

  it('uses the atomic Evolution RPC and removes a newly-uploaded object for a malformed RPC response', async () => {
    const edge = boundary({ data: { proof_id: 'proof-1', customer_id: 'not-a-uuid', conversation_id: 'also-not-a-uuid', duplicate: false } })

    await expect(ingestEvolutionCanonicalPaymentProof({
      channel: 'whatsapp', deliveryId: 'evolution:main:message-77', sender: '5541999990003', displayName: ' Ana ',
      bytes: pdf, mimeType: 'application/pdf', db: edge.db, storage: edge.storage,
    })).resolves.toEqual({ status: 'retryable', error: 'PAYMENT_PROOF_INTAKE_FAILED' })

    expect(edge.rpc).toHaveBeenCalledWith('admit_and_enqueue_evolution_payment_proof', expect.objectContaining({
      p_phone: '5541999990003', p_display_name: ' Ana ', p_delivery_key: 'evolution:main:message-77',
      p_order_id: null, p_mime_type: 'application/pdf', p_size_bytes: pdf.length,
    }))
    expect(edge.remove).toHaveBeenCalledOnce()
  })
})
