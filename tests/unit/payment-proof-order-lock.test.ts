import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260828230000_payment_proof_order_lock.sql',
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

  it('uses the authenticated client for the lock projection and fails closed without hiding orders', () => {
    expect(pedidos).toContain("await supabase.rpc('list_order_payment_proof_locks'")
    expect(pedidos).toContain("paymentReviewUnavailable: true")
    expect(pedidos).not.toContain("? await admin.rpc('list_order_payment_proof_locks'")
  })

  it('projects and renders a persistent review state instead of payment controls', () => {
    expect(pedidos).toContain('payment_review')
    expect(pedidos).toContain('list_order_payment_proof_locks')
    expect(dashboard).toContain('Comprovante recebido')
    expect(dashboard).toContain('payment_review?.locked')
  })

  it('applies payment-review locks to every chat payment surface and refreshes boundedly', () => {
    const chat = readFileSync('apps/web/src/components/chat/ChatContainer.tsx', 'utf8')

    expect(chat).toContain('payment_review?.locked')
    expect(chat.match(/payment_review\?\.locked/g)?.length).toBeGreaterThanOrEqual(4)
    expect(chat).toContain('setInterval(carregarPedidosCliente, 7500)')
    expect(dashboard).toContain('setInterval(carregarPedidos, 7500)')
    expect(dashboard).toContain('!pedido.payment_review?.paymentReviewUnavailable')
  })

  it('allows rejected orders to retry gateway payment but keeps canonical proof intake and reconciliation pending-only', () => {
    const retryMigration = readFileSync(
      'supabase/migrations/20260901220000_client_payment_retry_and_proof_lock.sql',
      'utf8',
    )

    expect(dashboard).toContain("pedido.status_pagamento === 'rejeitado'")
    expect(dashboard).toContain("pedido.status !== 'cancelado'")
    expect(retryMigration).toContain("status_pagamento not in ('pendente','rejeitado')")
    expect(migration).toContain("v_order.status_pagamento<>'pendente'")
    expect(migration).toContain("status_pagamento<>'pendente' or status='cancelado'")
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
