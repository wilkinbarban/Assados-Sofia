import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const webhookRoute = readFileSync(join(process.cwd(), 'apps/web/src/app/api/webhooks/mercadopago/route.ts'), 'utf8')
const webhookMigration = readFileSync(join(process.cwd(), 'supabase/migrations/20260824150000_mercado_pago_webhook_delivery_recovery.sql'), 'utf8')
const lifecycleMigration = readFileSync(join(process.cwd(), 'supabase/migrations/20260824151000_revoke_legacy_order_stock_wrappers.sql'), 'utf8')
const actions = readFileSync(join(process.cwd(), 'apps/web/src/app/actions/pedidos.ts'), 'utf8')
const lifecycleHarness = readFileSync(join(process.cwd(), 'supabase/tests/order_lifecycle_authority.sql'), 'utf8')

describe('JD2 round 1 regressions', () => {
  it('persists a recoverable Mercado Pago delivery and claims it before processing', () => {
    expect(webhookMigration).toContain('delivery_status')
    expect(webhookMigration).toContain('claimed_until')
    expect(webhookMigration).toContain('create or replace function public.reivindicar_webhook_mercado_pago')
    expect(webhookMigration).toContain('for update')
    expect(webhookMigration).toContain('attempt_count')
    expect(webhookMigration).toContain('create or replace function public.concluir_webhook_mercado_pago')
    expect(webhookMigration).toContain('create or replace function public.falhar_webhook_mercado_pago')
    expect(webhookRoute).toContain("rpc('reivindicar_webhook_mercado_pago'")
    expect(webhookRoute).toContain("rpc('concluir_webhook_mercado_pago'")
    expect(webhookRoute).toContain("rpc('falhar_webhook_mercado_pago'")
    expect(webhookRoute).toContain('await processarPagamentoBackground')
    expect(webhookRoute).toContain('payment_processing_retryable')
    expect(webhookRoute).toContain("claimedDelivery.delivery_status === 'completed'")
    expect(webhookRoute).toContain("status: 503")
    expect(webhookRoute).toContain('return completeDelivery()')
  })

  it('removes application access to unaudited stock wrappers and uses canonical lifecycle transitions', () => {
    expect(lifecycleMigration).toContain('service_role')
    expect(actions).not.toContain("rpc('confirmar_pedido_estoque'")
    expect(actions).not.toContain("rpc('cancelar_pedido_estoque'")
    expect(actions).toContain("rpc('transicionar_pedido'")
    expect(lifecycleHarness).toContain('legacy stock wrappers deny authenticated execution')
    expect(lifecycleHarness).toContain('canonical confirm/cancel remain atomic, idempotent, and audited')
  })

  it('declares an authenticated autonomous recovery consumer with bounded retries and dead-letter state', () => {
    const recoveryRoute = readFileSync(join(process.cwd(), 'apps/web/src/app/api/internal/mercadopago/recover/route.ts'), 'utf8')

    expect(webhookMigration).toContain('dead_letter')
    expect(webhookMigration).toContain('next_attempt_at')
    expect(webhookMigration).toContain('reivindicar_proximo_webhook_mercado_pago')
    expect(webhookMigration).toContain('for update skip locked')
    expect(recoveryRoute).toContain('MERCADO_PAGO_RECOVERY_SECRET')
    expect(recoveryRoute).toContain("rpc('reivindicar_proximo_webhook_mercado_pago'")
    expect(recoveryRoute).toContain('processarPagamentoBackground')
  })
})
