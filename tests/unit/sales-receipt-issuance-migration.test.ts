import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const harnessPath = join(process.cwd(), 'supabase/tests/sales_receipt_issuance.sql')

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260820160000_sales_receipt_issuance.sql',
)

describe('sales receipt issuance migration', () => {
  it('creates an immutable, idempotent receipt snapshot authority', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('create table if not exists public.comprovantes_venda')
    expect(migration).toContain('unique (pedido_id, snapshot_version)')
    expect(migration).toContain('unique (pedido_id, idempotency_key)')
    expect(migration).toContain('create or replace function public.emitir_comprovante_venda')
    expect(migration).toContain("v_order.status <> 'entregue' or v_order.status_pagamento <> 'aprovado'")
    expect(migration).toContain('RECEIPT_ISSUANCE_INELIGIVEL')
    expect(migration).toContain('digest(v_snapshot::text, \'sha256\')')
    expect(migration).toContain('revoke insert, update, delete on public.comprovantes_venda')
    expect(migration).toContain('create trigger comprovantes_venda_immutable')
    const harness = readFileSync(harnessPath, 'utf8')
    expect(harness).toContain('receipt reissue changed persisted snapshot bytes')
    expect(harness).toContain('customer could not read owned receipt')
  })

  it('keeps inbound payment uploads separate from outbound sales receipts', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).not.toContain('alter table public.comprovantes rename')
    expect(migration).not.toContain('insert into public.comprovantes(')
    expect(migration).toContain("'charged_amount_centavos'")
    expect(migration).toContain("'payment_provenance'")
    expect(migration).toContain("'establishment'")
  })
})
