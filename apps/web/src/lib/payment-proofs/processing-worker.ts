import { Worker } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { classifyPaymentProof } from './advisory-extraction'
import { renderPaymentProofPageOne, type PaymentProofRender } from './render-png'

const RENDER_TIMEOUT_MS = 20_000
const DEFAULT_RENDER_WORKER_URL = pathToFileURL('/app/payment-proof-render-worker.mjs')
const RENDER_DIAGNOSTICS = new Set([
  'worker_start', 'worker_boot', 'dependency_load', 'pdf_open', 'page_render',
  'message_transfer', 'exit', 'timeout',
])

type WorkerLike = Pick<Worker, 'once'|'terminate'|'removeAllListeners'> & Partial<Pick<Worker, 'on'>>
type RenderDiagnostic = (stage: string) => void
type Render = (bytes: Uint8Array) => Promise<PaymentProofRender>
type Classify = typeof classifyPaymentProof

export function renderPaymentProofWithWorker(bytes: Uint8Array, timeoutMs = RENDER_TIMEOUT_MS, createWorker?: () => WorkerLike, diagnostic?: RenderDiagnostic) {
  diagnostic?.('worker_start')
  const spawnWorker = createWorker ?? (() => new Worker(DEFAULT_RENDER_WORKER_URL, {
    execArgv: [],
    workerData: { bytes: bytes.slice().buffer },
  }))
  return new Promise<PaymentProofRender>((resolve, reject) => {
    const worker = spawnWorker()
    let settled = false
    const finish = (error?: Error, result?: PaymentProofRender) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.removeAllListeners()
      void worker.terminate().catch(() => undefined)
      if (error) reject(error)
      else resolve(result!)
    }
    const listenForMessages = worker.on?.bind(worker) ?? worker.once.bind(worker)
    listenForMessages('message', (message: any) => {
      if (RENDER_DIAGNOSTICS.has(message?.diagnostic)) diagnostic?.(message.diagnostic)
      if (message?.ok) finish(undefined, { ...message.result, png: new Uint8Array(message.result.png) })
      else if (message?.ok === false) finish(new Error('PAYMENT_PROOF_RENDER_FAILED'))
    })
    worker.once('error', () => finish(new Error('PAYMENT_PROOF_RENDER_FAILED')))
    worker.once('messageerror', () => { diagnostic?.('message_transfer'); finish(new Error('PAYMENT_PROOF_RENDER_FAILED')) })
    worker.once('exit', (code) => { if (code !== 0) { diagnostic?.('exit'); finish(new Error('PAYMENT_PROOF_RENDER_FAILED')) } })
    const timer = setTimeout(() => { diagnostic?.('timeout'); finish(new Error('PAYMENT_PROOF_RENDER_TIMEOUT')) }, timeoutMs)
  })
}

async function extractPdfText(bytes: Uint8Array) {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false,stopAtErrors:true })
  try { return String((await parser.getText({partial:[1]})).text || '').slice(0,20_000) }
  finally { await parser.destroy().catch(()=>undefined) }
}

export async function processPaymentProofJob(input:{proofId:string;db:any;apiKey?:string|null;model?:string|null;render?:Render;classify?:Classify}) {
  let bucket:any
  let proof:any
  let bytes:Uint8Array
  try {
    bucket=input.db.storage.from('payment-proofs')
    const loaded=await input.db.from('payment_proofs').select('id,status,channel,original_storage_key,preview_storage_key,sha256').eq('id',input.proofId).maybeSingle()
    proof=loaded.data
    if(loaded.error||!proof?.original_storage_key||!proof.sha256)return {ok:false as const,stage:'load' as const}
    const {data:blob,error:downloadError}=await bucket.download(proof.original_storage_key)
    if(downloadError||!blob)return {ok:false as const,stage:'load' as const}
    bytes=new Uint8Array(await blob.arrayBuffer())
  } catch { return {ok:false as const,stage:'load' as const} }
  if(!proof.preview_storage_key){
    let rendered:PaymentProofRender
    try { rendered=await (input.render??renderPaymentProofWithWorker)(bytes) } catch { return {ok:false as const,stage:'render' as const} }
    try {
      const previewKey=`proofs/private/${createHash('sha256').update(`${proof.channel}:${input.proofId}`).digest('hex')}.png`
      if((await bucket.upload(previewKey,rendered.png,{contentType:'image/png',upsert:true})).error)return {ok:false as const,stage:'preview' as const}
      const recorded=await input.db.rpc('record_payment_proof_render',{p_proof_id:input.proofId,p_render_key:'page-1',p_storage_key:previewKey,p_sha256:rendered.sha256,p_width:rendered.width,p_height:rendered.height,p_version:rendered.version})
      if(recorded.error)return {ok:false as const,stage:'preview' as const}
    } catch { return {ok:false as const,stage:'preview' as const} }
  }
  let existing:any
  try {
    existing=await input.db.from('payment_proof_advisory_attempts').select('proof_id').eq('proof_id',input.proofId).limit(1).maybeSingle()
  } catch { return {ok:false as const,stage:'classifier' as const} }
  if(existing.error)return {ok:false as const,stage:'classifier' as const}
  if(!existing.data){
    let text='';try{text=await extractPdfText(bytes)}catch{}
    try {
      const classify=input.classify??classifyPaymentProof
      await classify({proofId:input.proofId,extractedText:text,apiKey:input.apiKey?.trim()||'',model:input.model?.trim()||'google/gemini-2.5-flash',maxAttempts:input.apiKey?2:1,persist:async(result)=>{const saved=await input.db.rpc('record_payment_proof_advisory',{p_proof_id:input.proofId,p_attempt_key:`initial:${proof.sha256}`,p_disposition:result.disposition,p_likely:result.likelyPaymentProof,p_confidence:result.confidence,p_suggested_cents:result.suggestedAmountCents,p_reason_code:result.reasonCode,p_model:result.model});if(saved.error)throw new Error('persist')}})
    } catch { return {ok:false as const,stage:'classifier' as const} }
  }
  return {ok:true as const}
}

// Keeps the direct render import traced for standalone builds and injectable tests.
export const inProcessPaymentProofRenderer = renderPaymentProofPageOne
