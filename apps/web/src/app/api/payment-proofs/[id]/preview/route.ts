import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const session=await createClient();const {data:{user}}=await session.auth.getUser()
 if(!user)return new Response(null,{status:401})
 const admin=createAdminClient()
 const {data:proof}=await admin.from('payment_proofs').select('id,customer_id,status,preview_storage_key').eq('id',id).single()
 if(!proof?.preview_storage_key)return new Response(null,{status:404})

 const {data:profile}=await admin.from('perfis').select('funcao,ativo').eq('id',user.id).single()
 const isStaff=Boolean(profile?.ativo&&['admin','supervisor','vendedor'].includes(profile.funcao))
 if(!isStaff){
  const {data:cliente}=await admin.from('clientes').select('id').eq('usuario_id',user.id).single()
  if(!cliente||cliente.id!==proof.customer_id)return new Response(null,{status:403})
  if(proof.status!=='admitted'&&proof.status!=='review'&&proof.status!=='received')return new Response(null,{status:404})
 }
 const {data}=await admin.storage.from('payment-proofs').download(proof.preview_storage_key)
 return data?new Response(await data.arrayBuffer(),{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store'}}):new Response(null,{status:404})
}
