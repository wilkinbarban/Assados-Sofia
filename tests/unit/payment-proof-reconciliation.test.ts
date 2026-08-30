import { readFileSync } from 'node:fs';import { join } from 'node:path';import { describe,expect,it } from 'vitest'
const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260826180000_payment_proof_exact_reconciliation.sql'),'utf8')
describe('exact payment proof reconciliation',()=>{
 it('locks proof and orders, rejects mismatch/cross-client/reconciliation replay conflicts',()=>{
  expect(sql).toContain('order by id for update');expect(sql).toContain('PAYMENT_PROOF_AMOUNT_MISMATCH')
  expect(sql).toContain('PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH');expect(sql).toContain('PAYMENT_PROOF_ALREADY_RECONCILED')
 })
 it('delegates every approval to registrar_status_pagamento with digital proof provenance',()=>{
  expect(sql).toContain('public.registrar_status_pagamento(');expect(sql).toContain("'digital_proof'")
  expect(sql).not.toMatch(/update public\.pedidos set status_pagamento/)
 })
})
