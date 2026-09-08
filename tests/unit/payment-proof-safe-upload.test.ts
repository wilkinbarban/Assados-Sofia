import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { normalizePaymentProofUpload } from '@/lib/payment-proofs/safe-upload'

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set(pngSignature)
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

function jpegHeader(width: number, height: number) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 0xff, 0xd9])
}

describe('safe payment-proof upload normalization', () => {
  it('preserves valid PDF bytes through the existing PDF admission contract', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
    await expect(normalizePaymentProofUpload(pdf, 'application/pdf; charset=binary')).resolves.toEqual({ ok: true, bytes: pdf, mimeType: 'application/pdf', sizeBytes: 6 })
  })

  it('re-encodes JPEG and PNG fixtures without source metadata', async () => {
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'private' } } }).toBuffer()
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: 'red' } }).png().withMetadata({ exif: { IFD0: { Artist: 'private' } } }).toBuffer()

    const normalizedJpeg = await normalizePaymentProofUpload(jpeg, 'image/jpeg')
    const normalizedPng = await normalizePaymentProofUpload(png, 'image/png')

    expect(normalizedJpeg).toMatchObject({ ok: true, mimeType: 'image/jpeg' })
    expect(normalizedPng).toMatchObject({ ok: true, mimeType: 'image/png' })
    if (normalizedJpeg.ok) expect((await sharp(normalizedJpeg.bytes).metadata()).exif).toBeUndefined()
    if (normalizedPng.ok) expect((await sharp(normalizedPng.bytes).metadata()).exif).toBeUndefined()
  })

  it('rejects spoofed MIME, invalid magic, and an oversized payload', async () => {
    const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).jpeg().toBuffer()
    await expect(normalizePaymentProofUpload(jpeg, 'image/png')).resolves.toEqual({ ok: false, error: 'PAYMENT_PROOF_SIGNATURE_INVALID' })
    await expect(normalizePaymentProofUpload(new Uint8Array([1, 2, 3]), 'image/jpeg')).resolves.toEqual({ ok: false, error: 'PAYMENT_PROOF_SIGNATURE_INVALID' })
    await expect(normalizePaymentProofUpload(new Uint8Array(5 * 1024 * 1024 + 1), 'image/png')).resolves.toEqual({ ok: false, error: 'PAYMENT_PROOF_SIZE_INVALID' })
  })

  it('rejects malformed and decompression-bomb-sized image dimensions before decoding', async () => {
    await expect(normalizePaymentProofUpload(pngHeader(8_193, 1), 'image/png')).resolves.toEqual({ ok: false, error: 'PAYMENT_PROOF_DIMENSIONS_INVALID' })
    await expect(normalizePaymentProofUpload(pngHeader(8_000, 8_000), 'image/png')).resolves.toEqual({ ok: false, error: 'PAYMENT_PROOF_DIMENSIONS_INVALID' })
    await expect(normalizePaymentProofUpload(jpegHeader(9_000, 1), 'image/jpeg')).resolves.toEqual({ ok: false, error: 'PAYMENT_PROOF_DIMENSIONS_INVALID' })
  })
})
