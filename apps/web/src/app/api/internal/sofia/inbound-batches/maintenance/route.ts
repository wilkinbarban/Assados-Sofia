import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { inboundBatchProcessingEnabled } from '@/lib/sofia/inbound-batch-gates'
import { createSofiaBatchWorkerDeps,runSofiaBatchMaintenance } from '@/lib/sofia/inbound-batch-worker'
import { createAdminClient } from '@/lib/supabase/admin'
export const dynamic='force-dynamic'
const zero={claimed:0,completed:0,cancelled:0,failed:0,delivery_attempted:0}
function authorized(header:string|null,secret:string|null){if(!header||!secret)return false;const a=Buffer.from(header),b=Buffer.from(`Bearer ${secret}`);return a.length===b.length&&timingSafeEqual(a,b)}
export async function POST(request:Request){
 const secret=await obterConfiguracaoSistema('SOFIA_BATCH_MAINTENANCE_SECRET')
 if(!authorized(request.headers.get('authorization'),secret))return NextResponse.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}})
 if(!inboundBatchProcessingEnabled())return NextResponse.json(zero,{headers:{'Cache-Control':'no-store'}})
 try{return NextResponse.json(await runSofiaBatchMaintenance(createSofiaBatchWorkerDeps(createAdminClient()),20),{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'maintenance_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
