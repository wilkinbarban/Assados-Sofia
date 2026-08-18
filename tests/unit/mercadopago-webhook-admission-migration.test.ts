import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260722185304_mercado_pago_webhook_admission.sql',
), 'utf8')

const duplicateFixMigration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260722191412_fix_mercado_pago_webhook_admission_duplicate.sql',
), 'utf8')

describe('MercadoPago webhook admission migration', () => {
  it('creates an atomically claimed, service-only delivery admission', () => {
    expect(migration).toContain('create table public.mercado_pago_webhook_admissions')
    expect(migration).toContain('request_id text primary key')
    expect(migration).toContain('payment_id text not null')
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('revoke all on table public.mercado_pago_webhook_admissions from public, anon, authenticated')
    expect(migration).toContain('create or replace function public.admitir_webhook_mercado_pago')
    expect(migration).toContain('security definer')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('on conflict (request_id) do nothing')
    expect(migration).toContain('revoke all on function public.admitir_webhook_mercado_pago(text, text) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.admitir_webhook_mercado_pago(text, text) to service_role')
  })

  it('returns false rather than null when the delivery was already admitted', () => {
    expect(duplicateFixMigration).toContain('create or replace function public.admitir_webhook_mercado_pago')
    expect(duplicateFixMigration).toContain('coalesce(v_admitted, false)')
    expect(duplicateFixMigration).toContain('on conflict (request_id) do nothing')
  })
})
