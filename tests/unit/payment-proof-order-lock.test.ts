import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260828230000_payment_proof_order_lock.sql',
  'utf8',
)
const leases = readFileSync(
  'supabase/migrations/20260828340000_payment_proof_operator_leases.sql',
  'utf8',
)
const pedidos = readFileSync('apps/web/src/app/actions/pedidos.ts', 'utf8')
const intake = readFileSync('apps/web/src/lib/payment-proofs/canonical-intake.ts', 'utf8')
const dashboard = readFileSync(
  'apps/web/src/components/cliente/ClienteOrdersDashboard.tsx',
  'utf8',
)

describe('payment-proof-driven order lock', () => {
  it('creates an early intent and derives the lock from active proof lifecycle', () => {
    expect(migration).toContain('payment_proof_order_intents')
    expect(migration).toContain('is_order_payment_proof_locked')
    expect(migration).toContain('ORDER_PAYMENT_PROOF_ALREADY_PENDING')
    expect(migration).toContain("status in ('received','identity_pending','processing','review','admitted')")
  })

  it('attaches the requested web order inside canonical intake', () => {
    expect(intake).toContain('orderId?: string | null')
    expect(intake).toContain('p_order_id: input.orderId ?? null')
    expect(pedidos).toContain('orderId: pedidoId')
  })

  it('guards every competing server-side payment entrypoint', () => {
    expect(pedidos.match(/assert_order_payment_available/g)?.length).toBeGreaterThanOrEqual(3)
    expect(migration).toContain('approve_manual_external_payment')
    expect(pedidos).toContain('ORDER_PAYMENT_PROOF_ALREADY_PENDING')
  })

  it('projects and renders a persistent review state instead of payment controls', () => {
    expect(pedidos).toContain('payment_review')
    expect(pedidos).toContain('list_order_payment_proof_locks')
    expect(dashboard).toContain('Comprovante recebido')
    expect(dashboard).toContain('payment_review?.locked')
  })

  it('serializes operator capability before proof leases and proof/order mutations', () => {
    expect(leases).toContain('require_active_payment_proof_actor_role()')
    expect(leases).toMatch(/from public\.perfis p[\s\S]*for update/)
    expect(leases.indexOf('require_active_payment_proof_actor_role();')).toBeLessThan(
      leases.indexOf('assert_payment_proof_lease(p_proof_id,p_lease_token)'),
    )
    expect(leases).toContain('from public.payment_proofs where id=p_proof_id for update')
  })

  it('keeps order-intent RESTRICT semantics while total purge removes intents first', () => {
    const purge = readFileSync(
      'supabase/migrations/20260828330000_total_purge_payment_proof_dependents.sql',
      'utf8',
    )

    expect(migration).toContain('references public.payment_proofs(id) on delete restrict')
    expect(purge.match(/delete from public\.payment_proof_order_intents/g)?.length).toBe(2)
    expect(purge.indexOf('delete from public.payment_proof_order_intents')).toBeLessThan(
      purge.indexOf('delete from public.payment_proofs'),
    )
  })
})
