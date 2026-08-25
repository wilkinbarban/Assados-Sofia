import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const harnessPath = join(process.cwd(), 'supabase/tests/payment_approval_authority.sql')
const upgradeHarnessPath = join(
  process.cwd(),
  'supabase/tests/manual_payment_idempotency_upgrade.sql',
)

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260820150000_payment_approval_authority.sql',
)
const forwardMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20260820173000_manual_payment_idempotency_forward_fix.sql',
)

describe('payment approval authority migration', () => {
  it('records append-only manual and Mercado Pago payment provenance', () => {
    const migration = readFileSync(migrationPath, 'utf8')
    const forwardMigration = readFileSync(forwardMigrationPath, 'utf8')
    const authority = `${migration}\n${forwardMigration}`

    expect(migration).toContain('create table if not exists public.pedido_payment_events')
    expect(migration).toContain("source text not null check (source in ('manual', 'mercado_pago'))")
    expect(migration).toContain('pedido_payment_events_mercado_pago_reference_key')
    expect(authority).toContain('pedido_payment_events_manual_idempotency_key')
    expect(authority).toContain('p_idempotency_key uuid')
    expect(authority).toContain("where source = 'manual'")
    expect(authority).toContain('create or replace function public.registrar_status_pagamento')
    expect(authority).toContain("p_source = 'manual'")
    expect(authority).toContain("p_source = 'mercado_pago'")
    expect(authority).toContain('MANUAL_PAYMENT_REASON_REQUIRED')
    expect(authority).toContain('MERCADO_PAGO_EXTERNAL_REFERENCE_REQUIRED')
    expect(authority).toContain('v_actor is not null')
    expect(authority).toContain('v_actor is not null then')
  })

  it('keeps payment writes auditable and prevents direct event mutation', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('previous_status public.status_pagamento not null')
    expect(migration).toContain('target_status public.status_pagamento not null')
    expect(migration).toContain('revoke insert, update, delete on public.pedido_payment_events')
    expect(migration).toContain('revoke update(status_pagamento) on public.pedidos from anon, authenticated')
    expect(migration).not.toContain('set status =')
    const harness = readFileSync(harnessPath, 'utf8')
    expect(harness).toContain('MANUAL_PAYMENT_REASON_REQUIRED')
    expect(harness).toContain('MERCADO_PAGO_EXTERNAL_REFERENCE_CONFLICT')
  })

  it('delivers manual idempotency through a new forward-only migration', () => {
    const originalAuthority = readFileSync(migrationPath, 'utf8')
    const forwardMigration = readFileSync(forwardMigrationPath, 'utf8')

    expect(originalAuthority).not.toContain('p_idempotency_key uuid')
    expect(forwardMigration).toContain('add column if not exists idempotency_key uuid')
    expect(forwardMigration).toContain('MANUAL_PAYMENT_IDEMPOTENCY_KEY_REQUIRED')
    expect(forwardMigration).toContain('MANUAL_PAYMENT_IDEMPOTENCY_CONFLICT')
    expect(forwardMigration).toContain('drop function if exists public.registrar_status_pagamento(')
  })

  it('backfills each legacy manual event from its own immutable event id before validating the new constraint', () => {
    const forwardMigration = readFileSync(forwardMigrationPath, 'utf8')
    const legacyBackfill = forwardMigration.indexOf(
      'set idempotency_key = id\nwhere source = \'manual\' and idempotency_key is null;'
    )
    const constraint = forwardMigration.indexOf(
      'add constraint pedido_payment_events_check check'
    )

    expect(legacyBackfill).toBeGreaterThan(-1)
    expect(constraint).toBeGreaterThan(legacyBackfill)
    expect(forwardMigration).toContain(
      'Legacy manual events use their immutable event id as an auditable compatibility key.'
    )
  })

  it('ships a SQL upgrade regression harness that runs the forward migration against a legacy manual event', () => {
    const upgradeHarness = readFileSync(upgradeHarnessPath, 'utf8')

    expect(upgradeHarness).toContain(
      '\\ir ../migrations/20260820173000_manual_payment_idempotency_forward_fix.sql'
    )
    expect(upgradeHarness).toContain('second historical manual event')
    expect(upgradeHarness).toContain("'manual'")
    expect(upgradeHarness).toContain(
      'legacy manual event receives its immutable event id as the compatibility key'
    )
    expect(upgradeHarness).toContain(
      'upgraded constraint rejects a new manual event without an idempotency key'
    )
  })
})
