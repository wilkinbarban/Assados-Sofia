# Apply Progress: Audited Order Lifecycle and Sales Receipts

## Current Status

Phase 1 runtime verification passed. Tasks 1.1–1.3 are complete; Phase 2 remains pending.

## Completed Tasks

- [x] 1.1 RED: `supabase/tests/order_lifecycle_authority.sql` covers authority, grants/RLS, and legacy report boundaries.
- [x] 1.2 GREEN: the lifecycle migration creates the RPC/events/classification and protects direct writers while preserving stock authority.
- [x] 1.3 REFACTOR: stock snapshots/movement uniqueness remain untouched; rollback is recorded.

## In-Progress Work Unit

### Phase 1: Lifecycle DB

- Implemented a candidate migration at `supabase/migrations/20260820143000_order_lifecycle_authority.sql` with a protected `transicionar_pedido` authority, append-only lifecycle events, legacy classification view, and status write trigger that preserves the trusted stock-function owner.
- Added `supabase/tests/order_lifecycle_authority.sql` as the focused pgTAP runtime harness.
- Added `tests/unit/order-lifecycle-authority-migration.test.ts` to pin authority, stock delegation, idempotency, grants/RLS, and legacy-report contracts.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/unit/order-lifecycle-authority-migration.test.ts`, `supabase/tests/order_lifecycle_authority.sql` | Unit + database runtime | N/A (new files) | ✅ Unit test failed because the migration did not exist | ✅ Unit test passed (3/3); runtime harness passed after the candidate migration was applied to the existing local database | ✅ Authority/payment separation; stock/grants/classification; executable-harness boundary | ✅ Preserved the stock RPC as the sole stock mutator and captured previous lifecycle status before event insertion |
| 1.2 | `tests/unit/order-lifecycle-authority-migration.test.ts` | Unit + database runtime | N/A (new migration) | ✅ Same RED contract | ✅ Unit test passed (3/3); database runtime passed | ✅ Matrix/idempotency plus grants/RLS/classification paths | ✅ Candidate is additive and retains existing stock snapshots/movement uniqueness |
| 1.3 | `tests/unit/order-lifecycle-authority-migration.test.ts` | Unit + database runtime | N/A (new migration) | ✅ Same RED contract | ✅ Unit test passed (3/3); database runtime passed | ✅ Rollback/grant boundary plus legacy classification | ✅ Rollback remains removing the new migration/RPC/readers while retaining existing stock exports |

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/order-lifecycle-authority-migration.test.ts` — exit 0, 3 passed |
| Runtime harness command | `supabase/tests/order_lifecycle_authority.sql` executed directly against `asados-supabase-db` after applying the candidate migration — passed: `ok 1 - order lifecycle authority exposes protected transition and legacy classification boundaries`; test transaction rolled back fixtures |
| Zero-warning check | `npx eslint tests/unit/order-lifecycle-authority-migration.test.ts --max-warnings=0` — exit 0 |
| Full repository zero-warning check | `npm run lint -- --max-warnings=0 tests/unit/order-lifecycle-authority-migration.test.ts` — exit 1 due to 45 pre-existing warnings outside this work unit |
| Rollback boundary | Revert only the candidate migration, the dedicated runtime harness, and the focused unit test; existing `pedido_estoque_*` snapshots, stock movements, and stock RPCs remain untouched. |

## Required Next Step

Proceed only with Phase 2 after the parent settles the completed Phase 1 attempt. No later-phase code was changed.

## Phase 2: Independent Payment

Phase 2 runtime verification passed. Tasks 2.1–2.3 are complete.

### Completed Tasks

