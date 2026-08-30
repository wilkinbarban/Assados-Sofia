'use client'
import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, Eye, FileText, RotateCcw, ShieldX } from 'lucide-react'
import { ConfirmActionDialog } from './ui/ConfirmActionDialog'
import { listEligiblePaymentProofOrders,listPaymentProofsForAdmin,mutatePaymentProofAdmin } from '@/app/actions/payment-proof-admin'

type Proof = {
  id:string;customer_id:string|null;customer_name:string|null;channel:string;status:string
  preview_url:string|null;original_url:string;suggested_cents:number|null;confirmed_cents:number|null
  extraction_confidence:number|null;purge_after:string|null;created_at:string
}
type Order = {id:string;customer_id:string;total_pedido_centavos:number;status:string;status_pagamento:string}
type Mutation = { operation:'identify'|'confirm_amount'|'admit'|'reject'|'restore'|'purge'|'reconcile';proofId:string;value?:string|number;orderIds?:string[] }
const QUEUES=[['identity_pending','Identificação pendente'],['review','Revisão manual'],['received','Recebidos'],['admitted','Admitidos'],['quarantined','Quarentena']] as const

export function quarantineCountdown(deadline:string|null,now=new Date()){
  if(!deadline)return '—';const ms=Math.max(0,new Date(deadline).getTime()-now.getTime())
  return `${Math.floor(ms/86400000)}d ${Math.floor(ms%86400000/3600000)}h`
}

