import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
export const runtime='nodejs';export const dynamic='force-dynamic'

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const session=await createClient()
 const {data:{user}}=await session.auth.getUser();if(!user)return Response.json({error:'UNAUTHENTICATED'},{status:401})
 const {data:profile}=await session.from('perfis').select('funcao,ativo').eq('id',user.id).single()
 if(!profile?.ativo||!['admin','supervisor'].includes(profile.funcao))return Response.json({error:'FORBIDDEN'},{status:403})
 const admin=createAdminClient();const {data:proof}=await admin.from('payment_proofs').select('original_storage_key').eq('id',id).single()
 if(!proof)return Response.json({error:'NOT_FOUND'},{status:404})
 const {data,error}=await admin.storage.from('payment-proofs').download(proof.original_storage_key)
 if(error||!data)return Response.json({error:'NOT_FOUND'},{status:404})
 return new Response(await data.arrayBuffer(),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="comprovante-${id}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}
