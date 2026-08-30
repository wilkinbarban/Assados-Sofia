# Apply Progress: Multichannel Customer Payment Proofs

## Completed Work Units
- [x] 1.1 `pr1-schema-ledger-rls` — forward-only `payment_proofs` and immutable `payment_proof_events` foundation with constrained metadata, indexes, grants, customer/staff RLS, and direct-write denial.

## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/unit/payment-proof-schema.test.ts`, `supabase/tests/payment_proof_schema.sql` | Contract + SQL integration | N/A (new files) | ENOENT before migration | Vitest 2/2; pgTAP 1/1 | Cross-client, seller, direct write, immutable audit | Re-ran both suites and diff check |

## Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test | `npm test -- --run tests/unit/payment-proof-schema.test.ts` → 1 file, 2 tests passed |
| Runtime harness | `npm run selfhost:test:db -- supabase/tests/payment_proof_schema.sql` → pgTAP `ok 1`, exit 0 against disposable local Supabase |
| Forward validation | Harness imports the forward migration into an isolated cloned database and proves customer isolation, active seller read, API write denial, and event immutability |
| Rollback boundary | Before consumers exist, revert only the new migration/test files; after rollout, disable consumers and retain ledger/audit through a forward corrective migration |
| Diff hygiene | `git diff --check` passed |

## Files
- `supabase/migrations/20260826110000_payment_proof_schema_ledger_rls.sql`
- `supabase/tests/payment_proof_schema.sql`
- `tests/unit/payment-proof-schema.test.ts`

## Remaining
Tasks 2.1–12.1 remain pending. No intake, LLM, PNG, UI, reconciliation, scheduler, or backfill behavior was implemented.

## PR2 Completed Work Unit
- [x] 2.1 `intake-identity-adapters` — shared PDF byte validator/channel normalizer plus service-only, delivery-idempotent SQL intake authority. Known Web customers enter `received`; unknown Telegram/WhatsApp senders enter invisible `identity_pending`. Storage keys are private metadata only; channel route wiring consumes this adapter in later rollout without duplicating authority.

### PR2 TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | `tests/unit/payment-proof-intake.test.ts`, `supabase/tests/payment_proof_intake.sql` | Unit + SQL integration | PR1 pgTAP 1/1 | Missing module import | Vitest 2/2; pgTAP 1/1 | 3 channels, spoof MIME, bad magic, oversize, replay, unknown | Shared normalizer/validator and one RPC authority |

### PR2 Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test | `npm test -- --run tests/unit/payment-proof-intake.test.ts` → 2/2 passed |
| Runtime harness | `npm run selfhost:test:db -- supabase/tests/payment_proof_intake.sql` → pgTAP `ok 1`, exit 0 |
| Cleanup/process | Disposable database removed by harness trap; no persistent process, container, staged object, or route side effect created |
| Rollback boundary | Disable callers; retain PR1 ledger. Before callers, revert PR2 migration/module/tests only. After rollout, use forward corrective migration. |
| Diff hygiene | `git diff --check` passed |

Tasks 3.1–12.1 remain pending. No global hash dedupe, quarantine, LLM, PNG, UI, reconciliation, scheduler, or backfill was implemented.

## PR3–PR4 Completed Work Units
- [x] 3.1 `dedupe-quarantine-outbox` — global tombstones, atomic duplicate disposition, server-clock quarantine, idempotent outbox, and admin restoration.
- [x] 4.1 `advisory-llm-classification` — bounded OpenRouter JSON-schema classification, fail-safe manual review, and service-only append-once advisory persistence.

### PR4 TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.1 | `tests/unit/payment-proof-extraction.test.ts`, `supabase/tests/payment_proof_extraction.sql` | Unit + SQL integration | PR1–PR3 6/6 | Missing advisory module | Vitest 7/7; pgTAP 1/1 | accepted, rejected, low confidence, malformed, injection, oversize, outage/retry, replay/conflict | Pure parser/result helpers; sanitized failure path; typecheck/diff check pass |

### PR4 Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test | `npm test -- --run tests/unit/payment-proof-extraction.test.ts` → 7/7 passed |
| Runtime harness | `npm run selfhost:test:db -- supabase/tests/payment_proof_extraction.sql` → pgTAP `ok 1`, exit 0 |
| Regression | PR1–PR4 focused unit files → 13/13; `npx tsc -p apps/web/tsconfig.json --noEmit` and `git diff --check` passed |
| Cleanup/process | Mocked OpenRouter only; disposable SQL database removed by harness trap; no persistent process, object, route, or product-data side effect |
| Rollback boundary | Disable the advisory worker; retain append-only events. Before consumers, remove PR4-only module/migration/tests; after rollout use a forward corrective migration. |
| Changed lines | 244 authored PR4 lines, within the 400-line budget |

Tasks 5.1–12.1 remain pending. PR4 adds no PNG, UI, reconciliation, scheduler, purge, or live provider invocation.

## PR5 Completed Work Unit
- [x] 5.1 `deterministic-png` — renders PDF page one server-side through the existing `pdf-parse`/PDF.js and native canvas stack, bounded to 1200×4800, preserving rotation/aspect ratio and producing stable PNG bytes/hash. A service-only RPC records private storage key, dimensions, hash and renderer version append-once/idempotently.

