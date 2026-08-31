import { readFileSync } from 'node:fs';import { join } from 'node:path';import { describe,expect,it } from 'vitest'
const sql=readFileSync(join(process.cwd(),'supabase/migrations/20260826180000_payment_proof_exact_reconciliation.sql'),'utf8')
const leases=readFileSync(join(process.cwd(),'supabase/migrations/20260828340000_payment_proof_operator_leases.sql'),'utf8')
describe('exact payment proof reconciliation',()=>{
 it('locks proof and orders, rejects mismatch/cross-client/reconciliation replay conflicts',()=>{
  expect(sql).toContain('order by id for update');expect(sql).toContain('PAYMENT_PROOF_AMOUNT_MISMATCH')
  expect(sql).toContain('PAYMENT_PROOF_ORDER_CUSTOMER_MISMATCH');expect(sql).toContain('PAYMENT_PROOF_ALREADY_RECONCILED')
 })
 it('delegates every approval to registrar_status_pagamento with digital proof provenance',()=>{
  expect(sql).toContain('public.registrar_status_pagamento(');expect(sql).toContain("'digital_proof'")
  expect(sql).not.toMatch(/update public\.pedidos set status_pagamento/)
 })
 it('preserves early-order intent, reconciliation marker, and added-order intent semantics behind the lease wrapper',()=>{
  expect(leases).toContain('PAYMENT_PROOF_REQUESTED_ORDER_REQUIRED')
  expect(leases).toContain("perform set_config('app.payment_proof_reconciliation_id',p_proof_id::text,true)")
  expect(leases).toContain("values(p_proof_id,o.id,'operator_reconciliation') on conflict do nothing")
 })
 it('holds the locked active profile role through leased reconciliation audit writes',()=>{
  expect(leases).toContain('require_active_payment_proof_actor_role()')
  expect(leases).toMatch(/from public\.perfis p[\s\S]*for update/)
  expect(leases).toContain('public.reconcile_payment_proof_authorized(p_proof_id,p_order_ids,p_idempotency_key,role_at_action)')
  expect(leases).toContain('actor_role) values(p_proof_id,auth.uid(),p_idempotency_key,p.confirmed_cents,p_actor_role)')
  expect(leases).toContain("actor_role,source,previous_status,result_status,metadata) values(p_proof_id,'reconciled',auth.uid(),p_actor_role")
 })
})
