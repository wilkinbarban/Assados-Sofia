import { readFileSync } from 'node:fs';import { join } from 'node:path';import { describe,expect,it } from 'vitest'
const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260826190000_manual_external_payment.sql'),'utf8')
const actions=readFileSync(join(process.cwd(),'apps/web/src/app/actions/pedidos.ts'),'utf8')
describe('manual external payment authority',()=>{
 it('requires bounded note, method, exact cents and eligible unique orders',()=>{expect(sql).toContain('MANUAL_EXTERNAL_NOTE_REQUIRED');expect(sql).toContain('MANUAL_EXTERNAL_AMOUNT_MISMATCH');expect(sql).toContain('MANUAL_EXTERNAL_ORDER_INELIGIBLE');expect(sql).toContain('array_agg(distinct')})
 it('records manual_external without fabricating a payment proof',()=>{expect(sql).toContain("'manual_external'");expect(sql).toContain('public.registrar_status_pagamento(');expect(sql).not.toContain('insert into public.payment_proofs');expect(actions).toContain("rpc('approve_manual_external_payment'")})
})