### PR5 TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5.1 | `tests/unit/payment-proof-render.test.ts`, `supabase/tests/payment_proof_render.sql` | Real PDF render + SQL integration | PR1–PR4 13/13 | Missing render module | Vitest 4/4; pgTAP 1/1 | Stable hash/dimensions, 90° rotation, invalid/encrypted shape, oversize, replay/conflict | Shared bounded renderer/version; corrected type declaration; typecheck/build/diff pass |

### PR5 Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test | `npm test -- --run tests/unit/payment-proof-render.test.ts` → 4/4 passed with a real generated PDF fixture |
| Runtime harness | `npm run selfhost:test:db -- supabase/tests/payment_proof_render.sql` → pgTAP `ok 1`; first run exposed private-key validation bug, corrected rerun passed |
| Regression/build | PR1–PR5 unit files → 17/17; direct TypeScript and production Next build passed |
| Cleanup/process | Rendering is in-memory; SQL clone removed by trap; build workers exited. No stored object, route, live service, CDN, browser worker, or product-data side effect |
| Dependency tradeoff | Reused direct `pdf-parse@2.4.5` and its locked `@napi-rs/canvas`/PDF.js Node implementation; no dependency or lockfile change |
| Rollback boundary | Disable renderer worker and retain render audit; remove PR5-only files before consumers or use a forward corrective migration after rollout |
| Changed lines | 165 authored PR5 lines, within 400 |
| Evidence revision | `sha256:751dea97247376c5c6feea79cdc8a809e043feac618471298d59c57c056e7e97` |

Tasks 6.1–12.1 remain pending. No UI/chat publication, reconciliation, scheduler/purge, or synthetic receipt fallback was added.

## PR6 Completed Work Unit
- [x] 6.1 `admin-pix-workflow` — accessible queue panel for pending identity, manual review, received/admitted and quarantine states; server-timestamp countdown, private PNG/advisory metadata, confirmation dialog, row-authorized original PDF route, and authoritative audited review RPC. No order linking/payment approval or chat projection.

### PR6 TDD / Work Unit Evidence
- RED: missing panel and row-authorized route.
- GREEN: focused component/route Vitest 5/5; SQL pgTAP 1/1.
- Triangulated unauthenticated/seller denial, supervisor row read, private path non-exposure, empty/loading/error states, server countdown, restore confirmation, confirm-value/admit audit.
- Regression PR1–PR6: 22/22; TypeScript, production build and diff check pass.
- Cleanup: disposable SQL clone removed; build workers exited; no storage mutation or persistent process.
- Rollback: disable panel/actions/routes; retain immutable review events; forward-correct migration after rollout.
- Changed lines: 196 authored core PR6 lines, within 400.
- Evidence: `sha256:38b09bb5c1232a29146a0f29475f2c0603240e7bd93da301dd384e643a7be203`.

Tasks 7.1–12.1 remain pending.

## PR7 Completed Work Unit
- [x] 7.1 `png-only-chats` — service-only idempotent projection accepts only admitted proofs with registered PNG and matching conversation customer. Client and Atendimento render the same row-authorized PNG component/lightbox; no PDF, private path, or download action. Legacy attachments remain unchanged unless `payment_proof_id` marks the canonical proof projection.

### PR7 Evidence
- RED missing PNG-only chat card; GREEN focused 7/7 and pgTAP 1/1.
- Forbidden states, repeated projection, customer mismatch contract, no PDF/private path/download, and lightbox covered.
- PR1–PR7 plus legacy operator attachment/banner regression: 39/39.
- TypeScript, production build, diff check PASS.
- Cleanup: SQL clone removed; build workers exited; no storage/product-data/persistent process.
- Rollback: disable projection caller/component branch and retain projection ledger/message audit; forward correction after rollout.
- Authored core: 72 lines; evidence `sha256:0164f16295149210b0c499e56fdbe9c67961d0b17543262a6fa0b3e6439ae856`.

## PR8 Completed Work Unit
- [x] 8.1 `exact-reconciliation` — an admitted proof with a human-confirmed amount can reconcile exactly one or many unique pending, non-cancelled orders belonging to the same customer. PostgreSQL locks proof/orders, enforces exact cents and one reconciliation, delegates each approval to `registrar_status_pagamento`, and persists actor, `digital_proof` provenance, links, and append-only audit. Replays with the same key return the same reconciliation.

### PR8 TDD / Work Unit Evidence
- RED: reconciliation migration and order-selection UI absent; focused contract/component tests failed.
- GREEN: reconciliation Vitest/component 6/6; isolated pgTAP 3/3.
- Triangulated exact multi-order success/replay, cross-customer and amount mismatch denial, and disabled UI until selected cents equal the proof.
- PR1–PR8 focused unit regression: 32/32; TypeScript and `git diff --check` PASS.
- Production build: environment blocker — Turbopack cannot create its CSS worker process because binding a local port returns `EPERM`; source/type checks pass.
- Rollback: disable reconciliation UI/action/RPC grant; retain proof ledger/audit and use a forward corrective migration after rollout.
- Evidence revision: `sha256:6d82cfcf9b92b96ae4e671496e958cae45861f4e24dfcd77ea748e2bed465f38`.

Tasks 9.1–12.1 remain pending.