export default function PaymentProofAdminPanel({initialProofs,initialOrders,mutate=mutatePaymentProofAdmin,now}:{initialProofs?:Proof[];initialOrders?:Order[];mutate?:(m:Mutation)=>Promise<{success:boolean;error?:string;proof?:Pick<Proof,'status'|'purge_after'>}>;now?:string}){
 const [proofs,setProofs]=useState(initialProofs??[]),[queue,setQueue]=useState(initialProofs?.[0]?.status??'identity_pending'),[loading,setLoading]=useState(initialProofs===undefined)
 const [orders,setOrders]=useState(initialOrders??[]),[selected,setSelected]=useState<string[]>([])
 const [pending,setPending]=useState<Mutation|null>(null),[error,setError]=useState<string|null>(null)
 const [preview,setPreview]=useState<Proof|null>(null)
 const [busy,startTransition]=useTransition();const visible=proofs.filter(p=>p.status===queue)
 useEffect(()=>{if(initialProofs!==undefined)return;listPaymentProofsForAdmin().then(r=>{if(r.success)setProofs(r.data as Proof[]);else setError(r.error)}).finally(()=>setLoading(false))},[initialProofs])
 useEffect(()=>{const customer=proofs.find(p=>p.status==='admitted'&&p.customer_id)?.customer_id;if(initialOrders!==undefined||!customer)return;listEligiblePaymentProofOrders(customer).then(r=>{if(r.success)setOrders(r.data as Order[]);else setError(r.error)})},[initialOrders,proofs])
 const execute=()=>pending&&startTransition(async()=>{const result=await mutate(pending);if(!result.success)setError(result.error||'Falha ao atualizar comprovante')
  else {const nextStatus=result.proof?.status??(pending.operation==='restore'?'review':pending.operation==='reject'?'quarantined':pending.operation==='admit'?'admitted':null)
   setProofs(ps=>ps.map(p=>p.id===pending.proofId?{...p,...result.proof,status:nextStatus??p.status}:p))
   if(pending.operation==='reject')setQueue('quarantined')
  }setPending(null)})
 return <div className="flex h-full flex-col gap-5 text-zinc-100">
  <header className="rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-900/60 p-5">
   <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Gestão financeira</p>
   <h2 className="mt-1 text-2xl font-bold">Comprovantes PIX</h2>
   <p className="mt-1 text-sm text-zinc-400">Triagem segura, confirmação humana e originais restritos.</p>
  </header>
  <div aria-label="Filtros de comprovantes" className="flex flex-wrap gap-2">{QUEUES.map(([id,label])=>{const active=queue===id,count=proofs.filter(p=>p.status===id).length;return <button key={id} type="button" aria-pressed={active} onClick={()=>setQueue(id)} className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${active?'border-amber-400/50 bg-amber-400/15 text-amber-200':'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800'}`}><span>{label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active?'bg-amber-400/20':'bg-zinc-800'}`}>{count}</span></button>})}</div>
  {error&&<p role="alert" className="text-rose-300">{error}</p>}
  <div className="grid gap-4 overflow-auto xl:grid-cols-2">{loading?<p role="status">Carregando comprovantes…</p>:visible.length===0?<p role="status" className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-zinc-400">Nenhum comprovante nesta fila.</p>:visible.map(p=><article key={p.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm">
   <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-4"><div><p className="text-sm font-semibold text-zinc-100">{p.customer_name||'Cliente não identificado'}</p><p className="mt-1 font-mono text-[11px] text-zinc-500">ID …{p.id.slice(-8)}</p></div><span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">{p.channel}</span></div>
   <dl className="grid grid-cols-2 gap-3 py-4 text-xs"><div className="rounded-xl bg-zinc-950/60 p-3"><dt className="text-zinc-500">Valor sugerido</dt><dd className="mt-1 font-semibold text-zinc-100">{p.suggested_cents==null?'—':`R$ ${(p.suggested_cents/100).toFixed(2).replace('.',',')}`}</dd></div><div className="rounded-xl bg-zinc-950/60 p-3"><dt className="text-zinc-500">Confiança da análise</dt><dd className="mt-1 font-semibold text-zinc-100">{p.extraction_confidence==null?'—':`${Math.round(p.extraction_confidence*100)}%`}</dd></div>{p.status==='quarantined'&&<div className="col-span-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3"><dt className="text-rose-300">Eliminação automática em</dt><dd className="mt-1 font-semibold text-rose-200">{quarantineCountdown(p.purge_after,now?new Date(now):new Date())}</dd></div>}</dl>
   <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
    <button type="button" disabled={!p.preview_url} onClick={()=>setPreview(p)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-40"><Eye className="h-3.5 w-3.5"/>Vista Previa</button>
    <a href={p.original_url} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-400/20"><FileText className="h-3.5 w-3.5"/>PDF original</a>
    {p.status==='admitted'?<div className="w-full rounded-xl border border-zinc-700 p-3"><p className="mb-2 text-sm font-semibold">Pedidos pendentes do cliente</p>{orders.filter(o=>o.customer_id===p.customer_id).map(o=><label key={o.id} className="flex items-center justify-between gap-2 py-1 text-xs"><span><input type="checkbox" aria-label={`Pedido ${o.id.slice(-4)}`} checked={selected.includes(o.id)} onChange={()=>setSelected(s=>s.includes(o.id)?s.filter(id=>id!==o.id):[...s,o.id])}/> Pedido …{o.id.slice(-4)}</span><span>R$ {(o.total_pedido_centavos/100).toFixed(2).replace('.',',')}</span></label>)}<p className="mt-2 text-xs">Selecionado: R$ {(orders.filter(o=>selected.includes(o.id)).reduce((sum,o)=>sum+o.total_pedido_centavos,0)/100).toFixed(2).replace('.',',')} · Comprovante: R$ {((p.confirmed_cents??0)/100).toFixed(2).replace('.',',')}</p><button className="mt-3 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40" disabled={!selected.length||orders.filter(o=>selected.includes(o.id)).reduce((sum,o)=>sum+o.total_pedido_centavos,0)!==p.confirmed_cents} onClick={()=>setPending({operation:'reconcile',proofId:p.id,orderIds:selected})}>Conciliar pedidos</button></div>:p.status==='quarantined'?<button className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20" onClick={()=>setPending({operation:'restore',proofId:p.id})}><RotateCcw className="h-3.5 w-3.5"/>Restaurar</button>:<><button className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20" onClick={()=>setPending({operation:'admit',proofId:p.id})}><CheckCircle2 className="h-3.5 w-3.5"/>Admitir</button><button className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-400/20" onClick={()=>setPending({operation:'reject',proofId:p.id})}><ShieldX className="h-3.5 w-3.5"/>Rejeitar</button></>}
   </div></article>)}</div>
  {preview?.preview_url&&<div role="dialog" aria-modal="true" aria-label="Comprovante PIX ampliado" className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4" onMouseDown={event=>event.target===event.currentTarget&&setPreview(null)}><div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl"><div className="mb-3 flex items-center justify-between gap-3 px-1"><div><p className="text-sm font-semibold">Vista previa do comprovante</p><p className="text-xs text-zinc-500">{preview.customer_name||'Cliente não identificado'}</p></div><button type="button" onClick={()=>setPreview(null)} aria-label="Fechar prévia" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">Fechar</button></div><div className="grid max-h-[82vh] place-items-center overflow-auto rounded-xl bg-white p-2"><img src={preview.preview_url} alt="Comprovante PIX ampliado" className="max-h-[78vh] max-w-full object-contain"/></div></div></div>}
  {pending&&<ConfirmActionDialog title="Confirmar ação" description="Esta ação será auditada e aplicada pela autoridade do servidor." confirmLabel={pending.operation==='restore'?'Confirmar restauração':pending.operation==='reconcile'?'Confirmar conciliação':'Confirmar ação'} onConfirm={execute} onClose={()=>setPending(null)} busy={busy}/>}
 </div>
}
