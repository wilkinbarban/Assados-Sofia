import { createHash } from 'node:crypto'
import { normalizePaymentProofDelivery, validatePaymentProofPdf, type PaymentProofChannel } from './intake'
import { paymentProofOperationalGates } from './operational-gates'

type IntakeInput = {
  channel: PaymentProofChannel
  deliveryId: string
  customerId?: string | null
  orderId?: string | null
  conversationId?: string | null
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
  if (!paymentProofOperationalGates.canonicalIngest.effective) return { status: 'disabled' as const }
  if (input.channel === 'whatsapp' && !paymentProofOperationalGates.whatsappIngest.effective) return { status: 'disabled' as const }

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
    p_conversation_id: input.conversationId ?? null,
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

export async function queueCanonicalPaymentProof(input: IntakeInput) {
  const intake = await ingestCanonicalPaymentProof(input)
  if (intake.status !== 'accepted') return intake
  return { status:'queued' as const,proofId:intake.proofId }
}

// Kept as the public compatibility entry point; durable workers own all processing after admission.
export async function processCanonicalPaymentProof(input: ProcessInput) {
  return ingestCanonicalPaymentProof(input)
}
