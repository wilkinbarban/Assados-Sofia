import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20260902140000_payment_proof_outbox_historical_resolution.sql', 'utf8')

describe('payment-proof historical outbox resolution migration contract', () => {
  it('adds a private, immutable idempotent maintenance ledger with hardened target fingerprints', () => {
    expect(migration).toMatch(/create table private\.payment_proof_outbox_maintenance_audit/i)
    expect(migration).toMatch(/decision text not null check\(decision in \('destination_repaired','abandoned_unresolvable','invalid_request','ineligible'\)\)/i)
    expect(migration).toMatch(/reason_code text not null check\(reason_code in \('historical_destination_unresolvable','historical_destination_repaired','invalid_request','ineligible'\)\)/i)
    expect(migration).toMatch(/actor_id uuid not null[\s\S]*actor_role public\.tipo_funcao not null/i)
    expect(migration).toMatch(/target_fingerprint text not null check\(target_fingerprint~'\^\[0-9a-f\]\{64\}\$'\)/i)
    expect(migration).toContain('unique(idempotency_key)')
    expect(migration).not.toMatch(/payment_proof_outbox_maintenance_audit \([\s\S]*proof_id uuid[\s\S]*references/i)
    expect(migration).toContain('revoke all on private.payment_proof_outbox_maintenance_audit from public,anon,authenticated,service_role;')
    expect(migration).toMatch(/create trigger payment_proof_outbox_maintenance_audit_immutable[\s\S]*before update or delete on private\.payment_proof_outbox_maintenance_audit/i)
  })

  it('extends the existing outbox status fence with a terminal abandoned state without treating it as delivery', () => {
    expect(migration).toContain('drop constraint payment_proof_outbox_status_check')
    expect(migration).toContain("check(status in('pending','claimed','completed','dead_letter','abandoned'))")
    expect(migration).not.toMatch(/status in\('pending','claimed','abandoned'\)/)
    expect(migration).toMatch(/status='dead_letter'/)
    expect(migration).not.toMatch(/status='abandoned'[\s\S]{0,160}completed_at=now\(\)/)
  })

  it('disposes only unleased dead letters, keeps dead-letter evidence, and returns opaque outcomes', () => {
    expect(migration).toMatch(/function public\.dispose_payment_proof_outbox_dead_letter\(p_target_id text,p_reason_code text,p_idempotency_key uuid\)/)
    expect(migration).toContain("p_reason_code is distinct from 'historical_destination_unresolvable'")
    expect(migration).toContain("o.status='dead_letter' and o.claimed_until is null and o.lease_token is null")
    expect(migration).toContain("set status='abandoned',claimed_until=null,lease_token=null,completed_at=null")
    expect(migration).toContain("jsonb_build_object('outcome',outcome)")
    expect(migration).toContain("valid_target:=coalesce(p_target_id~'^[1-9][0-9]*$'")
    expect(migration).not.toMatch(/jsonb_build_object\([^)]*proof_id/i)
  })

  it('repairs only the single authoritative order-intent destination for the proof customer and never replays', () => {
    expect(migration).toMatch(/function public\.repair_payment_proof_outbox_destination\(p_target_id text,p_conversation_id uuid,p_idempotency_key uuid\)/)
    expect(migration).toContain('from public.payment_proof_order_intents i join public.pedidos p on p.id=i.pedido_id')
    expect(migration).toContain('count(distinct p.conversa_id)')
    expect(migration).toContain('select distinct p.conversa_id into authoritative_conversation')
    expect(migration).not.toContain('min(p.conversa_id)')
    expect(migration).toContain('perform i.pedido_id from public.payment_proof_order_intents i join public.pedidos p')
    expect(migration).toContain('order by p.id,i.pedido_id for update of i,p')
    expect(migration).toContain('perform c.id from public.payment_proof_order_intents i join public.pedidos p')
    expect(migration).toContain('order by c.id for update of c')
    expect(migration).toContain('p.cliente_id is distinct from proof.customer_id')
    expect(migration).toContain("message='PAYMENT_PROOF_OUTBOX_DESTINATION_CUSTOMER_MISMATCH'")
    expect(migration).toContain("message='PAYMENT_PROOF_OUTBOX_DESTINATION_UNRESOLVABLE'")
    expect(migration).toContain('c.id=authoritative_conversation and c.cliente_id=proof.customer_id')
    expect(migration).toContain("proof.conversation_id is not null and proof.conversation_id is distinct from authoritative_conversation")
    expect(migration).toContain("o.conversation_id is not null and o.conversation_id is distinct from authoritative_conversation")
    expect(migration).toMatch(/jsonb_set\(o\.payload,'\{conversation_id\}'/)
    expect(migration).not.toContain("set status='pending',attempts=0")
  })

  it('keeps direct access closed and exposes only authenticated hardened RPCs with conflict-safe idempotency', () => {
    for (const rpc of ['dispose_payment_proof_outbox_dead_letter(text,text,uuid)', 'repair_payment_proof_outbox_destination(text,uuid,uuid)']) {
      expect(migration).toContain(`revoke all on function public.${rpc} from public,anon,authenticated,service_role;`)
      expect(migration).toContain(`grant execute on function public.${rpc} to authenticated;`)
    }
    expect(migration).toContain("message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_KEY_REQUIRED'")
    expect(migration).toContain("message='PAYMENT_PROOF_OUTBOX_MAINTENANCE_IDEMPOTENCY_CONFLICT'")
    expect(migration).not.toContain("return jsonb_build_object('outcome','idempotency_conflict')")
    expect((migration.match(/pg_advisory_xact_lock/g) || []).length).toBe(2)
    expect((migration.match(/insert into private\.payment_proof_outbox_maintenance_audit/g) || []).length).toBe(2)
    expect(migration).toContain("decision in ('destination_repaired','abandoned_unresolvable','invalid_request','ineligible')")
    expect(migration).toContain("length(p_target_id)=19 and p_target_id<='9223372036854775807'")
    expect(migration).toContain("and p.funcao in ('admin','supervisor') for update")
  })
})
