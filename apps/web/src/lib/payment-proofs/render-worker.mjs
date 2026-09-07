import { parentPort, workerData } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'

const MAX_PDF_BYTES = 5 * 1024 * 1024
const RENDER_WIDTH = 1200
const VERSION = 'pdf-parse-2.4.5/w1200'
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

function pngDimensions(png) {
  if (png.length < 24 || !PNG_SIGNATURE.every((byte, index) => png[index] === byte) ||
    png[12] !== 73 || png[13] !== 72 || png[14] !== 68 || png[15] !== 82) throw new Error()
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width === 0 || height === 0 || width > RENDER_WIDTH || height > RENDER_WIDTH * 4) throw new Error()
  return { width, height }
}

function installCanvasDomGlobals() {
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D })
}

async function run() {
  parentPort.postMessage({ diagnostic:'worker_boot' })
  const bytes = new Uint8Array(workerData.bytes)
  if (bytes.length < 5 || bytes.length > MAX_PDF_BYTES) throw Object.assign(new Error(), { diagnostic:'pdf_open' })
  installCanvasDomGlobals()
  let PDFParse
  try { ({ PDFParse } = await import('pdf-parse')) }
  catch { throw Object.assign(new Error(), { diagnostic:'dependency_load' }) }
  parentPort.postMessage({ diagnostic:'dependency_load' })
  let parser
  try { parser = new PDFParse({ data: bytes.slice(), isEvalSupported:false, useWorkerFetch:false, useSystemFonts:false, stopAtErrors:true, verbosity: 0 }) }
  catch { throw Object.assign(new Error(), { diagnostic:'pdf_open' }) }
  parentPort.postMessage({ diagnostic:'pdf_open' })
  try {
    const screenshot = await parser.getScreenshot({ partial:[1], desiredWidth:RENDER_WIDTH, imageBuffer:true, imageDataUrl:false })
    parentPort.postMessage({ diagnostic:'page_render' })
    const page = screenshot.pages[0]
    if (!page?.data?.length) throw new Error()
    const png = new Uint8Array(page.data)
    const { width, height } = pngDimensions(png)
    parentPort.postMessage({ diagnostic:'message_transfer' })
    parentPort.postMessage({ ok:true, result:{ png, width, height, sha256:createHash('sha256').update(png).digest('hex'), version:VERSION } }, [png.buffer])
  } catch { throw Object.assign(new Error(), { diagnostic:'page_render' }) }
  finally { await parser.destroy().catch(() => undefined) }
}

run().catch((error) => parentPort.postMessage({ ok:false, diagnostic:error?.diagnostic ?? 'worker_boot' }))
