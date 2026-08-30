import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('local PDF.js assets', () => {
  it('ships matching API and worker versions without a CDN dependency', () => {
    const api = readFileSync(resolve('apps/web/public/pdfjs/pdf.min.js'), 'utf8')
    const worker = readFileSync(resolve('apps/web/public/pdfjs/pdf.worker.min.js'), 'utf8')
    expect(api).toContain('3.11.174')
    expect(worker).toContain('3.11.174')
  })
})
