# Proposal: Audited Order Lifecycle and Sales Receipts

## Intent

Unify order operations, payments, revenue, and receipts under one auditable model. Closed and printable means only `status = entregue` **and** `status_pagamento = aprovado`; no `fechado` state is added.

## Scope

### In Scope
- Centralize order transitions in atomic database authorities, including pre-stock cancellation.
- Keep order/payment states independent; audit Mercado Pago and authorized manual approvals.
- Derive receipt eligibility and realized revenue from `entregue + aprovado`.
- Guide operators through valid next actions while separating both states.
- Issue one immutable, idempotent snapshot with order data and charged amount.
- Render two copies (`VIA CLIENTE`, `VIA ESTABELECIMENTO`) for 58/80 mm print and PDF fallback.

### Out of Scope
- New workflow states or an event-sourced workflow engine.
- ESC/POS, printer queues, hardware transport, or cut commands.
- Reusing inbound payment `comprovantes` for outbound receipts.

## Capabilities

### New Capabilities
- `order-lifecycle-authority`: Atomic transition matrix and continuation rules.
- `payment-approval-audit`: Approval provenance and append-only status evidence.
- `sales-receipt-issuance`: Eligibility, immutable snapshot, access, and output adapters.

### Modified Capabilities
- `pedidos_pagamento`: Approval updates payment truth and audit evidence without confirming the order.

## Approach

Deliver six phases: lifecycle authority; payment approval; eligibility/reporting; management experience; receipt issuance; output adapters. Strict TDD and `auto-chain` keep slices within 400 lines. Locking and idempotency protect races.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | Authorities, audits, snapshots, RLS |
| `apps/web/src/app/actions/pedidos.ts` | Modified | Authorized transitions and issuance |
| `apps/web/src/app/api/webhooks/mercadopago/route.ts` | Modified | Audited payment approval |
| `apps/web/src/components/operator/` | Modified | Lifecycle UI and print views |
| `tests/` | Modified | Strict-TDD lifecycle, audit, and receipt evidence |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Legacy invalid combinations | Medium | Classify before explicit backfill |
| Concurrent approval/delivery/issuance | High | Locking, constraints, idempotency |
| Receipt data disclosure | Medium | RLS, bounded logs, access tests |
| Printer/PDF variance | Medium | Shared snapshot fixtures and device acceptance |

## Rollback Plan

Disable new actions/renderers, restore prior readers, and reverse additive schema after exporting audit/snapshot records. Never rewrite provenance.

## Dependencies

- Stock lifecycle RPCs, Supabase RLS/Auth, Mercado Pago, and a deterministic PDF renderer.

## Success Criteria

- [ ] Invalid transitions and unaudited approvals fail atomically.
- [ ] Both approval sources preserve provenance while order status remains independent.
- [ ] Revenue and printing require exactly `entregue + aprovado`.
- [ ] Reprints produce two labelled copies from one unchanged snapshot with the charged amount.
- [ ] All slices pass Strict TDD and RDD with no warnings or errors.
