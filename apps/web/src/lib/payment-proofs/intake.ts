export type PaymentProofChannel = 'web' | 'telegram' | 'whatsapp'
type DeliveryInput = { channel: PaymentProofChannel; deliveryId: string; customerId?: string | null; sender?: string | null }
const MAX_PDF_BYTES = 5 * 1024 * 1024

export function normalizePaymentProofDelivery(input: DeliveryInput) {
  const deliveryKey = input.deliveryId.trim()
  if (!deliveryKey) throw new Error('PAYMENT_PROOF_DELIVERY_ID_REQUIRED')
  const senderReference = input.sender?.replace(/\D/g, '') || null
  return { channel: input.channel, deliveryKey, customerId: input.customerId?.trim() || null, senderReference }
}

export function validatePaymentProofPdf(bytes: Uint8Array, mimeType: string) {
  if (mimeType.toLowerCase().split(';',1)[0].trim() !== 'application/pdf') return { ok:false as const,error:'PDF_MIME_INVALID' as const }
  if (bytes.length < 5 || bytes.length > MAX_PDF_BYTES) return { ok:false as const,error:'PDF_SIZE_INVALID' as const }
  if (bytes[0]!==0x25 || bytes[1]!==0x50 || bytes[2]!==0x44 || bytes[3]!==0x46 || bytes[4]!==0x2d) return { ok:false as const,error:'PDF_SIGNATURE_INVALID' as const }
  return { ok:true as const,sizeBytes:bytes.length }
}
