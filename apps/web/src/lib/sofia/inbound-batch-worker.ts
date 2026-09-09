import type { SupabaseClient } from '@supabase/supabase-js'
import { processarRagBatchPipeline } from '@/lib/ai/openrouter'
import { obterSofiaGlobalChannelConfig } from '@/lib/config/sistema'
import { verificarHorarioAtendimento } from '@/lib/horarios/verificar'
import { enviarMensagemTelegram } from '@/lib/telegram/send'
import { enviarMensagemWhatsapp } from '@/lib/whatsapp/send'
import { isWhatsAppInboundEligibleForSofia } from '@/lib/whatsapp/sofia-control'

type Channel='telegram'|'whatsapp'
type Member={content:string|null;has_attachment:boolean;has_payment_proof:boolean}
type Claim={batch_id:string;conversa_id:string;cliente_id:string;channel:Channel;lease_token:string;eligibility:{db_eligible:boolean;ia_ativa?:boolean;conversation_status?:string;automation_allowed?:boolean;global_enabled?:boolean;whatsapp_status?:string;whatsapp_sleeping?:boolean};members:Member[]}
type Delivery={batch_id:string;conversa_id:string;canal:Channel;response_text:string;lease_token:string}
export type BatchCounts={claimed:number;completed:number;cancelled:number;failed:number;delivery_attempted:number}
export interface BatchWorkerDeps {
 claimBatch():Promise<Claim|null>; cancel(id:string,lease:string,reason:string):Promise<boolean>; fail(id:string,lease:string,error:string):Promise<boolean>
 businessHours():Promise<boolean>; globalEnabled(channel:Channel):Promise<boolean>; whatsappEligible(claim:Claim):Promise<boolean>
 generate(conversationId:string,context:string,channel:Channel):Promise<string>; complete(id:string,lease:string,text:string):Promise<boolean>
 claimDelivery():Promise<Delivery|null>; beginDelivery(id:string,lease:string):Promise<boolean>; recordDeliveryFailure(id:string,reason:string):Promise<unknown>
 sendTelegram(id:string,text:string):Promise<unknown>;sendWhatsApp(id:string,text:string):Promise<unknown>
}
export function formatBatchContext(members:Member[]):string {
 return ['MENSAGENS RECEBIDAS NESTE LOTE (ordem cronológica):',...members.map((m,i)=>{
  const text=m.content?.trim(); const attachment=m.has_payment_proof?' [anexo: comprovante de pagamento recebido]':m.has_attachment?' [anexo recebido]':''
  return `[${i+1}] Cliente: ${text?`"${text}"${attachment}`:attachment.trim().replace(/\]$/, '; mensagem sem texto]')}`
 })].join('\n')
}
export async function runSofiaBatchMaintenance(d:BatchWorkerDeps,limit=20):Promise<BatchCounts>{
 const out:BatchCounts={claimed:0,completed:0,cancelled:0,failed:0,delivery_attempted:0}
 const processingLimit=Math.ceil(limit/2)
 for(let i=0;i<processingLimit;i++){
  const c=await d.claimBatch();if(!c)break;out.claimed++
  try{
   const e=c.eligibility
   let reason:string|null=e.ia_ativa===false?'ia_inactive':e.automation_allowed===false||e.whatsapp_status==='opted_out'?'opt_out':e.global_enabled===false?'global_disabled':e.conversation_status&&e.conversation_status!=='ia_atendendo'?'handoff_or_pause':e.whatsapp_sleeping?'sleep_or_cooldown':!e.db_eligible?'handoff_or_pause':!(await d.globalEnabled(c.channel))?'global_disabled':!(await d.businessHours())?'outside_business_hours':null
   if(!reason&&c.channel==='whatsapp'&&!(await d.whatsappEligible(c)))reason='sleep_or_cooldown'
   if(reason){await d.cancel(c.batch_id,c.lease_token,reason);out.cancelled++;continue}
   const text=await d.generate(c.conversa_id,formatBatchContext(c.members),c.channel)
   if(!(await d.complete(c.batch_id,c.lease_token,text))){out.failed++;continue} out.completed++
  }catch{await d.fail(c.batch_id,c.lease_token,'generation_failed');out.failed++}
 }
 let workClaimed=out.claimed
 while(workClaimed<limit){
  const job=await d.claimDelivery();if(!job)break;workClaimed++
  if(!(await d.beginDelivery(job.batch_id,job.lease_token)))continue
  out.delivery_attempted++
  try{
   const result=await(job.canal==='telegram'?d.sendTelegram(job.conversa_id,job.response_text):d.sendWhatsApp(job.conversa_id,job.response_text))
   if(result&&typeof result==='object'&&(('success'in result&&result.success===false)||('sucesso'in result&&result.sucesso===false)))await d.recordDeliveryFailure(job.batch_id,'provider_rejected')
  }catch{await d.recordDeliveryFailure(job.batch_id,'provider_unavailable')}
 }
 return out
}
function row<T>(data:T|T[]|null):T|null{return Array.isArray(data)?data[0]??null:data}
export function createSofiaBatchWorkerDeps(db:SupabaseClient):BatchWorkerDeps{
 const rpc=async<T>(name:string,args:object={})=>{const r=await db.rpc(name,args);if(r.error)throw Error(name);return row(r.data) as T}
 return {
  claimBatch:()=>rpc('claim_sofia_inbound_batch',{p_lease_seconds:60}),cancel:(id,l,r)=>rpc('cancel_sofia_inbound_batch',{p_batch_id:id,p_lease_token:l,p_reason:r}),fail:(id,l,e)=>rpc('fail_sofia_inbound_batch',{p_batch_id:id,p_lease_token:l,p_error:e}),
  businessHours:async()=>(await verificarHorarioAtendimento()).dentro,globalEnabled:async c=>(await obterSofiaGlobalChannelConfig(c)).enabled,whatsappEligible:async c=>(await isWhatsAppInboundEligibleForSofia({supabase:db,clienteId:c.cliente_id,conversaId:c.conversa_id})).eligible,
  generate:processarRagBatchPipeline,complete:async(id,l,t)=>!!await rpc('complete_sofia_inbound_batch',{p_batch_id:id,p_lease_token:l,p_response_text:t}),claimDelivery:()=>rpc('claim_sofia_response_delivery',{p_lease_seconds:60}),beginDelivery:(id,l)=>rpc('begin_sofia_response_delivery',{p_batch_id:id,p_lease_token:l}),recordDeliveryFailure:(id,r)=>rpc('record_sofia_response_delivery_failure',{p_batch_id:id,p_failure:r}),
  sendTelegram:(id,text)=>enviarMensagemTelegram(id,{texto:text,remetente:'ia',salvarNoBanco:false}),sendWhatsApp:(id,text)=>enviarMensagemWhatsapp(id,{texto:text,remetente:'ia',salvarNoBanco:false})
 }
}