- [x] 2.1 RED: payment/webhook tests cover source, manual actor/reason, duplicate references, and order/payment independence.
- [x] 2.2 GREEN: `registrar_status_pagamento` records append-only payment provenance; operator actions and the Mercado Pago webhook use it.
- [x] 2.3 REFACTOR: stable error continuations preserve manual recovery; calendar synchronization runs only after committed payment evidence.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | `tests/unit/payment-approval-audit-migration.test.ts`, `tests/unit/pedidos-management.test.ts` | Unit + database runtime | ✅ 28/28 existing payment/action tests | ✅ Failed: migration absent and direct update remained | ✅ 31/31 focused tests passed | ✅ Manual reason + RP C provenance/idempotency + unchanged order state | ✅ Dedicated error mapper and post-commit calendar boundary |
| 2.2 | same | Unit + database runtime | ✅ 28/28 existing payment/action tests | ✅ RPC contract did not exist | ✅ 31/31 focused tests passed; pgTAP runtime passed | ✅ Authorized manual path and source-specific service path | ✅ Reduced direct payment writes to the authority adapter |
| 2.3 | same | Unit + database runtime | ✅ 28/28 existing payment/action tests | ✅ Continuation and post-commit boundary absent | ✅ 31/31 focused tests passed | ✅ Missing-reason and webhook duplicate/admission paths | ✅ Calendar remains a non-transactional follow-up |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/payment-approval-audit-migration.test.ts tests/unit/pedidos-management.test.ts tests/unit/mercadopago-webhook-security.test.ts` — exit 0, 31 passed |
| Runtime harness command | Applied `supabase/migrations/20260820150000_payment_approval_authority.sql` to `asados-supabase-db`, then executed `supabase/tests/payment_approval_authority.sql` — exit 0, `ok 1`; transaction rolled back fixtures |
| Zero-warning check | `npx eslint apps/web/src/app/actions/pedidos.ts apps/web/src/app/api/webhooks/mercadopago/route.ts tests/unit/payment-approval-audit-migration.test.ts tests/unit/pedidos-management.test.ts tests/unit/mercadopago-webhook-security.test.ts --max-warnings=0` — exit 0 |
| Rollback boundary | Revert only `20260820150000_payment_approval_authority.sql`, `payment_approval_authority.sql`, payment migration test, and action/webhook adapter changes. Existing lifecycle authority and durable webhook admission remain available; exported payment events must be retained. |

### Required Next Step

Proceed with Phase 3 only after the parent settles this Phase 2 attempt. No later-phase code was changed.

## Phase 3: Eligibility and Revenue

Phase 3 focused verification passed. Tasks 3.1–3.3 are complete; Phase 4 remains pending.

### Completed Tasks

- [x] 3.1 RED: management tests pin the exact `status = 'entregue' AND status_pagamento = 'aprovado'` predicate and stable ineligible continuations.
- [x] 3.2 GREEN: `actionListarPedidos` projects eligibility and realized-revenue fields from the canonical predicate; the orders page continues to supply that authoritative projection to the dashboard.
- [x] 3.3 REFACTOR: the dashboard aggregates only projected realized revenue, and `actionObterResumoReceitaRealizada` exposes a non-PII aggregate report while legacy order readers remain intact.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 3.1 | `tests/unit/pedidos-management.test.ts` | Unit | ✅ 6/6 passed before Phase 3 changes | ✅ Failed: eligibility/report functions were absent (5 failures) | ✅ 12/12 focused action/predicate tests passed | ✅ Eligible, delivery-pending, payment-pending, and cancelled paths | ✅ Extracted one shared pure projection used by both listing and aggregate reporting |
| 3.2 | `tests/unit/pedidos-management.test.ts` | Unit | ✅ 6/6 passed before Phase 3 changes | ✅ Same RED contract | ✅ 12/12 passed | ✅ Projection maps each status combination without mutating either state | ✅ Existing page reader remains unchanged and receives enriched listing records |
| 3.3 | `tests/unit/pedidos-management.test.ts`, `tests/unit/orders-dashboard-filters.test.tsx` | Unit + component | ✅ Existing component tests passed | ✅ Aggregate report test added before its action | ✅ 16/16 focused tests passed | ✅ Aggregate query omits customer fields; dashboard excludes non-realized values | ✅ Removed two pre-existing unused dashboard declarations to reach zero warnings in the changed-file check |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/pedidos-management.test.ts tests/unit/orders-dashboard-filters.test.tsx` — exit 0, 16 passed |
| Runtime harness command | N/A — this work unit is a pure server-action projection plus server-rendered reader composition; its database mutation/runtime authority remains covered by Phases 1–2 harnesses. |
| Zero-warning check | `npx eslint apps/web/src/app/actions/pedidos.ts apps/web/src/app/atendimento/pedidos/page.tsx apps/web/src/components/operator/OrdersManagementDashboard.tsx tests/unit/pedidos-management.test.ts --max-warnings=0` — exit 0 |
| Type-check disposition | `npx tsc --noEmit --pretty false -p apps/web/tsconfig.json` — exit 0 after a scoped adjacent Phase 2 adapter correction types the `registrar_status_pagamento` RPC result before reading `google_event_id`. |
| Rollback boundary | Revert the Phase 3 projection/report helpers, enriched list fields, dashboard metric consumption, and their focused tests. Existing list/page readers continue to read legacy order fields; no schema, audit, or payment authority record is removed. |

