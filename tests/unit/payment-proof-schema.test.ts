import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(join(root, 'supabase/migrations/20260826110000_payment_proof_schema_ledger_rls.sql'), 'utf8')
const harness = readFileSync(join(root, 'supabase/tests/payment_proof_schema.sql'), 'utf8')

describe('payment proof foundation', () => {
  it('creates a constrained private ledger and append-only events', () => {
    expect(migration).toContain('create table public.payment_proofs')
    expect(migration).toContain('create table public.payment_proof_events')
    expect(migration).toContain("status text not null default 'received'")
    expect(migration).toContain("channel text not null check (channel in ('web','whatsapp','telegram'))")
    expect(migration).toContain('original_storage_key text not null')
    expect(migration).toContain('preview_storage_key text')
    expect(migration).toContain('sha256 text')
    expect(migration).toContain('confirmed_cents integer')
    expect(migration).toContain('purge_after timestamptz')
    expect(migration).toContain('revoke insert, update, delete, truncate on public.payment_proof_events')
  })

  it('keeps API roles read-only and scopes reads by customer or active staff', () => {
    expect(migration).toMatch(/revoke insert, update, delete, truncate on public\.payment_proofs from public, anon, authenticated/)
    expect(migration).toContain('payment_proofs_customer_read')
    expect(migration).toContain('payment_proofs_staff_read')
    expect(migration).toContain("p.funcao in ('admin','supervisor','vendedor')")
    expect(migration).toContain('p.ativo = true')
    expect(harness).toContain('cross-client proof leaked')
    expect(harness).toContain('seller could not read admitted proof metadata')
    expect(harness).toContain('direct payment proof write unexpectedly succeeded')
  })
})
