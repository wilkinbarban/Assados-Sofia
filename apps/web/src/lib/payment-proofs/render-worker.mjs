import { parentPort, workerData } from 'node:worker_threads'
import { createHash } from 'node:crypto'

const MAX_PDF_BYTES = 5 * 1024 * 1024
const RENDER_WIDTH = 1200
const VERSION = 'pdf-parse-2.4.5/w1200'

function polyfillDom() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      a=1;b=0;c=0;d=1;e=0;f=0;m11=1;m12=0;m13=0;m14=0;m21=0;m22=1;m23=0;m24=0;m31=0;m32=0;m33=1;m34=0;m41=0;m42=0;m43=0;m44=1;is2D=true;isIdentity=true
      constructor(init) { if (Array.isArray(init)) { this.a=init[0]??1;this.b=init[1]??0;this.c=init[2]??0;this.d=init[3]??1;this.e=init[4]??0;this.f=init[5]??0 } }
      multiply(){return this} translate(){return this} scale(){return this} rotate(){return this} inverse(){return this} transformPoint(p){return p}
      toFloat32Array(){return new Float32Array([this.a,this.b,0,0,this.c,this.d,0,0,0,0,1,0,this.e,this.f,0,1])}
      toFloat64Array(){return new Float64Array([this.a,this.b,0,0,this.c,this.d,0,0,0,0,1,0,this.e,this.f,0,1])}
    }
  }
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D { addPath(){} closePath(){} moveTo(){} lineTo(){} bezierCurveTo(){} quadraticCurveTo(){} arc(){} arcTo(){} ellipse(){} rect(){} }
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData { colorSpace='srgb';constructor(d,w,h){if(typeof d==='number'){this.width=d;this.height=w;this.data=new Uint8ClampedArray(d*w*4)}else{this.data=d;this.width=w;this.height=h??Math.floor(d.length/4/w)}} }
}

async function run() {
  parentPort.postMessage({ diagnostic:'worker_boot' })
  const bytes = new Uint8Array(workerData.bytes)
  if (bytes.length < 5 || bytes.length > MAX_PDF_BYTES) throw Object.assign(new Error(), { diagnostic:'pdf_open' })
  let PDFParse
  try { ({ PDFParse } = await import('pdf-parse')) }
  catch { throw Object.assign(new Error(), { diagnostic:'dependency_load' }) }
  parentPort.postMessage({ diagnostic:'dependency_load' })
  polyfillDom()
  let parser
  try { parser = new PDFParse({ data: bytes.slice(), isEvalSupported:false, useWorkerFetch:false, useSystemFonts:false, stopAtErrors:true, verbosity: 0 }) }
  catch { throw Object.assign(new Error(), { diagnostic:'pdf_open' }) }
  parentPort.postMessage({ diagnostic:'pdf_open' })
  try {
    const screenshot = await parser.getScreenshot({ partial:[1], desiredWidth:RENDER_WIDTH, imageBuffer:true, imageDataUrl:false })
    parentPort.postMessage({ diagnostic:'page_render' })
    const page = screenshot.pages[0]
    if (!page?.data?.length || page.width > RENDER_WIDTH || page.height > RENDER_WIDTH * 4) throw new Error()
    const png = new Uint8Array(page.data)
    parentPort.postMessage({ diagnostic:'message_transfer' })
    parentPort.postMessage({ ok:true, result:{ png, width:page.width, height:page.height, sha256:createHash('sha256').update(png).digest('hex'), version:VERSION } }, [png.buffer])
  } catch { throw Object.assign(new Error(), { diagnostic:'page_render' }) }
  finally { await parser.destroy().catch(() => undefined) }
}

run().catch((error) => parentPort.postMessage({ ok:false, diagnostic:error?.diagnostic ?? 'worker_boot' }))
