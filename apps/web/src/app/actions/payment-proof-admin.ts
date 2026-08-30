'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function staff() {
 const session=await createClient();const {data:{user}}=await session.auth.getUser()
 if(!user)return null
 const {data:profile}=await session.from('perfis').select('funcao,ativo').eq('id',user.id).single()
 return profile?.ativo&&['admin','supervisor'].includes(profile.funcao)?{session,user,role:profile.funcao}:null
}
export async function listPaymentProofsForAdmin(){
 const actor=await staff();if(!actor)return {success:false as const,error:'FORBIDDEN'}
 const {data,error}=await actor.session.from('payment_proofs').select('id,customer_id,channel,status,suggested_cents,confirmed_cents,extraction_confidence,purge_after,created_at')
  .order('created_at',{ascending:false}).limit(200)
 if(error)return {success:false as const,error:error.message}
 return {success:true as const,data:(data||[]).map(p=>({
  ...p,
  customer_name:p.customer_id?`Cliente …${p.customer_id.slice(-4)}`:null,
  preview_url:`/api/payment-proofs/${p.id}/preview`,
  original_url:`/api/payment-proofs/${p.id}/original`,
 }))}
}
export async function listEligiblePaymentProofOrders(customerId:string){
 const actor=await staff();if(!actor)return {success:false as const,error:'FORBIDDEN'}
 if(!/^[0-9a-f-]{36}$/i.test(customerId))return {success:false as const,error:'INVALID_CUSTOMER'}
 const {data,error}=await actor.session.from('pedidos').select('id,cliente_id,total_pedido_centavos,status,status_pagamento')
  .eq('cliente_id',customerId).eq('status_pagamento','pendente').neq('status','cancelado').order('data_criacao',{ascending:false}).limit(100)
 if(error)return {success:false as const,error:error.message}
 return {success:true as const,data:(data||[]).map(order=>({...order,customer_id:order.cliente_id}))}
}
export async function mutatePaymentProofAdmin(input:{operation:string;proofId:string;value?:string|number;orderIds?:string[]}){
 const actor=await staff();if(!actor)return {success:false,error:'FORBIDDEN'}
 if(!/^[0-9a-f-]{36}$/i.test(input.proofId))return {success:false,error:'INVALID_PROOF'}
 if(input.operation==='reconcile'){
  if(!input.orderIds?.length||input.orderIds.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))return {success:false,error:'INVALID_ORDERS'}
  const {error}=await actor.session.rpc('reconcile_payment_proof',{p_proof_id:input.proofId,p_order_ids:input.orderIds,p_idempotency_key:crypto.randomUUID()})
  if(error)return {success:false,error:error.message};revalidatePath('/atendimento/admin');return {success:true}
 }
 const rpc=input.operation==='restore'?'restore_payment_proof':'manage_payment_proof_review'
 const args=input.operation==='restore'?{p_proof_id:input.proofId,p_reason:'admin workflow'}:
  {p_proof_id:input.proofId,p_operation:input.operation,p_value:input.value==null?null:String(input.value)}
 const {error}=await actor.session.rpc(rpc,args)
 if(error)return {success:false,error:error.message}
 const {data:updatedProof,error:updatedProofError}=await actor.session
  .from('payment_proofs').select('status,purge_after').eq('id',input.proofId).single()
 if(updatedProofError)return {success:false,error:updatedProofError.message}
 if(input.operation==='admit'){
  const admin=createAdminClient()
  const {data:proof}=await admin.from('payment_proofs').select('customer_id').eq('id',input.proofId).single()
  const {data:conversation}=proof?.customer_id
   ?await admin.from('conversas').select('id').eq('cliente_id',proof.customer_id).order('data_atualizacao',{ascending:false}).limit(1).maybeSingle()
   :{data:null}
  if(conversation?.id){
   const {error:projectionError}=await admin.rpc('project_payment_proof_to_chat',{p_proof_id:input.proofId,p_conversa_id:conversation.id})
   if(projectionError)return {success:false,error:projectionError.message}
  }
 }
 revalidatePath('/atendimento/admin');revalidatePath('/atendimento');revalidatePath('/cliente/chat')
 return {success:true,proof:updatedProof}
}
