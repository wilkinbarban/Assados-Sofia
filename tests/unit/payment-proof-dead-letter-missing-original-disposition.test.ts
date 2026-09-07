import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260907120000_payment_proof_dead_letter_missing_original_disposition.sql',
  'utf8',
)

const disposition = migration.match(
  /create function public\.dispose_payment_proof_processing_dead_letter_missing_original[\s\S]*?end\$\$;/i,
)?.[0] ?? ''

describe('dead-letter missing-original disposition contract', () => {
  it('requires a terminal load failure and an absent canonical object', () => {
    expect(disposition).toContain("q.status='dead_letter' and q.attempts>=5 and q.failure_stage='load'")
    expect(disposition).toContain("proof.status in ('review','purged')")
    expect(disposition).toContain("o.bucket_id='payment-proofs' and o.name=proof.original_storage_key")
    expect(disposition).toContain('where id=canonical_target for update')
    expect(disposition).toContain('where proof_id=canonical_target for update')
  })

  it('quarantines only review proofs and never reopens purged proofs', () => {
    expect(disposition).toContain("if proof.status='review' then")
    expect(disposition).toContain("set status='quarantined',quarantined_at=now(),")
    expect(disposition).toContain("outcome:='abandoned_purged'")
    expect(disposition.match(/update public\.payment_proofs/g)).toHaveLength(1)
  })

  it('abandons the queue atomically and clears retry state', () => {
    expect(disposition).toContain("set status='abandoned',completed_at=null,dead_lettered_at=null,")
    expect(disposition).toContain('claimed_until=null,lease_token=null,failure_stage=null')
  })

  it('uses privileged authorization, immutable audit and opaque idempotency', () => {
    expect(disposition).toContain("p.funcao in ('admin','supervisor') for update")
    expect(disposition).toContain('perform pg_advisory_xact_lock')
    expect(disposition).toContain('PAYMENT_PROOF_PROCESSING_MAINTENANCE_IDEMPOTENCY_CONFLICT')
    expect(disposition).toContain("return jsonb_build_object('outcome',prior.decision)")
    expect(disposition).toContain("return jsonb_build_object('outcome',outcome)")
    expect(disposition).not.toMatch(/jsonb_build_object\([^)]*(?:storage|customer|conversation|delivery)/i)
  })
})
