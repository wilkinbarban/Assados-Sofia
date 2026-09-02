import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20260902130000_payment_proof_outbox_destination_contract.sql', 'utf8')

describe('payment-proof outbox destination migration contract', () => {
  it('binds proof and outbox destinations with restrictive conversation foreign keys', () => {
    expect(migration).toMatch(/payment_proofs\s+add column if not exists conversation_id uuid references public\.conversas\(id\) on delete restrict/i)
    expect(migration).toMatch(/payment_proof_outbox\s+add column if not exists conversation_id uuid references public\.conversas\(id\) on delete restrict/i)
    expect(migration).toContain('PAYMENT_PROOF_CONVERSATION_CUSTOMER_MISMATCH')
    expect(migration).toContain('v.conversation_id is distinct from p_conversation_id')
  })

  it('requires a valid destination for every new admission and permits one historical null binding', () => {
    expect(migration).toContain("if p_conversation_id is null then raise exception using errcode='22023',message='PAYMENT_PROOF_CONVERSATION_REQUIRED';end if;")
    expect(migration).toContain('if v.conversation_id is null then')
    expect(migration).toContain('update public.payment_proofs set conversation_id=p_conversation_id,updated_at=now() where id=v.id;')
    expect(migration).toContain("elsif v.conversation_id is distinct from p_conversation_id then")
    expect(migration).toContain("message='PAYMENT_PROOF_DELIVERY_CONFLICT'")
  })

  it('replaces intake/enqueue signatures and every current outbox producer', () => {
    expect(migration).toContain('drop function if exists public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text);')
    expect(migration).toContain('drop function if exists public.admit_payment_proof_intake(text,text,uuid,text,text,bigint,text,uuid);')
    expect(migration).toContain('drop function if exists public.admit_and_enqueue_payment_proof(text,text,uuid,text,text,bigint,text,uuid,text);')
    for (const producer of ['register_payment_proof_hash', 'quarantine_payment_proof', 'restore_payment_proof', 'manage_payment_proof_review']) {
      expect(migration).toMatch(new RegExp(`function public\\.${producer}`))
    }
    expect((migration.match(/insert into public\.payment_proof_outbox\(proof_id,conversation_id,event_type,channel,payload\)/g) || []).length).toBe(4)
  })

  it('claims the stored destination top-level without a latest-conversation lookup', () => {
    expect(migration).toContain("'conversation_id',o.conversation_id")
    expect(migration).not.toMatch(/payment_proof_outbox[\s\S]{0,2000}order\('data_atualizacao'/i)
  })

  it('uses the new disposition signature and preserves fenced processing/purge completion branches', () => {
    expect(migration).toContain('complete_payment_proof_maintenance(p_kind text,p_id text,p_disposition text,p_error text,p_lease_token uuid,p_attempt integer)')
    expect(migration).toContain("p_disposition not in('success','retryable','permanent')")
    expect(migration).toContain("p_disposition='permanent' or attempts>=5")
    expect(migration).toContain("p_kind='processing'")
    expect(migration).toContain("p_kind='purge'")
    expect(migration).toContain('lease_token=p_lease_token and attempts=p_attempt')
    expect(migration).toContain('purge_lease_token=p_lease_token and purge_attempt=p_attempt')
  })

  it('excludes deferred historical repair and disposition ledger work', () => {
    expect(migration).not.toContain('payment_proof_outbox_dispositions')
    expect(migration).not.toContain('abandon_unresolvable_payment_proof_outbox')
    expect(migration).not.toContain('repair_payment_proof_outbox_destination')
    expect(migration).not.toContain("'abandoned'")
  })
})
