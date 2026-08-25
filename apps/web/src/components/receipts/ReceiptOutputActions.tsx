'use client'

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Download, Loader2, Printer, ReceiptText, X } from 'lucide-react'
import { actionEmitirComprovanteVenda } from '@/app/actions/pedidos'
import {
  buildReceiptPdf,
  buildReceiptPrintDocument,
  toReceiptCopies,
  type ReceiptSnapshot,
} from '@/lib/receipts/salesReceipt'

type ReceiptOutputActionsProps = { pedidoId: string; disabled?: boolean }
type IssuedReceipt = { id: string; snapshot: ReceiptSnapshot }

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export function ReceiptOutputActions({ pedidoId, disabled = false }: ReceiptOutputActionsProps) {
  const titleId = useId()
  const openerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const printFrameRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<IssuedReceipt | null>(null)
  const [width, setWidth] = useState<58 | 80>(58)

  useLayoutEffect(() => {
    if (receipt) dialogRef.current?.focus()
  }, [receipt])

  function closePreview() {
    openerRef.current?.focus()
    setReceipt(null)
  }

  async function openPreview() {
    if (receipt) return
    setLoading(true)
    setMessage(null)
    const result = await actionEmitirComprovanteVenda({ pedidoId, idempotencyKey: createIdempotencyKey() }) as { success: boolean; error?: string; receipt_id?: string; snapshot?: ReceiptSnapshot }
    setLoading(false)
    if (!result.success || !result.snapshot || !result.receipt_id) {
      setMessage(result.success ? 'Não foi possível obter o comprovante.' : result.error || 'Não foi possível obter o comprovante.')
      return
    }
    setReceipt({ id: result.receipt_id, snapshot: result.snapshot })
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePreview()
      return
    }
    if (event.key !== 'Tab') return
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
    if (!controls?.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function printReceipt() {
    const printableWindow = printFrameRef.current?.contentWindow
    if (!printableWindow) {
      setMessage('Não foi possível preparar a impressão.')
      return
    }
    printableWindow.focus()
    printableWindow.print()
  }

  function downloadPdf() {
    if (!receipt) return
    const pdfBytes = buildReceiptPdf(receipt.snapshot)
    const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = 'comprovante.pdf'
    document.body.appendChild(link)
    link.click()
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
      link.remove()
    }, 0)
  }

  function downloadPng() {
    if (!receipt) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const copies = toReceiptCopies(receipt.snapshot, { isSegundaVia: true })
    const lines = copies[0]?.commercialData.split('\n') || []

    const scale = 2
    const widthPx = 380 * scale
    const lineHeightPx = 20 * scale
    const heightPx = lines.length * lineHeightPx + 70 * scale

    canvas.width = widthPx
    canvas.height = heightPx

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, widthPx, heightPx)

    ctx.fillStyle = '#000000'
    ctx.font = `bold ${12 * scale}px "Courier New", monospace`
    ctx.textAlign = 'center'

    let y = 30 * scale
    lines.forEach((line, index) => {
      if (index === 0) {
        ctx.font = `900 ${15 * scale}px "Courier New", monospace`
        ctx.fillText(line, widthPx / 2, y)
        y += lineHeightPx * 1.2
      } else if (index === 1 || index === 2) {
        ctx.font = `bold ${12 * scale}px "Courier New", monospace`
        ctx.fillText(line, widthPx / 2, y)
        y += lineHeightPx
      } else if (['DADOS DO PEDIDO', 'CLIENTE', 'ITENS', 'PAGAMENTO'].includes(line)) {
        ctx.font = `bold ${12 * scale}px "Courier New", monospace`
        ctx.textAlign = 'left'
        ctx.fillText(`--- ${line} ---`, 20 * scale, y)
        y += lineHeightPx
      } else if (line.startsWith('TOTAL PAGO:')) {
        ctx.font = `900 ${14 * scale}px "Courier New", monospace`
        ctx.textAlign = 'center'
        ctx.fillText(line, widthPx / 2, y)
        y += lineHeightPx * 1.2
      } else {
        ctx.font = `normal ${11 * scale}px "Courier New", monospace`
        ctx.textAlign = 'left'
        ctx.fillText(line, 20 * scale, y)
        y += lineHeightPx
      }
    })

    const pngUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = pngUrl
    link.download = `comprovante-2via-${receipt.id.substring(0, 8)}.png`
    document.body.appendChild(link)
    link.click()
    setTimeout(() => link.remove(), 0)
  }

  const copies = receipt ? toReceiptCopies(receipt.snapshot) : []
  const printDocument = receipt ? buildReceiptPrintDocument(receipt.snapshot, width) : ''

  return <div className="mb-3" aria-label="Comprovante de venda">
    <button
      type="button"
      disabled={disabled || loading}
      aria-haspopup="dialog"
      onClick={openPreview}
      ref={openerRef}
      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 transition hover:border-amber-400 hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ReceiptText className="h-4 w-4" aria-hidden="true" />}
      <span>{loading ? 'Preparando...' : 'Comprovante'}</span>
    </button>

    {receipt && <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm"
      onKeyDown={handleDialogKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 p-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400">
              <ReceiptText className="h-5 w-5" aria-hidden="true" />
              <h2 className="text-base font-bold text-zinc-100" id={titleId}>Pré-visualizar comprovante</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-400">Confira as duas vias antes de imprimir ou baixar.</p>
          </div>
          <button ref={closeRef} type="button" onClick={closePreview} aria-label="Fechar pré-visualização" className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:border-amber-500 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-amber-400">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/60 p-4">
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Largura térmica</legend>
            {([58, 80] as const).map((option) => <label key={option} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold ${width === option ? 'border-amber-400 bg-amber-500/15 text-amber-300' : 'border-zinc-700 text-zinc-300'}`}>
              <input className="sr-only" type="radio" name={`${titleId}-width`} value={option} checked={width === option} onChange={() => setWidth(option)} />
              {option} mm
            </label>)}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={printReceipt} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">
              <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir comprovante
            </button>
            <button type="button" onClick={downloadPdf} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-100 hover:border-amber-500 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-amber-400">
              <Download className="h-4 w-4" aria-hidden="true" /> Baixar PDF
            </button>
            <button type="button" onClick={downloadPng} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 hover:border-amber-400 hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-amber-400">
              <Download className="h-4 w-4" aria-hidden="true" /> Baixar PNG (2ª Via)
            </button>
          </div>
        </div>

        <div className="overflow-auto bg-zinc-900 p-4">
          <div className="mx-auto flex w-fit flex-col gap-5">
            {copies.map((copy) => <article key={copy.label} style={{ width: `${width}mm` }} className="max-w-full overflow-hidden bg-white p-[3mm] font-mono text-[9px] leading-tight text-black shadow-xl">
              <div className="border-y border-black py-2 text-center">
                <strong className="block text-sm uppercase">{receipt.snapshot.establishment.name}</strong>
                <span className="block font-bold">COMPROVANTE DE VENDA</span>
                <strong className="mt-1 block border-t border-dashed border-black pt-1">{copy.label}</strong>
              </div>
              <div className="mt-2 max-w-full whitespace-pre-wrap break-all font-mono text-[9px] leading-tight">
                {copy.commercialData.split('\n').slice(2).map((line, index) => (
                  <span className="block" key={`${copy.label}-${index}`}>{line}</span>
                ))}
              </div>
            </article>)}
          </div>
        </div>
      </div>
      <iframe ref={printFrameRef} title="Área de impressão do comprovante" srcDoc={printDocument} className="fixed -left-[10000px] top-0 h-px w-px" aria-hidden="true" />
    </div>}
    {message && <p className="mt-2 text-xs text-amber-200" role="status">{message}</p>}
  </div>
}
