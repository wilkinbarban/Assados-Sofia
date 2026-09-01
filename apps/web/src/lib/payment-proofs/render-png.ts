import { createHash } from 'node:crypto'

const MAX_PDF_BYTES = 5 * 1024 * 1024
const RENDER_WIDTH = 1200
export const PAYMENT_PROOF_RENDER_VERSION = 'pdf-parse-2.4.5/w1200'

export type PaymentProofRender = {
  png: Uint8Array
  sha256: string
  width: number
  height: number
  version: string
}

function ensureNodeGlobalPolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    ;(globalThis as any).DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      m11 = 1; m12 = 0; m13 = 0; m14 = 0
      m21 = 0; m22 = 1; m23 = 0; m24 = 0
      m31 = 0; m32 = 0; m33 = 1; m34 = 0
      m41 = 0; m42 = 0; m43 = 0; m44 = 1
      is2D = true; isIdentity = true
      constructor(init?: number[] | string) {
        if (Array.isArray(init)) {
          this.a = init[0] ?? 1; this.b = init[1] ?? 0
          this.c = init[2] ?? 0; this.d = init[3] ?? 1
          this.e = init[4] ?? 0; this.f = init[5] ?? 0
        }
      }
      multiply() { return this }
      translate() { return this }
      scale() { return this }
      rotate() { return this }
      inverse() { return this }
      transformPoint(point: any) { return point }
      toFloat32Array() { return new Float32Array([this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1]) }
      toFloat64Array() { return new Float64Array([this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1]) }
    }
  }

  if (typeof globalThis.Path2D === 'undefined') {
    ;(globalThis as any).Path2D = class Path2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    }
  }

  if (typeof globalThis.ImageData === 'undefined') {
    ;(globalThis as any).ImageData = class ImageData {
      width: number
      height: number
      data: Uint8ClampedArray
      colorSpace = 'srgb'
      constructor(wOrData: any, hOrW?: any, h?: any) {
        if (typeof wOrData === 'number') {
          this.width = wOrData
          this.height = hOrW
          this.data = new Uint8ClampedArray(this.width * this.height * 4)
        } else {
          this.data = wOrData
          this.width = hOrW
          this.height = h ?? Math.floor(wOrData.length / 4 / hOrW)
        }
      }
    }
  }
}

export async function renderPaymentProofPageOne(bytes: Uint8Array): Promise<PaymentProofRender> {
  if (bytes.length < 5 || bytes.length > MAX_PDF_BYTES) {
    throw new Error('PAYMENT_PROOF_RENDER_SIZE_INVALID')
  }

  ensureNodeGlobalPolyfills()

  const { PDFParse } = await import('pdf-parse')

  const parser = new PDFParse({
    data: bytes.slice(),
    isEvalSupported: false,
    useWorkerFetch: false,
    useSystemFonts: false,
    stopAtErrors: true,
  })

  try {
    const screenshot = await parser.getScreenshot({
      partial: [1],
      desiredWidth: RENDER_WIDTH,
      imageBuffer: true,
      imageDataUrl: false,
    })
    const page = screenshot.pages[0]
    if (!page?.data?.length || page.width > RENDER_WIDTH || page.height > RENDER_WIDTH * 4) {
      throw new Error('PAYMENT_PROOF_RENDER_BOUNDS_INVALID')
    }
    const png = new Uint8Array(page.data)
    return {
      png,
      width: page.width,
      height: page.height,
      sha256: createHash('sha256').update(png).digest('hex'),
      version: PAYMENT_PROOF_RENDER_VERSION,
    }
  } catch {
    throw new Error('PAYMENT_PROOF_RENDER_FAILED')
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}
