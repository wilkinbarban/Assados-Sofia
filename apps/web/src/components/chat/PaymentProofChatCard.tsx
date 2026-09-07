'use client'
import { useState } from 'react'
import { Eye, X, FileText } from 'lucide-react'

export function paymentProofPreview(input:{proofId:string;status:string;hasPreview:boolean}){
 return input.status==='admitted'&&input.hasPreview?`/api/payment-proofs/${input.proofId}/preview`:null
}

export function PaymentProofChatCard({
  proofId,
  onOpenPreview,
}: {
  proofId: string
  onOpenPreview?: () => void
}) {
  const [open, setOpen] = useState(false)
  const src = `/api/payment-proofs/${proofId}/preview`

  const handleOpen = () => {
    if (onOpenPreview) {
      onOpenPreview()
    } else {
      setOpen(true)
    }
  }

  return (
    <div className="mt-2.5 rounded-2xl border border-amber-500/30 bg-zinc-950/70 p-3 shadow-inner">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-100">Comprovante PIX</p>
            <p className="text-[10px] text-zinc-500 font-mono">ID …{proofId.slice(-8)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition-all hover:bg-amber-400/20 hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer active:scale-95 shadow-sm"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Vista Previa</span>
        </button>
      </div>

   {open && (
    <div
     role="dialog"
     aria-modal="true"
     aria-label="Comprovante PIX ampliado"
     className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in"
     onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}
    >
     <div className="relative w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/90 space-y-4 text-zinc-100 flex flex-col max-h-[90vh]">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
       <div className="flex items-center gap-2 text-amber-400">
        <Eye className="h-4 w-4" />
        <h3 className="text-sm font-bold text-zinc-100">Comprovante PIX</h3>
       </div>
       <button
        type="button"
        onClick={()=>setOpen(false)}
        aria-label="Fechar prévia"
        className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
       >
        <X className="h-4 w-4" />
       </button>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-2 rounded-2xl bg-zinc-950 border border-zinc-800">
       {/* eslint-disable-next-line @next/next/no-img-element -- Authenticated payment-proof preview is served by a private API route. */}
       <img
        src={src}
        alt="Comprovante PIX ampliado"
        className="max-h-[60vh] w-auto max-w-full object-contain rounded-xl shadow-md"
       />
      </div>

      <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-400">
       <span className="font-mono text-[11px]">ID …{proofId.slice(-8)}</span>
       <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
       >
        Fechar
       </button>
      </div>
     </div>
    </div>
   )}
  </div>
 )
}
