import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260820143000_order_lifecycle_authority.sql',
), 'utf8')
const harness = readFileSync(join(process.cwd(), 'supabase/tests/order_lifecycle_authority.sql'), 'utf8')

describe('order lifecycle authority migration', () => {
  it('provides a locked, intent-idempotent lifecycle authority without coupling payment state', () => {
    expect(migration).toContain('create table if not exists public.pedido_lifecycle_events')
    expect(migration).toContain('create or replace function public.transicionar_pedido')
    expect(migration).toContain('for update')
    expect(migration).toContain('IDEMPOTENCY_CONFLICT')
    expect(migration).toContain("p_novo_status = 'confirmado'::public.status_pedido")
    expect(migration).toContain("p_novo_status = 'cancelado'::public.status_pedido")
    expect(migration).not.toMatch(/update\s+public\.pedidos\s+set[\s\S]{0,180}status_pagamento/i)
  })

  it('retains stock authority, blocks direct lifecycle writers, and exposes legacy classification', () => {
    expect(migration).toContain('public.confirmar_pedido_estoque')
    expect(migration).toContain('public.cancelar_pedido_estoque')
    expect(migration).toContain('create or replace view public.relatorio_classificacao_legado_pedidos')
    expect(migration).toMatch(/when\s+p\.status = 'entregue'::public\.status_pedido\s+and p\.status_pagamento <> 'aprovado'/)
    expect(migration).toContain("'needs_review'")
    expect(migration).toContain('revoke insert, update, delete on public.pedido_lifecycle_events from public, anon, authenticated')
    expect(migration).toContain('enforce_order_lifecycle_status_write_boundary')
  })

  it('ships an executable database harness for function, grant, RLS, and classification boundaries', () => {
    expect(harness).toContain("perform * from public.transicionar_pedido")
    expect(harness).toContain("relatorio_classificacao_legado_pedidos")
    expect(harness).toContain("set role service_role")
    expect(harness).toContain('set role postgres;')
    expect(harness).toContain("TRANSICAO_PEDIDO_INVALIDA")
    expect(harness).toContain("novo cancellation left stock untouched")
    expect(harness).toContain("legacy delivered/pending fixture was not classified")
    expect(harness).toContain("dblink_send_query('delivery_terminal'")
    expect(harness).toContain(`set request.jwt.claim = '{"role":"service_role"}'`)
    expect(harness).toContain("concurrent terminal transitions committed")
    expect(harness).toContain("dblink_connect('delivery_terminal', :'runtime_dblink_conninfo')")
    expect(harness).toContain('authenticated loopback connection')
    expect(harness).toContain('reset role;')
  })
})
