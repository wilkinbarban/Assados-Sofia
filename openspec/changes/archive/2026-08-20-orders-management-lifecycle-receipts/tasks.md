# Tasks: Audited Order Lifecycle and Sales Receipts

## Review Workload Forecast
Estimated authored lines: 1,100–1,500 across six slices; risk High. Chained PRs recommended: Yes. Suggested split: lifecycle DB → payment DB/app → eligibility → management UI → snapshot → print/PDF.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
Delivery strategy: auto-chain

### Suggested Work Units
| Unit | Goal / PR base | Focused test | Runtime harness | Rollback |
|---|---|---|---|---|
| 1 | Lifecycle DB; tracker | `supabase test lifecycle` | concurrent SQL race | migration/RPC |
| 2 | Payment audit; PR1 branch | `vitest payment/webhook` | signed MP fixture | RPC/webhook |
| 3 | Eligibility; PR2 branch | `vitest pedidos-management` | operator fixture | predicates/actions |
| 4 | Management UI; PR3 branch | `vitest operator && playwright orders` | keyboard journey | components |
| 5 | Snapshot; PR4 branch | `supabase test receipts && vitest receipts` | issue/reprint idempotency | snapshot schema/lib |
| 6 | Print/PDF; PR5 branch | `vitest receipts && playwright print` | 58/80 mm + PDF | routes/assets |

All units execute RED → GREEN → REFACTOR and an RDD gate with zero warnings/errors. Child PRs target the immediate parent; tracker remains draft.

## Phase 1: Lifecycle Authority (depends: specs/design)
- [x] 1.1 RED: `supabase/tests/order_lifecycle_authority.sql` covers matrix, stock races, idempotency, `novo→cancelado`, and legacy report.
- [x] 1.2 GREEN: migration creates lifecycle RPC/events, classification, grants/RLS; revoke direct writers after checks.
- [x] 1.3 REFACTOR: preserve stock uniqueness/exports; gate and record rollback (disable RPC/readers, retain exports).

## Phase 2: Independent Payment (depends: Phase 1)
- [x] 2.1 RED: payment/webhook tests cover source, actor/reason, duplicate refs, and unchanged order status.
- [x] 2.2 GREEN: implement payment RPC/events, action contracts in `apps/web/src/app/actions/pedidos.ts`, webhook adapter.
- [x] 2.3 REFACTOR: map errors/continuations, isolate calendar, gate; rollback adapter wiring.

## Phase 3: Eligibility and Revenue (depends: Phase 2)
- [x] 3.1 RED: management tests pin exact `entregue + aprovado` predicate and ineligible guidance.
- [x] 3.2 GREEN: expose authoritative projection/actions in `apps/web/src/app/atendimento/pedidos/page.tsx` and `pedidos.ts`.
- [x] 3.3 REFACTOR: add non-PII metrics; gate and rollback projection, retain legacy readers.

## Phase 4: Management UX (depends: Phase 3)
- [x] 4.1 RED: component/Playwright tests cover badges, valid actions, focus/labels, continuation.
- [x] 4.2 GREEN: update `OrdersManagementDashboard.tsx` and `OperatorClientOrdersList.tsx` with shared actions.
- [x] 4.3 REFACTOR: enforce zinc/amber rules and remove direct mutations; gate, rollback to legacy readers.

## Phase 5: Immutable Issuance (depends: Phase 4)
- [x] 5.1 RED: test canonical hash/amount, idempotency conflict, RLS/grants, reprint parity.
- [x] 5.2 GREEN: add snapshot RPC/schema and issuance contracts; output adapters remain Phase 6.
- [x] 5.3 REFACTOR: freeze metadata, deny update/delete, keep inbound `comprovantes` separate; gate, preserve snapshots.

## Phase 6: Print and PDF (depends: Phase 5)
- [x] 6.1 RED: test 58/80 mm, labels, model parity, deterministic PDF, privacy headers.
- [x] 6.2 GREEN: add CSS/fonts, pin PDF dependency, implement Node PDF route at `apps/web/src/app/api/receipts/[id]/pdf/route.ts`.
- [x] 6.3 REFACTOR: normalize ordering/fonts, headers, no PII logs; gate, disable outputs, preserve snapshots.
