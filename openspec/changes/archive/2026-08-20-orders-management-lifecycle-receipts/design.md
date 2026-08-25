# Design: Audited Order Lifecycle and Sales Receipts

## Technical Approach

PostgreSQL is the mutation authority; Next.js actions and the Mercado Pago handler are adapters. Six reversible phases cover lifecycle, payment audit, eligibility, dashboard, snapshots, and outputs. Every slice starts RED and passes RDD.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|---|---|---|
| Refactor the trusted owner-bound stock trigger behind a locked lifecycle RPC | Direct updates; parallel authority | Preserve invariants: `novo→confirmado` snapshots/decrements once, `confirmado→cancelado` restores once, `novo→cancelado` never restores, and delivery preserves stock. Migration composes status and stock in one transaction, retaining snapshot/movement uniqueness before revoking direct writers. |
| Intent-bound lifecycle idempotency | Retry-by-current-state | After locking the order, validate source state and intent. Unique `(pedido_id,idempotency_key)` events store intent/result: identical reuse returns the committed result; reuse for another target/reason rejects. Post-lock checks and stock uniqueness prevent duplicate effects. |
| Append lifecycle and payment events | Mutable provenance columns | Payment source is exactly `mercado_pago|manual`; manual requires actor and reason, Mercado Pago requires a globally unique external reference and represents the actor as `NULL` with service-role origin. Each event stores previous/new value, correlation, and timestamp. |
| Classify legacy rows, never silently rewrite them | Automatic normalization | A report labels combinations `coherent`, `legacy_payment_coupled`, `legacy_stock_inconsistent`, or `needs_review`; backfills require recorded authority. |
| Exact SQL predicate `status = 'entregue' AND status_pagamento = 'aprovado'` | “Not cancelled”; derived `fechado` state | One predicate drives realized revenue, eligibility, issuance, and UI. |
| One immutable `comprovantes_venda` JSONB snapshot | Re-query mutable order/product data; inbound `comprovantes` | Canonical bytes freeze order, customer, line items, totals, authoritative charged amount and its source, delivery, payment, establishment, and issuance metadata, then receive a SHA-256 hash. Unique `(pedido_id, snapshot_version)` and idempotency key return identical bytes or reject conflict. Reprints/renders read only stored canonical bytes, never mutable domain rows; no update/delete grants. |
| Pure snapshot-to-view-model feeding separate DOM/PDF trees | Duplicated mapping; Chromium | Both adapters consume identical labelled-copy models with parity assertions. Browser CSS is primary. Pin the absent `@react-pdf/renderer` and fonts; a Node Route Handler normalizes metadata, ordering, and fonts. Next.js 16.3 documents Node runtime and externalizes this package. |

## Data Flow

```text
Dashboard action ─┐
MP webhook ───────┼→ RPC → locked order → event audit
                  └──────────────────────→ current order
entregue + aprovado → issuance RPC → canonical snapshot/hash
snapshot → shared view-model → 58/80 mm DOM print | Node PDF response
```

## Interfaces and Boundaries

- RPCs: `transicionar_pedido(uuid,status,uuid,reason)`, `registrar_status_pagamento(uuid,status,source,external_ref,uuid,reason)`, `emitir_comprovante_venda(uuid,uuid)`. Database constraints enforce intent-key and event uniqueness.
- Actions validate operator session and intent, call RPCs, map stable error/continuation codes, then revalidate. They never accept actor IDs.
- Webhook retains signature/admission checks, resolves Mercado Pago truth, then invokes the service-role payment RPC; calendar work occurs only after a committed result.
- PDF route authenticates an active operator, reads through an RLS-safe RPC, uses Node.js, returns `application/pdf` with `private, no-store`, and logs no PII.
- RLS: event/snapshot tables deny direct writes; active operators may read necessary order evidence, customer owners may read only their own issued receipt, and service role executes narrowly granted functions.
- Dashboard uses zinc surfaces/text, amber only for primary actions/attention, distinct state badges, valid-next-action controls, and an eligibility explanation.
- `OrdersManagementDashboard` and `OperatorClientOrdersList` consume the same authoritative continuation/action model, eliminating invalid transitions and manual approval without a reason.

## File Changes

| Path | Action |
|---|---|
| `supabase/migrations/*_order_lifecycle_payment_receipts.sql` | Create authorities, events, classification, snapshot/hash, grants, RLS |
| `apps/web/src/app/actions/pedidos.ts` | Replace direct writes; add issuance/read contracts |
| `apps/web/src/app/api/webhooks/mercadopago/route.ts` | Call audited payment authority |
| `apps/web/src/app/atendimento/pedidos/page.tsx` | Load authoritative dashboard projection |
| `apps/web/src/components/operator/OrdersManagementDashboard.tsx` | Split-state zinc/amber management UX |
| `apps/web/src/components/operator/OperatorClientOrdersList.tsx` | Reuse authoritative actions/continuations |
| `apps/web/src/components/receipts/SalesReceipt.tsx`, `apps/web/src/lib/receipts/*` | Shared model, two copies, 58/80 CSS, PDF adapter |
| `apps/web/src/app/api/receipts/[id]/pdf/route.ts` | Authorized deterministic PDF |
| `apps/web/package.json`, `package-lock.json` | Pin PDF dependency and lock graph |
| `apps/web/src/assets/fonts/*` | Add pinned receipt fonts |
| `tests/unit/*`, `tests/e2e/*`, `supabase/tests/*` | RED-first contract, RLS, race, print/PDF evidence |

## Testing and Observability

Unit tests pin matrices, continuations, canonicalization/hash, copy parity, widths, labels, colors, and deterministic PDFs. Database tests race approval, delivery, cancellation, and issuance; prove append-only grants and RLS denial. Playwright verifies keyboard actions and 58/80 mm markup. Logs expose correlation, source, transition, result, latency, snapshot version, and truncated hash; metrics count rejections, conflicts, issuance, and PDF failures.

## Migration, Rollback, and Delivery

Expand schema; classify/export legacy counts; switch writers/readers; then remove direct writes. Rollback disables UI/routes and restores readers while preserving audits/snapshots. Split phases as needed so every PR remains below 400 authored lines. ESC/POS remains deferred.

## Threat Matrix

N/A — no shell, subprocess, VCS automation, executable classification, or new process-integration boundary; HTTP action/webhook/PDF boundaries are covered by authentication, RLS, idempotency, and privacy tests above.

## Open Questions

None.
