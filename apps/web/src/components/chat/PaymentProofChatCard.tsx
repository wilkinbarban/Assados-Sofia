'use client'
import { useState } from 'react'
export function paymentProofPreview(input:{proofId:string;status:string;hasPreview:boolean}){
 return input.status==='admitted'&&input.hasPreview?`/api/payment-proofs/${input.proofId}/preview`:null
}
export function PaymentProofChatCard({proofId}:{proofId:string}){
 const [open,setOpen]=useState(false),src=`/api/payment-proofs/${proofId}/preview`
 return <div className="mt-2">
  <button type="button" onClick={()=>setOpen(true)} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
   Vista Previa
  </button>
  {open&&<div role="dialog" aria-modal="true" aria-label="Comprovante PIX ampliado" className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}>
   <div className="max-h-[92vh] max-w-4xl rounded-2xl bg-white p-3"><button type="button" onClick={()=>setOpen(false)} aria-label="Fechar prévia" className="float-right text-zinc-900">×</button><img src={src} alt="Comprovante PIX ampliado" className="max-h-[85vh] max-w-full object-contain"/></div>
  </div>}
 </div>
}