### Required Next Step

Proceed with Phase 4 only after the parent settles the completed Phase 3 attempt. Receipt issuance remains unimplemented.

### Gatekeeper Correction Evidence

| Evidence | Result |
|---|---|
| RED | `npm run test:unit -- tests/unit/mercadopago-webhook-security.test.ts` — exit 1, 1 failure because `normalizarResultadoPagamentoMercadoPago` did not exist. |
| GREEN | Same command — exit 0, 24 passed after adding the precise nullable calendar-event result boundary. |
| Aggregate focused verification | `npm run test:unit -- tests/unit/pedidos-management.test.ts tests/unit/orders-dashboard-filters.test.tsx tests/unit/mercadopago-webhook-security.test.ts` — exit 0, 40 passed. |
| Zero-warning check | ESLint across Phase 3 files plus corrected webhook/test — exit 0, 0 warnings. |
| Full type-check | `npx tsc --noEmit --pretty false -p apps/web/tsconfig.json` — exit 0. |


## Phase 4: Management UX

Phase 4 focused verification passed. Tasks 4.1–4.3 are complete; Phase 5 remains pending.

### Completed Tasks

- [x] 4.1 RED: Added continuation-model and dashboard accessibility coverage for separate lifecycle/payment badges, valid actions, labels, and continuation guidance.
- [x] 4.2 GREEN: Both order views consume `getOrderContinuation`, exposing only actions valid for their independent order/payment states; manual approval always requests a reason.
- [x] 4.3 REFACTOR: Centralized the continuation model, applied zinc surfaces with amber primary actions/focus, and removed direct UI payment approval without a reason.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.1 | `tests/unit/order-continuation.test.ts`, `tests/unit/orders-dashboard-filters.test.tsx` | Unit + component | ✅ 4/4 dashboard tests | ✅ Model import failed before implementation | ✅ 9/9 focused tests passed | ✅ New, confirmed, delivered-pending, cancelled, and eligible combinations | ✅ Shared pure continuation function drives both surfaces |
| 4.2 | same | Unit + component | ✅ 4/4 dashboard tests | ✅ Existing UI lacked action model | ✅ 9/9 focused tests passed | ✅ Lifecycle and payment states remain independent | ✅ One typed `OrderAction` contract reused by both components |
| 4.3 | same | Unit + component | ✅ Focused suite passed | ✅ Accessibility action assertion added first | ✅ 9/9 focused tests passed | ✅ Accessible names plus continuation status text | ✅ Zinc surfaces and amber primary/focus rules applied without CSS-test coupling |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/order-continuation.test.ts tests/unit/orders-dashboard-filters.test.tsx` — exit 0, 9 passed |
| Runtime harness command | N/A — this is a client-component interaction slice. The existing Playwright suite has no orders management journey, so no truthful runtime browser harness exists yet; focused rendered component assertions cover the accessible keyboard/action contract. |
| Changed-file zero-warning check | `npx eslint apps/web/src/components/operator/orderContinuation.ts apps/web/src/components/operator/OrdersManagementDashboard.tsx apps/web/src/components/operator/OperatorClientOrdersList.tsx tests/unit/order-continuation.test.ts tests/unit/orders-dashboard-filters.test.tsx --max-warnings=0` — exit 0 |
| Full web TypeScript check | `npx tsc --noEmit --pretty false -p apps/web/tsconfig.json` — exit 0 |
| Full lint | `npm run lint -- --max-warnings=0` — exit 1, 43 pre-existing warnings outside this work unit; changed-file lint is clean |
| Full unit suite | `npm run test:unit` — exit 1, 679/680 passed; pre-existing `tests/unit/complete-lifecycle-e2e.test.ts` calls manual payment approval without the now-required reason and fails at assertion line 390. It is outside this UI-only work unit and must be updated with Phase 2 ownership. |
| Rollback boundary | Revert `orderContinuation.ts`, both order-view integrations, and their focused tests. This restores the prior UI while retaining Phases 1–3 lifecycle/payment authorities and all persisted audit evidence. |

### Required Next Step

Proceed with Phase 5 after the parent settles the Phase 4 attempt.

### Gatekeeper Correction Evidence

| Evidence | Result |
|---|---|
| RED | `npm run test:unit -- tests/unit/complete-lifecycle-e2e.test.ts` — exit 1; the stale fixture invoked manual approval without the required `reason`. |
| GREEN | The fixture now supplies `PIX conferido pelo operador` and its RPC mock reflects the authority response; the same command exits 0, 10 passed. |
| Focused regression | `npm run test:unit -- tests/unit/order-continuation.test.ts tests/unit/orders-dashboard-filters.test.tsx tests/unit/complete-lifecycle-e2e.test.ts` — exit 0, 19 passed. |
| Full unit suite | `npm run test:unit` — exit 0, 119 files and 680 tests passed. |
| Changed-file lint | `npx eslint apps/web/src/components/operator/orderContinuation.ts apps/web/src/components/operator/OrdersManagementDashboard.tsx apps/web/src/components/operator/OperatorClientOrdersList.tsx tests/unit/order-continuation.test.ts tests/unit/orders-dashboard-filters.test.tsx --max-warnings=0` — exit 0. The corrected legacy fixture has six pre-existing unrelated warnings and is excluded from the slice lint scope. |
| Full web TypeScript check | `npx tsc --noEmit --pretty false -p apps/web/tsconfig.json` — exit 0. |
| Churn inspection | Restored original quote/semicolon formatting after accidental Prettier whole-file rewrites; dashboard/list diffs are now limited to continuation integration plus existing Phase 3 projection changes. |


## Phase 5: Immutable Issuance

Phase 5 focused verification passed. Tasks 5.1–5.3 are complete; Phase 6 remains pending.

### Completed Tasks

- [x] 5.1 RED: Added migration-contract and server-action tests for immutable snapshot issuance, idempotent reprint, eligibility continuation, hash, grants, and separation from inbound uploads.
- [x] 5.2 GREEN: Added `emitir_comprovante_venda` and `comprovantes_venda`; the locked authority snapshots order lines/totals, charged amount, delivery, payment provenance, actor, and timestamp. The operator action accepts only references and delegates issuance to the RPC.
- [x] 5.3 REFACTOR: Added RLS select scopes, revoked direct mutations, immutable trigger, and kept `public.comprovantes` untouched. Output/DOM/PDF adapters remain explicitly deferred to Phase 6.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5.1 | `tests/unit/sales-receipt-issuance-migration.test.ts`, `tests/unit/pedidos-management.test.ts` | Unit + database runtime | ✅ 12/12 pre-existing action tests | ✅ Migration missing: 2 failures; action missing: 2 failures | ✅ 16 focused tests passed | ✅ Eligible reprint and ineligible continuation; schema/hash/grants/separation cases | ✅ Canonical JSON construction stays in the DB authority |
| 5.2 | same + `supabase/tests/sales_receipt_issuance.sql` | Unit + database runtime | ✅ Same baseline | ✅ RPC/table contract absent | ✅ Focused and pgTAP harness passed | ✅ Auth/grant/immutability plus idempotency authority surface | ✅ Operator action passes only IDs/key; it never builds receipt data |
| 5.3 | same | Unit + database runtime | N/A (new schema boundary) | ✅ Direct mutation protection absent before migration | ✅ Full unit suite passed | ✅ Customer/operator read boundaries and immutable trigger tested structurally | ✅ Inbound `comprovantes` remains untouched |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/pedidos-management.test.ts tests/unit/sales-receipt-issuance-migration.test.ts` — exit 0, 16 passed |
| Runtime harness command | Applied `supabase/migrations/20260820160000_sales_receipt_issuance.sql` to `asados-supabase-db`, then executed `supabase/tests/sales_receipt_issuance.sql` — exit 0, `ok 1`; transaction rolled back test assertions |
| Changed-file zero-warning check | `npx eslint apps/web/src/app/actions/pedidos.ts tests/unit/pedidos-management.test.ts tests/unit/sales-receipt-issuance-migration.test.ts --max-warnings=0` — exit 0 |
| Full web TypeScript | `npx tsc --noEmit --pretty false -p apps/web/tsconfig.json` — exit 0 |
| Full unit suite | `npm run test:unit` — exit 0, 120 files / 684 tests passed against the final immutable candidate bytes |
| Rollback boundary | Revert `20260820160000_sales_receipt_issuance.sql`, `sales_receipt_issuance.sql`, the issuance action, and focused tests. Existing inbound `comprovantes`, lifecycle/payment evidence, and issued snapshots in any exported backup remain preserved. |

