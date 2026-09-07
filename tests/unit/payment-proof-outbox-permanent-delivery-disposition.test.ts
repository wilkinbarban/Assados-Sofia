import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20260902150000_payment_proof_outbox_permanent_delivery_disposition.sql', 'utf8')

describe('payment-proof bound permanent delivery disposition', () => {
  it('extends the immutable maintenance ledger with the audited permanent-delivery outcome and reason', () => {
    expect(migration).toContain("decision in ('destination_repaired','abandoned_unresolvable','abandoned_permanent_delivery','invalid_request','ineligible')")
    expect(migration).toContain("reason_code in ('historical_destination_unresolvable','historical_destination_repaired','historical_delivery_permanently_blocked','invalid_request','ineligible')")
    expect(migration).toContain('alter table private.payment_proof_outbox_maintenance_audit')
    expect(migration).not.toMatch(/drop table|delete from private\.payment_proof_outbox_maintenance_audit/i)
  })

  it('disposes only an unleased bound dead letter with exactly one customer-owned authoritative destination', () => {
    expect(migration).toMatch(/function public\.dispose_payment_proof_outbox_permanent_delivery\(p_target_id text,p_reason_code text,p_idempotency_key uuid\)/)
    expect(migration).toContain("p_reason_code is distinct from 'historical_delivery_permanently_blocked'")
    expect(migration).toContain("o.status='dead_letter' and o.claimed_until is null and o.lease_token is null")
    expect(migration).toContain('count(distinct p.conversa_id) into authoritative_count')
    expect(migration).toContain('authoritative_count<>1')
    expect(migration).toContain('p.cliente_id is distinct from proof.customer_id')
    expect(migration).toContain('o.conversation_id is distinct from authoritative_conversation')
    expect(migration).toContain("set status='abandoned',claimed_until=null,lease_token=null,completed_at=null,last_error='historical_delivery_permanently_blocked'")
    expect(migration).toContain("outcome:='abandoned_permanent_delivery';audit_reason:='historical_delivery_permanently_blocked'")
  })

  it('keeps access hardened and idempotency conflict-safe', () => {
    expect(migration).toContain("message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_KEY_REQUIRED'")
    expect(migration).toContain("message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_CONFLICT'")
    expect(migration).toContain('perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));')
    expect(migration).toContain('revoke all on function public.dispose_payment_proof_outbox_permanent_delivery(text,text,uuid) from public,anon,authenticated,service_role;')
    expect(migration).toContain('grant execute on function public.dispose_payment_proof_outbox_permanent_delivery(text,text,uuid) to authenticated;')
  })

  it('persists the bounded target fingerprint and terminal outcome in the immutable audit ledger', () => {
    expect(migration).toContain('target_fingerprint')
    expect(migration).toContain("fingerprint:=encode(extensions.digest(jsonb_build_object('operation','dispose_permanent_delivery','target_id',p_target_id,'reason_code',p_reason_code)::text,'sha256'),'hex')")
    expect(migration).toContain("outcome:='abandoned_permanent_delivery';audit_reason:='historical_delivery_permanently_blocked'")
    expect(migration).toContain('insert into private.payment_proof_outbox_maintenance_audit')
    expect(migration).not.toContain("perform public.replay_payment_proof_dead_letter")
  })
})
