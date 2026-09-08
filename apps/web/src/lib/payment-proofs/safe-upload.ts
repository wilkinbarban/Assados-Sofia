import sharp from 'sharp'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_DIMENSION = 8_192
const MAX_PIXELS = 20_000_000

type ProofMimeType = 'application/pdf' | 'image/jpeg' | 'image/png'
type ImageMimeType = Exclude<ProofMimeType, 'application/pdf'>

type UploadError =
  | 'PAYMENT_PROOF_MIME_INVALID'
  | 'PAYMENT_PROOF_SIZE_INVALID'
  | 'PAYMENT_PROOF_SIGNATURE_INVALID'
  | 'PAYMENT_PROOF_DIMENSIONS_INVALID'
  | 'PAYMENT_PROOF_IMAGE_INVALID'

export type SafePaymentProof = {
  ok: true
  bytes: Uint8Array
  mimeType: ProofMimeType
  sizeBytes: number
}

export type RejectedPaymentProof = { ok: false; error: UploadError }

function mime(value: string): string {
  return value.toLowerCase().split(';', 1)[0]?.trim() || ''
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  return { width: read32(bytes, 16), height: read32(bytes, 20) }
}

function read32(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 0x1000000 + bytes[offset + 1]! * 0x10000 + bytes[offset + 2]! * 0x100 + bytes[offset + 3]!
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]!
    if (marker === 0xd9 || marker === 0xda) return null
    if (marker >= 0xd0 && marker <= 0xd7) continue
    if (offset + 1 >= bytes.length) return null
    const length = bytes[offset]! * 0x100 + bytes[offset + 1]!
    if (length < 2 || offset + length > bytes.length) return null
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (length < 7) return null
      return { height: bytes[offset + 3]! * 0x100 + bytes[offset + 4]!, width: bytes[offset + 5]! * 0x100 + bytes[offset + 6]! }
    }
    offset += length
  }
  return null
}

function dimensionsAllowed(dimensions: { width: number; height: number } | null): boolean {
  return !!dimensions && dimensions.width > 0 && dimensions.height > 0 && dimensions.width <= MAX_DIMENSION && dimensions.height <= MAX_DIMENSION && dimensions.width * dimensions.height <= MAX_PIXELS
}

function imageType(bytes: Uint8Array): ImageMimeType | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return null
}

/** Admits only exact PDF/JPEG/PNG bytes and returns metadata-free canonical output. */
export async function normalizePaymentProofUpload(bytes: Uint8Array, mimeType: string): Promise<SafePaymentProof | RejectedPaymentProof> {
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return { ok: false, error: 'PAYMENT_PROOF_SIZE_INVALID' }
  const declared = mime(mimeType)
  if (declared !== 'application/pdf' && declared !== 'image/jpeg' && declared !== 'image/png') return { ok: false, error: 'PAYMENT_PROOF_MIME_INVALID' }

  const pdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
  if (declared === 'application/pdf') {
    return pdf ? { ok: true, bytes, mimeType: 'application/pdf', sizeBytes: bytes.length } : { ok: false, error: 'PAYMENT_PROOF_SIGNATURE_INVALID' }
  }
  if (pdf) return { ok: false, error: 'PAYMENT_PROOF_SIGNATURE_INVALID' }

  const detected = imageType(bytes)
  if (!detected || detected !== declared) return { ok: false, error: 'PAYMENT_PROOF_SIGNATURE_INVALID' }
  const dimensions = detected === 'image/png' ? pngDimensions(bytes) : jpegDimensions(bytes)
  if (!dimensionsAllowed(dimensions)) return { ok: false, error: 'PAYMENT_PROOF_DIMENSIONS_INVALID' }

  try {
    const source = sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate()
    const metadata = await source.metadata()
    if (!dimensionsAllowed({ width: metadata.width || 0, height: metadata.height || 0 })) return { ok: false, error: 'PAYMENT_PROOF_DIMENSIONS_INVALID' }
    const output = metadata.hasAlpha ? await source.png().toBuffer() : await source.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    if (output.length === 0 || output.length > MAX_BYTES) return { ok: false, error: 'PAYMENT_PROOF_SIZE_INVALID' }
    return { ok: true, bytes: new Uint8Array(output), mimeType: metadata.hasAlpha ? 'image/png' : 'image/jpeg', sizeBytes: output.length }
  } catch {
    return { ok: false, error: 'PAYMENT_PROOF_IMAGE_INVALID' }
  }
}