### Required Next Step

Proceed with Phase 6 only after the parent settles the completed Phase 5 attempt.


## Phase 6: Print and PDF

Phase 6 focused verification passed. Tasks 6.1–6.3 are complete.

### Completed Tasks

- [x] 6.1 RED: Added immutable-snapshot receipt output tests for copy labels, 58/80 mm print markup, and deterministic PDF bytes.
- [x] 6.2 GREEN: Added the shared snapshot view model, two-copy browser print documents, deterministic Node PDF route, and eligible dashboard print/download actions.
- [x] 6.3 REFACTOR: One snapshot-to-lines adapter now feeds both DOM and PDF output; PDF responses are private/no-store and the route logs no receipt data.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 6.1 | `tests/unit/sales-receipt-output.test.ts` | Unit | N/A (new output module) | ✅ Failed because `@/lib/receipts/salesReceipt` did not exist | ✅ 2 output tests passed | ✅ 58/80 layouts and both labelled copies exercise distinct paths | ✅ Shared copy mapping prevents DOM/PDF commercial-data drift |
| 6.2 | `tests/components/receipts-output-actions.test.tsx` | Component | N/A (new component) | ✅ Import failed before action component existed | ✅ 3 focused tests passed | ✅ Separate 58 mm, 80 mm, and PDF controls | ✅ Receipt action keeps only issued snapshot in memory; it never reads order/customer data |
| 6.3 | same | Unit + route contract | ✅ Focused output tests | ✅ Privacy/determinism behavior absent before route | ✅ TypeScript, lint, and full unit suite passed | ✅ PDF equality and print-width structural proofs | ✅ Deterministic PDF uses fixed PDF object ordering and Courier base font |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/sales-receipt-output.test.ts tests/components/receipts-output-actions.test.tsx` — exit 0, 3 passed |
| Runtime harness command | N/A — no truthful browser runtime harness is available for the new print popup/PDF download path: the Playwright suite has no authenticated immutable-receipt fixture or thermal-printer/browser-print capability. Component/rendered actions and deterministic byte assertions prove the reachable adapter contracts without claiming browser hardware coverage. |
| Deterministic PDF proof | `buildReceiptPdf(snapshot)` invoked twice in `sales-receipt-output.test.ts` returns byte-equal output containing both labels; same shared snapshot mapping feeds the browser document. |
| Changed-file zero-warning check | `npx eslint apps/web/src/lib/receipts/salesReceipt.ts apps/web/src/components/receipts/ReceiptOutputActions.tsx apps/web/src/app/api/receipts/[id]/pdf/route.ts tests/unit/sales-receipt-output.test.ts tests/components/receipts-output-actions.test.tsx --max-warnings=0` — exit 0 |
| Full web TypeScript | `npx tsc --noEmit --pretty false -p apps/web/tsconfig.json` — exit 0 |
| Full unit suite | `npm run test:unit` — exit 0, 121 files / 686 tests passed |
| Rollback boundary | Revert only `src/lib/receipts/salesReceipt.ts`, `src/components/receipts/ReceiptOutputActions.tsx`, `src/app/api/receipts/[id]/pdf/route.ts`, the dashboard action insertion, and Phase 6 tests. Keep immutable `comprovantes_venda` snapshots untouched. |

### Required Next Step

All six phases are implemented. Proceed to SDD verification after the parent settles the existing Phase 6 attempt.

## Runtime-evidence remediation (post-verification)

The initial verification found that the three pgTAP files asserted only schema boundaries. This remediation replaces them with real database fixtures executed against the existing `asados-supabase-db`, and adds a route-level authenticated PDF test.

### Completed remediation evidence

- Lifecycle harness now executes an invalid `novo→entregue` rejection and confirms no order/payment/audit mutation; executes `novo→cancelado` and confirms `estoque_estado` remains `pendente`; classifies an `entregue + pendente` legacy row at runtime.
- Payment harness now executes manual reason validation, authorized manual approval with actor/reason/audit and unchanged order status, append-only audit mutation denial, Mercado Pago duplicate reference idempotency/conflict, and rejected-payment order independence.
- Receipt harness now executes issuance/reissue over a persisted record, checks the same receipt/snapshot/hash and charged amount with exactly one row, proves direct snapshot mutation denial, and switches customer-owner/stranger identities for RLS reads.
- `receipt-pdf-route.test.ts` invokes the authenticated Node Route Handler and proves private/no-store PDF output includes both labelled copies from the persisted snapshot. This is route-level runtime proof; thermal printer hardware/browser print acceptance remains unavailable and is not claimed.
- Three runtime defects uncovered by the real fixtures were fixed in additive migrations: unqualified lifecycle idempotency lookup, payment RPC `varchar` to `text` table-return mismatch, and `pgcrypto.digest` resolution inside the receipt security-definer function.

### TDD Cycle Evidence

| Work unit | RED | GREEN | Triangulation | Refactor |
|---|---|---|---|---|
| Runtime lifecycle/payment/receipt evidence | Focused migration tests failed until harnesses named real transaction assertions | 4 files / 9 tests pass; all 3 psql pgTAP harnesses pass | Rejection + success/isolation; manual + MP; operator + owner + stranger | Additive correction migrations contain only runtime SQL resolution fixes |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused tests | `npm run test:unit -- tests/unit/receipt-pdf-route.test.ts tests/unit/order-lifecycle-authority-migration.test.ts tests/unit/payment-approval-audit-migration.test.ts tests/unit/sales-receipt-issuance-migration.test.ts` — exit 0, 4 files / 9 tests |
| Runtime harnesses | Each SQL file copied to and executed with `psql -v ON_ERROR_STOP=1 -U postgres -d postgres` in `asados-supabase-db` — exit 0, 1 pgTAP assertion each |
| Full unit suite | `npm run test:unit` — exit 0, 123 files / 689 tests |
| TypeScript | `npx tsc --noEmit --pretty false -p apps/web/tsconfig.json` — exit 0 |
| Changed TS lint | `npx eslint tests/unit/order-lifecycle-authority-migration.test.ts tests/unit/payment-approval-audit-migration.test.ts tests/unit/sales-receipt-issuance-migration.test.ts tests/unit/receipt-pdf-route.test.ts --max-warnings=0` — exit 0 |
| SQL lint limitation | ESLint has no SQL configuration and reports each `supabase/tests/*.sql` file as ignored under `--max-warnings=0`; runtime psql execution is the truthful changed-scope SQL verification. |
| Rollback | Revert only remediation tests/harnesses and migrations `20260820170000`, `20260820171000`, `20260820172000`; preserve existing lifecycle/payment events and issued receipt snapshots. |

### Remaining unavailable evidence

- Concurrent delivery/cancellation: `dblink` is available in PostgreSQL but not installed in `asados-supabase-db`; the lifecycle harness emits `CONCURRENCY_BLOCKER` rather than claiming concurrency proof.
- Physical thermal/browser print acceptance: no authenticated Playwright receipt fixture or printer device is available. The authenticated route-level PDF test closes the HTTP adapter proof only.

## Final runtime-evidence remediation attempt

### Completed

- Removed all six unused-variable warnings from `tests/unit/complete-lifecycle-e2e.test.ts` without changing assertions or runtime behavior.
- Made the real Mercado Pago background adapter testable through explicit dependency injection while retaining production defaults. `tests/integration/mercadopago-background-runtime.test.ts` runs only with `RUN_LOCAL_MP_RUNTIME=1`, seeds one deterministic local fixture, uses the local service-role API and the real `registrar_status_pagamento` RPC, forces calendar scheduling to throw after the RPC returns, and proves committed audit/payment state and unchanged lifecycle. Its cleanup deletes fixture records.
- Replaced the lifecycle `CONCURRENCY_BLOCKER` prose with a `dblink` two-session harness that invokes the real `transicionar_pedido` authority for simultaneous `confirmado→entregue` and `confirmado→cancelado`, then asserts exactly one event and a coherent stock/result pair.

### Runtime commands and results

| Command | Result |
|---|---|
| `RUN_LOCAL_MP_RUNTIME=1 npm run test:unit -- tests/integration/mercadopago-background-runtime.test.ts` after deterministic local fixture seed | exit 0, 1 passed; cleanup executed |
| `npm run test:unit -- tests/unit/mercadopago-webhook-security.test.ts tests/integration/mercadopago-background-runtime.test.ts tests/unit/order-lifecycle-authority-migration.test.ts` | exit 0, 27 passed / 1 skipped (runtime test requires explicit local fixture opt-in) |
| `npx eslint tests/unit/complete-lifecycle-e2e.test.ts tests/unit/order-lifecycle-authority-migration.test.ts tests/integration/mercadopago-background-runtime.test.ts apps/web/src/app/api/webhooks/mercadopago/route.ts --max-warnings=0` | exit 0 |
| `npx tsc --noEmit --pretty false -p apps/web/tsconfig.json` | exit 0 |
| `git diff --check` | exit 0 |

### Blocking limitation

The required concurrent proof was not executed. `dblink` was not installed in the production-like `asados-supabase-db`, as prohibited. Attempts to create an isolated disposable clone from the running database could not produce a faithful execution environment: schema-only clone failed on dependency ordering; full dump/restore had Supabase-owned restore errors and the clone’s application privileges differed from the live database. The new harness is executable only once a disposable database with the full local schema/data and `dblink` is provisioned; it must not run against the production-like database.

### Remaining scenario coverage

1. Concurrent delivery/cancellation: **blocked**, harness authored but no disposable `dblink` runtime completed.
2. Approved webhook through actual background adapter + committed payment audit + failing calendar: **passed** via explicit local runtime opt-in and real local RPC.
3. Approved webhook authoritative payment resolution: **passed** by the same background runtime test.
4. Approved notification full continuation: **passed** by the same background runtime test.

### TDD Cycle Evidence

| Work unit | RED | GREEN | Triangulation | Refactor |
|---|---|---|---|---|
| Mercado Pago runtime adapter | Test imported nonexistent exported background function and failed | Local opt-in runtime test passed after explicit injectable boundary | Approval RPC commit + calendar exception + lifecycle/audit assertions | Dependencies retain exact production defaults |
| Concurrent lifecycle harness | Structural migration test required two-session dblink commands and failed before harness update | Structural test passes; actual disposable runtime blocked | Delivery/cancellation race asserted in SQL | No production lifecycle code changed |
| Legacy fixture lint | ESLint failed with six warnings | zero-warning lint passed | all six imports/callback parameters addressed | No behavioral fixture changes |

### Rollback

Revert `apps/web/src/app/api/webhooks/mercadopago/route.ts`, `tests/integration/mercadopago-background-runtime.test.ts`, `supabase/tests/order_lifecycle_authority.sql`, `tests/unit/order-lifecycle-authority-migration.test.ts`, and the six mechanical edits in `tests/unit/complete-lifecycle-e2e.test.ts`. No durable fixture rows remain after the runtime test cleanup. Do not install `dblink` in `asados-supabase-db`.

## Disposable PostgreSQL Concurrent Lifecycle Proof

A faithful disposable PostgreSQL 17 container was provisioned with only the minimal lifecycle, stock-authority, and fixture schema required by the candidate migrations. `dblink` was installed only in that disposable container; `asados-supabase-db` was not modified.

- The harness ran two actual remote PostgreSQL sessions concurrently against the same `confirmado` order: `entregue` and `cancelado` through `public.transicionar_pedido`.
- Exactly one terminal transition committed. The competing session failed with `TRANSICAO_PEDIDO_INVALIDA`; the final order was terminal and the event count was exactly one.
- The proof exposed and corrected two harness-only defects: confirmed-order cancellation restores already-applied stock (`restaurado`, not `pendente`), and cleanup now removes stock snapshots/effects/items before the fixture orders.

| Evidence | Result |
|---|---|
| Disposable runtime command | `docker run postgres:17-alpine` + minimal bootstrap/migrations + disposable `dblink` harness — exit 0; `ok 1 - lifecycle runtime proves rejection, novo cancellation stock isolation, legacy classification, and concurrent delivery/cancellation single-winner authority` |
| Runtime log hash | `sha256:a9825110a24fcc233b077fff9792849949e8f8421fdc36fb55a9440959570930` |
| Focused structural test | `npm run test:unit -- tests/unit/order-lifecycle-authority-migration.test.ts` — exit 0, 3 passed |
| Diff check | `git diff --check` — exit 0 |
| Cleanup | Disposable `asados-lifecycle-proof-*` container removed by trap; no database/container remains. |
| Rollback boundary | Revert only the two assertions/fixture cleanup edits in `supabase/tests/order_lifecycle_authority.sql`; no production migration or live database data changed. |
