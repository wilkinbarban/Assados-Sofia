import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { renderPaymentProofPageOne } from '@/lib/payment-proofs/render-png'

function pdf(rotation = 0) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Rotate ${rotation} /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    '<< /Length 38 >>\nstream\nBT /F1 18 Tf 20 50 Td (PIX 42.00) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offset = [0]
  objects.forEach((object, index) => { offset[index + 1] = Buffer.byteLength(body); body += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 6\n0000000000 65535 f \n${offset.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Uint8Array(Buffer.from(body))
}

describe('deterministic payment proof PNG', () => {
  it('declares the native canvas renderer as a direct production dependency', async () => {
    const webPackage = JSON.parse(await import('node:fs/promises').then((fs) =>
      fs.readFile('apps/web/package.json', 'utf8'),
    ))

    expect(webPackage.dependencies['@napi-rs/canvas']).toBe('0.1.80')
  })

  it('includes the native canvas package in the Next standalone trace', async () => {
    const config = await import('node:fs/promises').then((fs) =>
      fs.readFile('apps/web/next.config.ts', 'utf8'),
    )

    expect(config).toContain('"../../node_modules/@napi-rs/canvas/**/*"')
    expect(config).toContain('"../../node_modules/@napi-rs/canvas-linux-*-musl/**/*"')
    expect(config).toContain('"src/lib/payment-proofs/render-worker.mjs"')
  })

  it('faithfully renders page one with a stable bounded hash and white background', async () => {
    const first = await renderPaymentProofPageOne(pdf())
    const second = await renderPaymentProofPageOne(pdf())
    expect(first).toEqual(expect.objectContaining({ width: 1200, height: 600, version: 'pdf-parse-2.4.5/w1200' }))
    expect(first.sha256).toBe(createHash('sha256').update(first.png).digest('hex'))
    expect(second.sha256).toBe(first.sha256)
    expect(first.png.subarray(0, 8)).toEqual(Uint8Array.from([137,80,78,71,13,10,26,10]))
  })

  it('preserves page rotation and aspect ratio', async () => {
    const result = await renderPaymentProofPageOne(pdf(90))
    expect(result).toEqual(expect.objectContaining({ width: 1200, height: 2400 }))
  })

  it.each([
    [new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj << /Encrypt true >>')), 'PAYMENT_PROOF_RENDER_FAILED'],
    [new Uint8Array(5_242_881), 'PAYMENT_PROOF_RENDER_SIZE_INVALID'],
  ])('fails closed without synthesizing a receipt', async (bytes, error) => {
    await expect(renderPaymentProofPageOne(bytes)).rejects.toThrow(error)
  })
})
