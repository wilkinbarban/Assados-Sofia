import { createHash } from 'node:crypto'
import { classifyPaymentProof } from './advisory-extraction'
import { normalizePaymentProofDelivery, validatePaymentProofPdf, type PaymentProofChannel } from './intake'
import { renderPaymentProofPageOne } from './render-png'

type IntakeInput = {
  channel: PaymentProofChannel
  deliveryId: string
  customerId?: string | null
  orderId?: string | null
  sender?: string | null
  bytes: Uint8Array
  mimeType: string
  db: any
  storage: any
}

type ProcessInput = IntakeInput & {
  apiKey?: string | null
  model?: string | null
}

function proofIdFrom(data: unknown): string | null {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return proofIdFrom(data[0])
  if (data && typeof data === 'object' && 'proof_id' in data) {
    const value = (data as { proof_id?: unknown }).proof_id
    return typeof value === 'string' ? value : null
  }
  return null
}

export async function ingestCanonicalPaymentProof(input: IntakeInput) {
  if (process.env.PAYMENT_PROOF_CANONICAL_INGEST_ENABLED !== 'true') {
    return { status: 'disabled' as const }
  }
  if (input.channel === 'whatsapp' && process.env.WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED !== 'true') {
    return { status: 'disabled' as const }
  }

  const valid = validatePaymentProofPdf(input.bytes, input.mimeType)
  if (!valid.ok) return { status: 'rejected' as const, error: valid.error }

  const delivery = normalizePaymentProofDelivery(input)
  const deliveryStorageId = createHash('sha256').update(delivery.deliveryKey).digest('hex')
  const storageKey = `proofs/private/${input.channel}/${deliveryStorageId}.pdf`
  const { error: uploadError } = await input.storage.upload(storageKey, input.bytes, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (uploadError && !String(uploadError.message).includes('already exists')) {
    return { status: 'retryable' as const, error: 'PAYMENT_PROOF_STORAGE_FAILED' }
  }

  const { data, error } = await input.db.rpc('admit_and_enqueue_payment_proof', {
    p_channel: delivery.channel,
    p_delivery_key: delivery.deliveryKey,
    p_customer_id: delivery.customerId,
    p_sender_reference: delivery.senderReference,
    p_storage_key: storageKey,
    p_size_bytes: valid.sizeBytes,
    p_mime_type: 'application/pdf',
    p_order_id: input.orderId ?? null,
    p_sha256: createHash('sha256').update(input.bytes).digest('hex'),
  })
  const proofId = proofIdFrom(data)
  if (error || !proofId) {
    if (!uploadError) {
      try { await input.storage.remove([storageKey]) } catch { /* best effort */ }
    }
    const message = String(error?.message || '')
    if (message.includes('ORDER_PAYMENT_PROOF_ALREADY_PENDING')) {
      return { status: 'rejected' as const, error: 'ORDER_PAYMENT_PROOF_ALREADY_PENDING' }
    }
    if (message.includes('PAYMENT_PROOF_ORDER_INELIGIBLE')) {
      return { status: 'rejected' as const, error: 'PAYMENT_PROOF_ORDER_INELIGIBLE' }
    }
    return { status: 'retryable' as const, error: 'PAYMENT_PROOF_INTAKE_FAILED' }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (row?.duplicate) return { status: 'duplicate' as const, proofId, canonicalProofId: row.canonical_proof_id }
  return { status: 'accepted' as const, proofId, storageKey }
}

async function extractPdfText(bytes: Uint8Array) {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({
    data: bytes.slice(),
    isEvalSupported: false,
    useWorkerFetch: false,
    useSystemFonts: false,
    stopAtErrors: true,
  })
  try {
    const result = await parser.getText({ partial: [1] })
    return String(result.text || '').slice(0, 20_000)
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}

export async function queueCanonicalPaymentProof(input: IntakeInput) {
  const intake = await ingestCanonicalPaymentProof(input)
  if (intake.status !== 'accepted') return intake
  return { status:'queued' as const,proofId:intake.proofId }
}

export async function processCanonicalPaymentProof(input: ProcessInput) {
  const intake = await ingestCanonicalPaymentProof(input)
  if (intake.status !== 'accepted') return intake
  const originalSha256 = createHash('sha256').update(input.bytes).digest('hex')

  let render
  try {
    render = await renderPaymentProofPageOne(input.bytes)
  } catch {
    await input.db.rpc('record_payment_proof_operational_failure', {
      p_proof_id: intake.proofId,
      p_stage: 'render',
    }).catch(() => undefined)
    return { status: 'retryable' as const, error: 'PAYMENT_PROOF_RENDER_FAILED' }
  }
  const previewStorageKey = `proofs/private/${input.channel}/${createHash('sha256').update(input.deliveryId).digest('hex')}.png`
  const { error: previewUploadError } = await input.storage.upload(previewStorageKey, render.png, {
    contentType: 'image/png',
    upsert: true,
  })
  if (previewUploadError) return { status: 'retryable' as const, error: 'PAYMENT_PROOF_PREVIEW_STORAGE_FAILED' }

  const { error: renderError } = await input.db.rpc('record_payment_proof_render', {
    p_proof_id: intake.proofId,
    p_render_key: 'page-1',
    p_storage_key: previewStorageKey,
    p_sha256: render.sha256,
    p_width: render.width,
    p_height: render.height,
    p_version: render.version,
  })
  if (renderError) return { status: 'retryable' as const, error: 'PAYMENT_PROOF_RENDER_RECORD_FAILED' }

  let extractedText = ''
  try {
    extractedText = await extractPdfText(input.bytes)
  } catch {
    // Unreadable and image-only PDFs deliberately fall back to manual review.
  }
  const model = input.model?.trim() || 'google/gemini-2.5-flash'
  const advisory = await classifyPaymentProof({
    proofId: intake.proofId,
    extractedText,
    apiKey: input.apiKey?.trim() || '',
    model,
    maxAttempts: input.apiKey ? 2 : 1,
    persist: async (result) => {
      const { error } = await input.db.rpc('record_payment_proof_advisory', {
        p_proof_id: intake.proofId,
        p_attempt_key: `initial:${originalSha256}`,
        p_disposition: result.disposition,
        p_likely: result.likelyPaymentProof,
        p_confidence: result.confidence,
        p_suggested_cents: result.suggestedAmountCents,
        p_reason_code: result.reasonCode,
        p_model: result.model,
      })
      if (error) throw error
    },
  })
  if (advisory.reasonCode === 'provider_unavailable' || advisory.reasonCode === 'invalid_provider_output') {
    await input.db.rpc('record_payment_proof_operational_failure', {
      p_proof_id: intake.proofId,
      p_stage: 'classifier',
    }).catch(() => undefined)
  }

  return {
    status: 'review' as const,
    proofId: intake.proofId,
    originalSha256,
    previewStorageKey,
  }
}
