import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20260902160000_payment_proof_processing_historical_disposition.sql', 'utf8')

const dispositionFunction = migration.match(
  /create function public\.dispose_payment_proof_processing_missing_original[\s\S]*?end\$\$;/i,
)?.[0] ?? ''

const dispositionUpdate = dispositionFunction.match(
  /update private\.payment_proof_processing_queue[\s\S]*?where proof_id=canonical_target;/i,
)?.[0] ?? ''

const deliveryStateFunction = migration.match(
  /create or replace function public\.get_payment_proof_delivery_state[\s\S]*?end\$\$;/i,
)?.[0] ?? ''

describe('payment-proof processing historical disposition migration contract', () => {
  it('keeps the immutable private audit ledger after proof purge while retaining its historical decision evidence', () => {
    expect(migration).toMatch(/create table private\.payment_proof_processing_maintenance_audit/i)
    expect(migration).toContain('proof_id uuid references public.payment_proofs(id) on delete set null')
    expect(migration).toContain("target_fingerprint text not null check(target_fingerprint~'^[0-9a-f]{64}$')")
    expect(migration).toContain("decision text not null check(decision in ('abandoned_missing_original','invalid_request','ineligible'))")
    expect(migration).toContain('idempotency_key uuid not null unique')
    expect(migration).toMatch(/before update or delete on private\.payment_proof_processing_maintenance_audit/i)
    expect(migration).toContain('revoke all on private.payment_proof_processing_maintenance_audit from public,anon,authenticated,service_role;')
  })

  it('allows only pristine pending quarantined work whose original object is absent', () => {
    expect(migration).toContain("proof.status='quarantined'")
    expect(migration).toContain('proof.original_storage_key is not null')
    expect(migration).toContain("q.status='pending' and q.attempts=0")
    expect(migration).toContain('q.claimed_until is null and q.lease_token is null')
    expect(migration).toContain('q.completed_at is null and q.dead_lettered_at is null and q.failure_stage is null')
    expect(migration).toContain("o.bucket_id='payment-proofs' and o.name=proof.original_storage_key")
    expect(migration).toContain('where id=canonical_target for update')
    expect(migration).toContain('where proof_id=canonical_target for update')
  })

  it('only abandons the processing queue and clears all terminal, lease, and failure fields', () => {
    expect(dispositionUpdate).toContain("set status='abandoned',completed_at=null,dead_lettered_at=null,")
    expect(dispositionUpdate).toContain('claimed_until=null,lease_token=null,failure_stage=null')
    expect(dispositionUpdate).not.toMatch(/completed_at=now\(\)/i)
    expect(dispositionUpdate).not.toMatch(/update public\.payment_proofs/i)
    expect(dispositionUpdate).not.toMatch(/delete from/i)
    expect(dispositionUpdate).not.toMatch(/storage\./i)
    expect(migration).not.toMatch(/(?:perform|select)\s+public\.(?:claim|complete|enqueue|replay)_payment_proof/i)
  })

  it('treats abandoned queue work as terminal in the recreated service-role-only delivery-state RPC', () => {
    expect(deliveryStateFunction).toContain("q.status in('completed','dead_letter','abandoned')")
    expect(deliveryStateFunction).toContain("return jsonb_build_object('state','complete')")
    expect(migration).toContain('revoke all on function public.get_payment_proof_delivery_state(text,text) from public,anon,authenticated,service_role;')
    expect(migration).toContain('grant execute on function public.get_payment_proof_delivery_state(text,text) to service_role;')
  })

  it('preserves hardened authenticated authorization, UUID idempotency, locking, and opaque results', () => {
    expect(migration).toContain("p.funcao in ('admin','supervisor') for update")
    expect(migration).toContain('canonical_target:=p_target_id::uuid')
    expect(migration).toContain('perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));')
    expect(migration).toContain("'operation','dispose_missing_original','target_id',p_target_id,'reason_code',p_reason_code")
    expect(migration).toContain("message='PAYMENT_PROOF_PROCESSING_MAINTENANCE_IDEMPOTENCY_CONFLICT'")
    expect(migration).toContain("return jsonb_build_object('outcome',outcome)")
    expect(dispositionFunction.match(/return jsonb_build_object\('outcome',(prior\.decision|outcome)\)/g)).toHaveLength(2)
  })
})
