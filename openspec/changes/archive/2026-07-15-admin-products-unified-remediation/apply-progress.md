# Apply Progress: Admin Products Unified Remediation

## Slice 4: authenticated deterministic Playwright E2E

- Scope: tasks 4.1–4.3 only. The harness resolves local Supabase runtime values in memory, rejects every target except `http://127.0.0.1:54321`, and rejects the protected production reference. No credentials are printed or persisted.
- Result: three serial authenticated E2E scenarios cover missing/wrong-role denial, the official and legacy routes, CRUD and filters, search/status DnD gating, persisted keyboard reorder, successful image replacement, persistence failure, prior-image preservation, new-object cleanup, and fixture cleanup.
- Delivery: autonomous stacked-to-main Slice 4; no branch, commit, staging, reset, or PR operation occurred.

### User-selected Slice 4 cleanup hardening

- Scope: cleanup-only hardening in `tests/e2e/fixtures/admin-products.ts` and `tests/admin-products-fixture-cleanup.test.ts`. The latest bounded correction changed 48 lines, within its 60-line forecast.
- Failure-path audit: regression coverage now exercises Auth creation; resolved and rejected profile failures; sibling rollback; product seed rollback; Storage list/remove failures; product deletion; Auth deletion; and dual callback/restore failures.
- Result: all cleanup attempts run without an earlier failure suppressing later product, Storage, or Auth cleanup. Cleanup aggregation is deterministic; when both the callback and restore fail, the callback failure is reported first and the restore failure second.
- Verification recorded for the completed hardening: focused cleanup tests passed 10/10; the Slice 4 authenticated E2E suite passed 3/3; the full unit suite passed 236/236; TypeScript, lint, and build passed. This artifact-only reconciliation did not rerun any command.
- Postflight: zero products, zero users, and zero orphan images remained. The canonical function is present and the disabled alias is absent.
- Review authority: native lineage `review-admin-products-slice4-cleanup-v2` is approved and the post-apply gate is `allow`. SDD binding revision: `sha256:0c5c9af1e1522d5198f1d89fb129edbc3967dfe01f852bdba5b1c41bdc55577d`.
- Sole accepted residual non-goal: hard process termination between function rename and restoration.

#### Cleanup adjustment work-unit evidence

| Evidence | Exact result |
|---|---|
| Focused cleanup | `tests/admin-products-fixture-cleanup.test.ts` — 10/10 passed across Auth creation, both profile-failure forms, sibling and product-seed rollback, Storage list/remove, product/Auth deletion, and dual callback/restore failure. This reconciliation did not rerun the command. |
| Runtime harness | Slice 4 authenticated E2E — Chromium 3/3 passed against the local runtime; postflight found 0 products, 0 users, and 0 orphan images. This reconciliation did not rerun the command. |
| Full/static gates | Full unit suite 236/236; TypeScript, lint, and build passed. Postflight confirmed the canonical function is present and the disabled alias is absent. This reconciliation did not rerun any command. |
| Review budget | Latest bounded correction is 48 changed lines, within its 60-line forecast and below the 400-line review budget. |
| Rollback boundary | Revert only the cleanup hardening in `tests/e2e/fixtures/admin-products.ts` and `tests/admin-products-fixture-cleanup.test.ts`; retain the original Slice 4 harness, all Slice 1–3 work, task state, staging, and review authority. |

### Authenticated responsive Playwright follow-up

- Scope: one authenticated `390x844` browser scenario added to `tests/e2e/admin-products.spec.ts`; 29 changed lines. No implementation, configuration, task, Git-state, or review-authority change is part of this artifact reconciliation.
- Result: the scenario proves the product card and stock/edit/delete actions are visible and within the viewport, stock changes from 5 to 6, and the edit form loads the seeded product.
- Verification recorded for the completed follow-up: focused responsive scenario 1/1, Slice 4 E2E 4/4, cleanup 10/10, TypeScript, and lint passed. Postflight was clean. This artifact-only reconciliation did not rerun any command.
- Review authority: lineage `review-admin-products-slice4-responsive-v1` is approved and the post-apply gate is `allow`.
- SDD binding revision: `sha256:f7ea7f0638cdb41d32aae809f1ff5b24d71e4b52de4d25d4d9ee36d0f6dc072c`.
- Resolution: the prior warning about missing authenticated small-viewport Playwright evidence is resolved.

#### Responsive follow-up work-unit evidence

| Evidence | Exact result |
|---|---|
| Focused browser scenario | Authenticated `390x844` responsive scenario — 1/1 passed; product card and stock/edit/delete actions were visible and in viewport, stock changed 5→6, and the edit form loaded the seeded product. This reconciliation did not rerun the command. |
| Runtime harness | Slice 4 authenticated E2E — 4/4 passed against the local browser/runtime path. Postflight was clean. This reconciliation did not rerun the command. |
| Cleanup/static gates | Cleanup 10/10; TypeScript and lint passed. This reconciliation did not rerun any command. |
| Review budget | Follow-up changed 29 lines in one E2E file, below the 400-line review budget. |
| Rollback boundary | Revert only the authenticated responsive scenario in `tests/e2e/admin-products.spec.ts`; retain the original Slice 4 E2E scenarios, fixtures, cleanup hardening, all Slice 1–3 work, task state, Git state, and review authority. |

Final whole-change SDD verification must be refreshed after this post-verification change. The approved responsive follow-up does not make the change archive-ready.

### TDD Cycle Evidence

| Task | Test file/layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|
| 4.1 | `tests/e2e/admin-products.spec.ts` / browser E2E | Existing config listed 1 login test; local Auth health and Docker services passed without exposing values | `npm run test:e2e -- admin-products.spec.ts` exited 1: missing `./fixtures/admin-products`, 0 tests collected | Final focused run exited 0: 3/3 | Missing+vendor sessions; CRUD create/update/delete; search+status gates; image success+persist failure | Consolidated reusable sign-in and runtime image payload |
| 4.2 | `fixtures/{local-supabase,admin-products}.ts`, `playwright.config.ts` / local Auth+REST+Storage | `npx playwright test --list` passed after wiring; `npx tsc --noEmit` exited 0 | The 4.1 RED proved the fixture/config contract absent | Local-only env gate, generated users/passwords/prefix, cleanup, and fixed SQL failure injection passed in all 3 scenarios | Admin+vendor; seed+CRUD rows; successful objects+failed replacement cleanup | Cached process-memory env and made cleanup errors explicit; focused 3/3 remained green |
| 4.3 | focused and complete suites / E2E+unit | N/A verification task | Intermediate focused runs exposed an auth navigation race, then a reload readiness race; outputs contained no credentials/tokens/IDs | Focused 3/3 passed; `npm run test:all` passed 226 unit + 4 E2E | Full suite includes the public login test beside all three authenticated scenarios | Final focused rerun after cleanup refactor passed 3/3 |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused RED | `npm run test:e2e -- admin-products.spec.ts` — exit 1; missing local fixture module; 0 tests collected. |
| Focused GREEN/runtime | Same command — exit 0; Chromium 3/3 passed against local Next.js + local Supabase Auth/REST/Storage. Final refactor rerun also passed 3/3. |
| Full gate | `npm run test:all` — exit 0; Vitest 35 files, 226/226; Playwright Chromium 4/4. |
| Static gate | `npx tsc --noEmit` — exit 0; `npx playwright test --list` — 4 tests in 2 files. |
| Review budget | Slice source/test/config delta is 248 authored changed lines; 37 task/progress lines make this apply batch 285 changed lines, below the 320 forecast and 400 hard limit. |
| Rollback boundary | Revert only `playwright.config.ts`, `tests/e2e/admin-products.spec.ts`, `tests/e2e/fixtures/admin-products.ts`, `tests/e2e/fixtures/local-supabase.ts`, and Slice 4 task/progress marks. Retain all Slice 1–3 source, tests, migrations, and staged review content. |

### Remaining state

Implementation remains 25/25 tasks complete, but final whole-change verification is stale after the authenticated responsive Playwright follow-up. Refresh independent `sdd-verify`; do not claim archive readiness yet.

## Slice 3: official InventoryManager UI
Slices 1–2 and their remediations remain closed/frozen; Slice 3 tasks 3.1–3.3 are complete. At this recorded checkpoint, Slice 4 was the only remaining implementation slice. Delivery remains stacked-to-main: `main ← Slice1 ← Slice2 ← 📍 Slice3 ← Slice4`.

### TDD Cycle Evidence
| Task | Test file/layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|
| 3.1 | `InventoryManager.test.tsx`, `product-ordering.test.ts` / component+unit | 2 files, 21/21 passed | 4 files failed, 10 failed/3 passed before production edits | Focused 4 files, 17/17 passed | Admin+supervisor, search+status, keyboard+drag, success+rollback | Pure ordering helpers; focused rerun green |
| 3.2 | `produtos-action.test.ts`, `produtos-page-ordering.test.tsx` / action+route | Same baseline | Missing global validation/official redirect failed | Complete ID sequence, admin revalidation, legacy redirect pass | Partial sequence rejected; route performs no duplicate query | Slice 2 session/image boundaries unchanged |
| 3.3 | Focused/full/build/lint/runtime | N/A | Full suite exposed stale legacy-page expectation | 219/219 full unit tests and production build passed | Runtime unauthenticated request preserved `/login` gate | Focused lint clean; known pre-existing `AdminDashboard` lint error remains |

### Work Unit Evidence
| Evidence | Exact result |
|---|---|
| Focused/full | `npm run test:unit -- tests/unit/product-ordering.test.ts tests/components/operator/InventoryManager.test.tsx tests/unit/produtos-action.test.ts tests/unit/produtos-page-ordering.test.tsx` — 17/17; `npm run test:unit` — 35 files, 219/219; all exit 0. |
| Runtime/build | Next dev `GET /atendimento/produtos` without a session — HTTP 307 to `/login` (existing auth gate); redirect destination proven by route test. `npm run build` and `npx tsc --noEmit` exited 0. |
| Budget/rollback | 375 implementation/test changed lines; 399 including 24 OpenSpec checkbox/evidence lines. Revert only the nine Slice 3 source/test files, one-line `listarProdutos` ordering, one-line dashboard wiring, legacy page redirect, and these artifact marks. |

## Slice 3 verification remediation

- Scope: only the four failed Slice 3 verification gaps. Slice 2 image lifecycle is frozen and green; Slice 4, external runtime, deployment, archive, commit, and unrelated dirty files were not touched.
- Result: five behavior-first tests were added. The RED run exposed unnamed card actions at a 390px viewport; the only production correction adds product-specific accessible names to the existing status, stock, edit, and delete controls. Existing query, reload, client-catalog, Space, and Escape behavior required no production change.

### TDD Cycle Evidence

| Task | Test file/layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|
| V3.1 responsive actions | `InventoryManager.test.tsx` / component integration | Focused pre-edit safety net: 30/30; prior full Slice 3: 219/219 | Focused remediation run exited 1: 1 failed, 35 passed; small viewport could not find `Desativar Produto 1`, and stock buttons had empty accessible names | Added five `aria-label` attributes only; focused run exited 0, 36/36 | Desktop six-card coverage plus 390px reflow; named reorder, status, decrement, increment, edit, and delete controls | No structural refactor; preserved card behavior and styling |
| V3.2 persisted reload/query | `InventoryManager.test.tsx`, `estoque-action.test.ts` / component+action | Same | Written before production review; passed during the combined RED run, proving no implementation defect | Reload remount restores the second persisted sequence; query calls `order('ordem_exibicao', ...)` then `order('nome', ...)` | Initial order and a distinct persisted order are both asserted | No production change |
| V3.3 client catalog | `cliente/chat.test.tsx` / server-component integration | Prior full Slice 3: 219/219 | Written before production review; passed during the combined RED run | Existing `buscar_produtos_disponiveis` RPC is called once and its deliberately non-alphabetic returned order is preserved | Two distinct products prove order rather than mere rendering | No production change |
| V3.4 Space/Escape | `InventoryManager.test.tsx` / component integration | Focused pre-edit safety net: 30/30 | Written before production review; both branches passed during the combined RED run | Space starts and confirms a global move; Escape restores the snapshot and performs no persistence call | Space confirmation and Escape cancellation exercise different branches | No production change |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused RED | `npm run test:unit -- tests/components/operator/InventoryManager.test.tsx tests/unit/estoque-action.test.ts tests/unit/cliente/chat.test.tsx` — exit 1; 1 failed, 35 passed. |
| Focused GREEN/runtime harness | Same command — exit 0; 3 files, 36/36. jsdom exercised the 390px component path, remount/refetch, keyboard events, and client Server Component rendering; no external runtime was used. |
| Slice 2 regression | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 19/19, including all existing image lifecycle cases. |
| Full/type/lint/build | `npm run test:unit` — 35 files, 224/224; `npx tsc --noEmit`, focused ESLint, `git diff --check`, and `npm run build` all exited 0. |
| Review budget | Remediation source/test delta is +114/-1 = 115 changed lines; 34 artifact lines make the complete authored correction +148/-1 = 149 changed lines, below 400. |
| Rollback boundary | Revert only five accessible-name attributes in `InventoryManager.tsx`, the new remediation assertions in `InventoryManager.test.tsx` and `estoque-action.test.ts`, the strengthened client-catalog case in `cliente/chat.test.tsx`, and this V3 evidence. Do not revert Slice 2 lifecycle code or prior Slice 3 behavior. |

## Slice 2 remediation: minimal cleanup E2E observability

- Scope: only `scripts/validate-slice2-hosted-receipt.sh`, `tests/unit/slice2-hosted-receipt-harness.test.ts`, and these OpenSpec records. No remote execution, staging/production access, systemd/pipeline change, migration change, or business-behavior change occurred.
- Result: all six cleanup HTTP boundaries now emit redacted JSON observations. Fixed step IDs are `storage-object-delete`, `pending-record-delete`, `product-delete`, `auth-user-delete`, `auth-user-readback`, and `product-readback`.
- Redaction contract: observations contain only `cleanup_step`, numeric `http_status`, allowlisted `error_code`/`error_message`, and fixed `parameter_names`. They never parse or echo response bodies, request parameter values, credentials, project refs, object paths, cleanup/product/user IDs, or tokens. Expected HTTP 404 user-absence readback is recorded as success (`null` error fields).

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| O1–O3 cleanup observability | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Unit + local shell/HTTP-double integration | Focused baseline exited 0; 1 file, 26/26 tests passed. | Added six per-substep HTTP 400 injections first; focused command exited 1 with exactly 6 new failures because no diagnostic observations existed. | Minimal harness instrumentation added; focused command exited 0 with 1 file, 32/32 tests passed. | Six distinct cleanup branches each assert its unique fixed step ID, status 400, allowlisted generic error, exact parameter-name list, and absence of injected response/credential/ref/UUID data. | Centralized status allowlisting and emission in `emit_cleanup_http_observation`; expected-status handling keeps the normal 404 absence proof non-error. Tests remained green. |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 32 tests passed. |
| Full strict-TDD gate | `npm run test:unit` — exit 0; 34 files, 212 tests passed. |
| Shell syntax | `bash -n scripts/validate-slice2-hosted-receipt.sh` — exit 0. |
| Runtime harness | Local-only `--preflight` with the fixed authorized identity contract — exit 0; output: `local preflight recorded; remote execution is not authorized`. No HTTP request or remote target was used. |
| Review budget | Authored remediation is below 400 changed lines and remains one autonomous stacked-to-main Slice 2 work unit. |
| Rollback boundary | Revert only the cleanup observation helpers/call sites in `scripts/validate-slice2-hosted-receipt.sh`, the six injection cases and HTTP double support in `tests/unit/slice2-hosted-receipt-harness.test.ts`, and O1–O3 evidence in `tasks.md` / `apply-progress.md`. Existing cleanup behavior remains intact. |

### Next minimal E2E plan

After review, an authorized operator may run the existing `--authorized-flow` command once against the already approved non-production target and credential channel. Capture the first cleanup diagnostic if the grouped cleanup fails. Do not retry on production and do not modify systemd or migrations as part of that run.

## Bounded correction: direct Auth nullable-instance contract

- Scope: only `tests/unit/slice2-hosted-receipt-harness.test.ts` and the matching Slice 2 progress/task records. The harness already creates direct Auth users with `instance_id = NULL` and verifies `u.instance_id is null`; no production, migration, or remote behavior changed.
- Root cause: the static contract still required the obsolete zero UUID despite hosted preflight proving `auth.users.instance_id` is nullable and the approved fixture intentionally uses `NULL`.
- Result: the contract requires `instance_id` to be nullable, requires the complete identity graph to use `u.instance_id is null`, and rejects the zero-UUID assertion. All other direct Auth identity graph requirements remain asserted.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Direct Auth nullable-instance contract | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Unit/static harness contract | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 1; 1 file, 9/10 passed; stale zero-UUID assertion failed. | Existing stale contract failed against the already-supported nullable fixture behavior, proving the mismatch before its expectation changed. | Replaced only that expectation; focused command exited 0; 1 file, 10 tests passed. | The corrected contract asserts nullable schema support, the `NULL` graph predicate, and zero-UUID absence while retaining all other identity requirements. | No code refactor: this is a test-contract-only correction. |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 10 tests passed. |
| Full unit suite | `npm run test:unit` — exit 0; 30 files, 164 tests passed. |
| Runtime harness | N/A by instruction: this static-contract correction has no local runtime boundary, and no remote project or hosted harness was run. |
| Rollback boundary | Revert only the nullable-instance assertions in `tests/unit/slice2-hosted-receipt-harness.test.ts` and this correction record in `tasks.md` / `apply-progress.md`; the hosted harness and all production behavior remain unchanged. |

## Bounded correction: direct Auth bcrypt fixture validation

- Scope: only `scripts/validate-slice2-hosted-receipt.sh`, `tests/unit/slice2-hosted-receipt-harness.test.ts`, and the matching Slice 2 progress/task records. No remote project, hosted harness, migration, application source, Slice 3, or Slice 4 work was run.
- Root cause: `crypt(..., gen_salt('bf'))` produces standard bcrypt hashes with `$2a$`/`$2b$` (and compatible `$2y$`) prefixes, while the identity graph required the exact three-character `$2` prefix and rejected valid fixture hashes before password grants.
- Result: the identity graph now uses the anchored PostgreSQL regex `^\$2[aby]\$`, which accepts only supported bcrypt version prefixes and retains the remaining graph checks.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Direct Auth bcrypt fixture validation | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Unit/static harness contract | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 7 tests passed | Added the required anchored bcrypt-prefix contract and rejection of the literal `$2` equality first; focused command exited 1 with 1/8 failed because the harness used the exact-prefix check. | Replaced only the identity-graph predicate; focused command exited 0; 1 file, 8 tests passed. | The regression asserts both the accepted `[aby]` prefix set and absence of the obsolete literal-prefix predicate. | No additional refactor needed; a single anchored regex is the smallest safe replacement. |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 8 tests passed. |
| Full unit suite | `npm run test:unit` — exit 0; 30 files, 162 tests passed. |
| Bash syntax | `bash -n scripts/validate-slice2-hosted-receipt.sh` — exit 0. |
| Runtime harness | N/A by instruction: no remote projects or hosted harness were run in this correction step. |
| Rollback boundary | Revert only the bcrypt predicate in `scripts/validate-slice2-hosted-receipt.sh`, its regression in `tests/unit/slice2-hosted-receipt-harness.test.ts`, and this bounded-correction documentation. |

## Bounded correction — admin-products-unified-remediation-slice2-v1

- Scope: R1-001, R2-001/R2-002, R3-001/R3-002, R4-001 only; correction delta is +132/-46 (178 changed lines), within the 180 forecast and 200-line hard budget; Slice 2 task checkboxes remain valid.
- RED: lifecycle tests were extended for atomic cleanup IDs, completion failure, registrar ID propagation, and zero-path retry completion; the isolated worktree cannot execute them because its dependency tree lacks the project Vitest/Vite dependencies and the permitted frozen target excludes configuration repair.
- GREEN/static: correction-delta whitespace checks, esbuild syntax transpilation, and four targeted SQL-contract groups passed. The migration creates cleanup rows in `substituir_imagem_produto`'s transaction, returns the cleanup UUID, and `obter_limpeza_imagem_pendente` excludes any current product reference before storage deletion.
- Verification constraint: `npx --package typescript@5.9.3 tsc --noEmit` is blocked by the incomplete isolated `node_modules` tree (missing Next, React, Vitest, and project dependencies), not a correction-specific diagnostic. Docker was intentionally not used.
- Rollback boundary: revert only the lifecycle action, migration, lifecycle unit test, this design correction, and this correction record; the existing Slice 1 bridge/RPC scope is unchanged.

## Work unit

- Slice: 1 — Database identity, RLS, and SQL tests (PR 1)
- Delivery: stacked-to-main
- Completed tasks: 1.1, 1.2, 1.3
- Out of scope: Slice 2 server action/session-client migration, image lifecycle implementation, UI, and Playwright.

## TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/unit/inventory-rpc-migration.test.ts`, `supabase/tests/admin_products_inventory_hardening.sql` | Unit + local Postgres runtime | Blocked: the normal Vitest command exits 1 because sandbox policy denies `.env` reads | `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts` exited 1: 4 assertions failed against the empty forward migration | Same focused command exited 0: 4/4 assertions passed; SQL harness exited 0 | Admin and supervisor success; anonymous, inactive admin, and vendor rejection; insufficient stock; inner-subtransaction rollback | Focused test assertions were normalized for SQL whitespace; command rerun exited 0 |
| 1.2 | Same | Unit + local Postgres runtime | N/A: new migration | Completed before migration implementation | Applied `20260712164546_admin_products_authenticated_inventory_rpc.sql` directly to local Postgres for runtime verification; function metadata confirms the four-argument `SECURITY DEFINER` signature, empty `search_path`, authenticated-only execution, and no obsolete signature | Runtime harness covers valid admin/supervisor actors, missing session, inactive/wrong role, insufficient stock, and atomic rollback | No production refactor needed; implementation is a single transaction-safe RPC |
| 1.3 | Same | Unit + local Postgres runtime | N/A | N/A | Focused Vitest and SQL runtime commands exited 0 | Privileges and signatures also inspected via `pg_proc`/`has_function_privilege` | Documentation records the Slice 2 deployment dependency |

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test | `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts` — exit 0; 1 file, 4 tests passed. The temporary config only sets `envDir: '/tmp'` so Vitest does not read the sandbox-denied project `.env`. |
| Runtime harness | `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` — exit 0; all `DO` assertions passed and transaction rolled back. |
| Local database inspection | `pg_proc` confirms `ajustar_estoque_atomico(uuid,integer,tipo_movimentacao,text)`, `prosecdef = true`, `search_path = ''`, anon/service_role execute = false, authenticated execute = true, and the five-argument signature is absent. `produtos` and `movimentacoes_estoque` both retain RLS. |
| Rollback boundary | Revert only `20260712164546_admin_products_authenticated_inventory_rpc.sql`, `tests/unit/inventory-rpc-migration.test.ts`, and `supabase/tests/admin_products_inventory_hardening.sql`; no server action, UI, Storage policy, or historical migration changed. |

## Deployment ordering and remaining risk

The current `src/app/actions/estoque.ts` still invokes the removed five-argument RPC through `createAdminClient()`. Therefore **PR 1 is not independently deployable to an environment where that caller is live**. Merge the stacked PR, but apply its database migration only in the same release window as Slice 2, after Slice 2 changes the caller to the cookie-bound authenticated client and the four business arguments. Do not add a service-role grant or a compatibility overload: either would preserve the caller-controlled/unauthenticated boundary that this slice removes.

If the migration is applied before Slice 2, roll back the application/database release as one deployment unit before accepting stock adjustments. A temporary legacy wrapper must be an explicit emergency migration approved by the maintainer; it is not included here because it would weaken the target authorization contract. Slice 2 remains the required follow-up before production promotion.

## Corrective rerun: forged direct table DML

The first phase-contract validation found that an active `vendedor` could directly insert a forged `public.movimentacoes_estoque` row: the original migration secured the RPC but left the historical `authenticated` table grant and `Escrita de movimentações por operadores` INSERT policy intact.

### Corrective TDD Cycle Evidence

| Task | RED | GREEN | Refactor |
|---|---|---|---|
| 1.1 | Added a static migration assertion and runtime SQL proof for direct forged movement INSERTs and product stock UPDATEs by active vendor, inactive admin, and unknown authenticated identities. `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts` exited 1 (1/5 failed). The SQL harness exited 3 with `direct movement insert unexpectedly succeeded for d4d4...` before the remediation. | Focused Vitest exited 0 (5/5 passed). Runtime SQL harness exited 0 after the migration correction. | Kept the proof at the migration/RLS boundary; no Slice 2 action or Storage behavior changed. |
| 1.2 | The failing proof demonstrated the missing least-privilege boundary. | The forward migration now revokes all `public`, `anon`, and `authenticated` table privileges on `produtos` and `movimentacoes_estoque`; restores only required reads; and removes both historical direct-write policies. The `SECURITY DEFINER` RPC remains executable only by `authenticated` and its admin/supervisor success paths still pass. | No additional production refactor needed. |
| 1.3 | N/A | Metadata confirms `produtos`: `anon/authenticated SELECT`; `movimentacoes_estoque`: `authenticated SELECT`; no caller INSERT/UPDATE/DELETE grants; only SELECT RLS policies remain. | Tasks 1.1–1.3 stay checked because the corrected focused tests and full SQL harness pass. |

### Corrective verification

| Evidence | Result |
|---|---|
| Focused Vitest | `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts` — exit 0; 1 file, 5 tests passed. |
| Full SQL harness and direct probes | `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` — exit 0. It proves the three non-authorized authenticated identities cannot forge movement rows or update stock, while active admin and supervisor RPC paths succeed. |
| Metadata | `information_schema.role_table_grants` shows only `produtos` SELECT for `anon/authenticated` and `movimentacoes_estoque` SELECT for `authenticated`. `pg_policies` shows only the existing SELECT policies. `has_function_privilege` is authenticated=true and anon=false for the four-argument RPC. |
| Local reapply note | Applying the already manually-applied forward migration to the local database reported the expected missing old five-argument signature and existing four-argument function errors, then executed the new privilege/policy statements. This is not a production migration failure: a normal forward migration runs once from the pre-Slice-1 schema. |
| Rollback boundary | Revert only `20260712164546_admin_products_authenticated_inventory_rpc.sql`, `supabase/tests/admin_products_inventory_hardening.sql`, and `tests/unit/inventory-rpc-migration.test.ts`; Slice 2+ files and behavior remain untouched. |

## Resumed remediation: produto-imagens Storage policy boundary

The resumed Slice 1 blocker was confirmed: the historical `storage.objects`
policies named `Upload de imagens por operadores` and `Exclusão de imagens por
operadores` included active `vendedor` in `produto-imagens` mutation access.
The forward migration now replaces only those two policies and adds an explicit
UPDATE policy, all scoped to `bucket_id = 'produto-imagens'` and the existing
active `admin`/`supervisor` role predicate. The public SELECT policy is retained
unchanged. No service-role or public grant/policy was added or broadened.

### Corrective TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/unit/inventory-rpc-migration.test.ts`, `supabase/tests/admin_products_inventory_hardening.sql` | Static unit + local Postgres runtime | Prior focused migration suite: 5/5 passing (recorded above) | Added the Storage-policy static assertion and direct-role SQL probes first. The runtime harness exited 3 before the policy change: `storage insert unexpectedly succeeded for d4d4...` (active vendedor). A static RED replay with the pre-GREEN migration content exited 1: 1/6 tests failed because the replacement policy was absent. | The focused Vitest command exited 0: 6/6 tests passed. The SQL harness exited 0 after the policy replacement. | Runtime probes cover active vendor, inactive admin, and no-profile identity denial for INSERT/UPDATE/DELETE; active admin and supervisor allow all three mutations; anon SELECT remains allowed. | Added the UPDATE policy so session-bound Storage upsert/retry behavior remains available for Slice 2. The harness sets `storage.allow_delete_query=true` only locally to pass Storage's direct-SQL delete guard and observe RLS. |
| 1.2 | Same | Migration + local Postgres runtime | N/A: existing forward migration | The existing policy metadata showed `vendedor` in the INSERT and DELETE predicates. | Replaced those historical policies with INSERT/UPDATE/DELETE policies for `authenticated` active admin/supervisor only; every mutation predicate includes `bucket_id = 'produto-imagens'`. | Admin and supervisor each perform insert, update, and delete against separate runtime paths; unauthorized roles receive zero update/delete rows and RLS rejects insert. | No broader grants were needed; the existing public-read policy remains. |
| 1.3 | Same | Metadata + runtime verification | N/A | N/A | Metadata, direct role probes, RPC behavior, table-DML protection, and public SELECT all pass. | The same harness continues to prove RPC identity, atomic inventory behavior, and table DML protection. | None. |

### Resumed verification commands

| Evidence | Exact command and result |
|---|---|
| Runtime RED | `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` — exit 3 before the migration policy change; active vendedor INSERT succeeded. |
| Static RED replay | `cp supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql /tmp/inventory-rpc-migration.green.sql && head -n 136 /tmp/inventory-rpc-migration.green.sql > supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql && npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts; status=$?; cp /tmp/inventory-rpc-migration.green.sql supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql; exit $status` — exit 1; 1/6 failed against the pre-GREEN migration content; file restored in the same command. |
| Focused unit GREEN | `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts` — exit 0; 1 file, 6 tests passed. The temporary config only sets `envDir: '/tmp'` to avoid the sandbox-denied project `.env`. |
| Runtime SQL GREEN | `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` — exit 0; all role probes, public-read, inventory RPC, and table-DML assertions passed; transaction rolled back. |
| Local policy application for verification | `sed -n '138,$p' supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql \| docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1` — exit 0; applied only the new Storage policy delta to the already Slice-1-migrated local database. No deployment occurred. |
| Metadata policy expressions | `docker exec supabase_db_Asados psql -U postgres -d postgres -P pager=off -c "select policyname, roles, cmd, coalesce(qual, '') as using_expression, coalesce(with_check, '') as check_expression from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('Upload de imagens de produtos por admin ou supervisor','Atualização de imagens de produtos por admin ou supervisor','Exclusão de imagens de produtos por admin ou supervisor','Leitura pública de imagens de produtos') order by policyname;"` — exit 0; three `authenticated` mutation policies each contain the target bucket and active admin/supervisor predicate; public SELECT remains scoped to the target bucket. |
| Rollback boundary | Revert only the Storage-policy section in `supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql` plus the matching SQL/unit assertions. This does not implement Slice 2 image lifecycle/server/UI/E2E work. |

## Bounded correction: authenticated inventory RPC caller

- Review lineage: `admin-products-unified-remediation-slice1-v2` (generation 1)
- Corrected findings: `R1-001`, `R3-001`, and `R4-001`
- Scope: only `ajustarEstoque`'s RPC boundary; image lifecycle, UI, migrations, SQL harness, and E2E remain unchanged.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | `npx vitest run --config /tmp/asados-estoque-vitest.config.mjs tests/unit/estoque-action.test.ts` exited 1 before the action change: the old action still requested `createAdminClient`, so the session-client RPC spy was never called. |
| GREEN | The focused command now exits 0: 1 file, 7 tests passed. The compatibility mock proves `ajustarEstoque` calls `ajustar_estoque_atomico` with only `p_produto_id`, `p_quantidade`, `p_tipo`, and `p_motivo`; it sends no `p_usuario_id` and does not call `createAdminClient`. |
| REFACTOR | Reused the authenticated client already used by the active admin/supervisor authorization check, preserving defense in depth while allowing PostgreSQL `auth.uid()` to resolve from the request cookie JWT. |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused action test | `npx vitest run --config /tmp/asados-estoque-vitest.config.mjs tests/unit/estoque-action.test.ts` — exit 0; 1 file, 7 tests passed. |
| Inventory migration test | `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts` — exit 0; 1 file, 6 tests passed. |
| Runtime SQL harness | `docker exec -i supabase_db_Asados psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_products_inventory_hardening.sql` — blocked: Docker daemon socket was unavailable, including after approved unsandboxed retry. |
| Rollback boundary | Revert only the `ajustarEstoque` session-client RPC call and its unit coverage; no image lifecycle, UI, migration, or SQL harness behavior is included. |

### Remaining Slice 2 work

Tasks 2.1 and 2.2 remain unchecked because image lifecycle tests and implementation are intentionally outside this correction. The four-argument caller migration is complete as the minimal deployment-safety subset.

## Bounded correction: deployment rollback bridge

| Step | Evidence |
|---|---|
| RED | `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts` failed first because the five-argument signature had no `service_role` bridge. |
| GREEN | The legacy signature is now a `SECURITY DEFINER`, empty-`search_path` wrapper granted only to `service_role`; it sets the legacy actor claim and delegates to the official authenticated four-argument RPC. |
| Verify | The focused migration test passed 6/6; `tests/unit/estoque-action.test.ts` passed 7/7 and `npx tsc --noEmit` passed. The SQL harness checks the grants and exercises the bridge as `service_role`, but Docker was unavailable locally. |

The bridge is not an application path: `anon`, `authenticated`, and `PUBLIC` have no `EXECUTE`; the caller continues to use only the four-argument request-session RPC. After a successful caller rollout, run a contraction migration that revokes the bridge from `service_role` and drops `ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)`.

## Explicit remediation work unit: service-role bridge and deferred contraction

- Lineage context: `admin-products-unified-remediation-slice1-caller-v3` is terminal escalated and was **not** reopened.
- Scope: correct bridge runtime-harness role expectations; preserve the service-role bridge implementation; add an executable deferred contraction; align Slice 1 planning evidence.
- Out of scope: image lifecycle, UI, E2E, caller action changes, commits, and any workspace outside `/tmp/asados-review-slice1`.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| R1 | `tests/unit/inventory-rpc-migration.test.ts`, `supabase/tests/admin_products_inventory_hardening.sql` | Static unit + local Postgres runtime | Focused Vitest could not start: this isolated worktree has no `node_modules/.bin/vitest` or `tsc`; `npx vitest` timed out after 45s because the package runner could not resolve/download dependencies. | Added the focused assertions before the harness/artifact change. Against the pre-GREEN state the test required a `service_role` bridge probe and a missing contraction file, so it would fail on the old authenticated-only expectation and absent artifact. | Harness now checks direct PUBLIC ACL absence, anon/authenticated denial, and executes the five-argument bridge as `service_role` without a caller JWT; static SQL validation passed. | Covers bridge denial for PUBLIC/anon/authenticated, service_role bridge execution, and the separate authenticated official path. | Documented why the bridge sets a transaction-local claim: service_role has no end-user JWT and the official function must remain auth.uid()-bound. |
| R2 | `tests/unit/inventory-rpc-migration.test.ts`, `supabase/contractions/20260712_admin_products_inventory_rpc_bridge.sql` | Static unit + deferred SQL artifact | N/A: new artifact | The test referenced the absent deferred artifact before it was created. | Added an executable `BEGIN`/`COMMIT` contraction outside `supabase/migrations/`; it guards the official/legacy signatures, revokes the legacy bridge, and drops only the five-argument signature. Static SQL validation passed. | The artifact asserts the official signature exists and refuses an already-absent legacy signature; the unit contract rejects any drop of the official signature. | `supabase/contractions/README.md` makes the non-auto-applied convention and promotion gate explicit. |
| R3 | OpenSpec design/tasks/apply-progress | Documentation | N/A | N/A | Design, tasks, and this progress file now describe the actual expand-contract sequence and exact manual promotion gate. | N/A | Kept the change limited to Slice 1 remediation; later Slice work remains unchecked. |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused Vitest | Blocked: `./node_modules/.bin/vitest` is absent (exit 127). `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs --pool=forks --maxWorkers=1 --minWorkers=1 tests/unit/inventory-rpc-migration.test.ts` produced no test output and timed out after 45s while dependency resolution was unavailable. |
| TypeScript | Blocked: `./node_modules/.bin/tsc --noEmit` is absent (exit 127); no dependency installation was attempted in this isolated remediation unit. |
| SQL runtime harness | Blocked: `docker info` exit 1: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` (socket missing). `supabase test db --local supabase/tests/admin_products_inventory_hardening.sql` exit 1 for the same unavailable daemon. |
| Static SQL validation | Passed: a local lexical SQL validator checked the migration, runtime harness, and deferred contraction for balanced comments/strings/dollar quotes plus the service_role claim, PUBLIC ACL, legacy-only drop, official-signature preservation, and absence from `supabase/migrations/`. |
| Rollback boundary | Revert only the bridge comment/harness assertions, `tests/unit/inventory-rpc-migration.test.ts`, `supabase/contractions/`, and the aligned OpenSpec artifacts. The official four-argument RPC, current caller, and all later Slice work remain untouched. |

## Corrective rerun: legacy bridge ACL predicate

- Scope: corrected only the five-argument legacy bridge ACL assertion in `supabase/tests/admin_products_inventory_hardening.sql` and recorded this evidence. The migration contract remains unchanged: `service_role` only.
- Change: the harness now raises when `authenticated` **has** `EXECUTE` on `public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)`, alongside the existing `anon` denial. It no longer raises merely because `authenticated` lacks that privilege.

### Correction evidence

| Evidence | Exact result |
|---|---|
| Focused migration static suite | `npx vitest run --config /tmp/asados-inventory-vitest.config.mjs tests/unit/inventory-rpc-migration.test.ts` — exit 0; 1 file, 8 tests passed. No source test assertion was changed because this remediation work unit permits edits only to the SQL harness and this progress record. |
| Focused action suite | The supplied `/tmp/asados-estoque-vitest.config.mjs` targeted `/home/wilkin/proyectos/Asados` and failed in this worktree because its setup file path was not available through Vitest's `/@fs` resolution (exit 1, no tests). A temporary target-worktree equivalent at `/tmp/asados-review-slice1-estoque-vitest.config.mjs` then ran `tests/unit/estoque-action.test.ts` successfully — exit 0; 1 file, 7 tests passed. |
| TypeScript | `npx tsc --noEmit` — exit 0. |
| SQL runtime harness | Blocked: `docker info` — exit 1; Docker daemon socket `/var/run/docker.sock` is unavailable. The SQL harness was not run. |
| Rollback boundary | Revert the ACL predicate in `supabase/tests/admin_products_inventory_hardening.sql` and this evidence section only. |

## Slice 2: authenticated image lifecycle

- Delivery: stacked-to-main PR 2; tasks 2.1–2.3 complete.
- Scope: versioned upload/compensation, durable cleanup retry, and its narrow persistence migration. Slice 3/4 were not started.

### TDD Cycle Evidence

| Task | Test file | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|
| 2.1 | `tests/unit/estoque-action.test.ts` | Added lifecycle expectations before production changes; focused run exited 1 with 4/11 failures because the old action used `createAdminClient` and stable paths. | Focused run exits 0: 11/11. | Covers success, persist-failure compensation, old-asset cleanup, cleanup-pending recording, and failed retry bookkeeping. | Shared immutable-path, cleanup-recording, and per-slot lock helpers keep branches narrow. |
| 2.2 | Same + `20260713110019_admin_product_image_lifecycle.sql` | Same failing action cases. | Session-bound Storage uploads use immutable paths and the authenticated RPC changes only image columns; the migration adds durable pending cleanup records and narrowly granted role-checked RPCs. | Previous paths are never sent by the client; they are returned by the locked persistence RPC and are the only old assets scheduled for deletion. | `upsert: false` prevents a retry from overwriting a prior version. |
| 2.3 | Same | Same failing action cases. | Focused unit test and TypeScript check pass. | Revalidation is asserted on successful image persistence; failed persistence does not revalidate. | Per-product/slot promise locks serialize in-process operations; database `FOR UPDATE` serializes the authoritative row update. |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test | `npx vitest run --config /tmp/asados-estoque-vitest.config.mjs tests/unit/estoque-action.test.ts` — exit 0; 1 file, 11 tests passed. |
| Type check | `npx tsc --noEmit` — exit 0. |
| Build | `npm run build` — blocked by sandbox-denied `.env` read and a concurrently locked `.next/standalone/.env` (`EACCES`, then `EBUSY`); no application build failure was reached. |
| Runtime SQL / browser | Blocked: Docker is unavailable (`/var/run/docker.sock` does not exist), so local Supabase migration/RLS runtime checks cannot run. Browser/catalog verification is Slice 4 E2E and was not started; public catalog code was untouched and the existing public Storage SELECT policy remains unchanged. |
| Rollback boundary | Revert only `src/app/actions/estoque.ts`, `tests/unit/estoque-action.test.ts`, `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql`, and these Slice 2 artifact updates. Referenced immutable assets remain intact; pending cleanup records preserve retry observability. |

## Slice 2 corrective rerun: durable legacy cleanup persistence

- Scope: only Slice 2 action, focused tests, lifecycle migration, and OpenSpec evidence. Slice 3/4 and review lifecycle were not started.
- Result: cleanup retry persistence now accepts only product-bound historical stable paths (`prod_<produto-id>[_2]_{full,thumb}.webp`) or current immutable paths with canonical UUID versions. A cleanup-record write failure is returned as `LIMPEZA_PENDENTE_NAO_PERSISTIDA`; the action does not report `cleanup_pending: true` without a durable record. The already-persisted replacement is revalidated, and no prior product metadata is deleted.

### Corrective TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added a legacy-path cleanup regression, a cleanup-recorder-failure regression, and static migration-contract assertions. `npx vitest run --config /tmp/asados-estoque-vitest.config.mjs tests/unit/estoque-action.test.ts` exited 1: 2 of 13 tests failed because the action reported `cleanup_pending: true` after recorder failure and SQL still accepted null slots/non-canonical versions while rejecting legacy paths. |
| GREEN | The same focused command exited 0: 1 file, 13 tests passed. It verifies durable legacy cleanup arguments, honest recorder failure semantics, canonical UUID SQL contract, and non-null slot validation. |
| REFACTOR | `recordPendingImageCleanup` now returns the persistence error to its caller; all cleanup branches propagate it instead of swallowing it. The SQL allowlist is limited to the two historical names for the target product and canonical UUID-versioned objects under that product. |

### Corrective Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npx vitest run --config /tmp/asados-estoque-vitest.config.mjs tests/unit/estoque-action.test.ts` — exit 0; 1 file, 13 tests passed. |
| Type check | `npx tsc --noEmit` — exit 0. |
| Docker probe | `/var/run/docker.sock` is absent. `docker info` could not run through the sandbox wrapper (`bwrap` mount-target error), so no migration/RLS/Storage runtime probe was attempted. |
| Concurrency coverage | Not added: a real Storage/RPC runtime is unavailable locally, and synthetic concurrency mocks would not prove the database/Storage boundary. Existing per-slot in-process locking and SQL `FOR UPDATE` remain unchanged. |
| Rollback boundary | Revert only `src/app/actions/estoque.ts`, `tests/unit/estoque-action.test.ts`, `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql`, `tasks.md`, and this evidence section. |

## Slice 2 corrective rerun: NULL cleanup-path rejection

- Scope: only the lifecycle migration, the focused SQL-contract test, and Slice 2 progress/task evidence. No application source, Slice 3/4, staging, commit, reset, or review lifecycle work was performed.
- Root cause: PostgreSQL's three-valued logic makes both regex predicates evaluate to `NULL` for a `NULL` `v_path`; the previous `IF` condition therefore did not enter its rejection branch.
- Result: `registrar_limpeza_imagem_pendente` now rejects `v_path IS NULL` explicitly while retaining the product-bound legacy and canonical UUID-versioned path allowlists.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| 2.1–2.3 corrective regression | `tests/unit/estoque-action.test.ts` | Unit/static SQL contract | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 13/13 passed before editing | Added the explicit `if v_path is null or` contract assertion first; focused test exited 1 with 1/13 failed because the migration had no NULL guard. | Added the minimal `v_path is null or (...)` rejection; focused test exited 0; 13/13 passed. | The same contract asserts canonical UUID-versioned paths and product-bound legacy paths remain allowlisted, while the new assertion proves the separate NULL branch. | No refactor needed beyond grouping the two regex predicates so the explicit NULL guard is evaluated first. |

### Corrective Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused RED | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 1; 1 file, 1/13 failed on missing `if v_path is null or` guard. |
| Focused GREEN | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 13/13 passed. |
| Type check | `npx tsc --noEmit` — exit 0. |
| Runtime SQL / Docker | N/A locally: Docker is unavailable to this executor; `/var/run/docker.sock` is absent. No Docker runtime execution was claimed or attempted. |
| Rollback boundary | Revert only the NULL guard in `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql`, the focused assertion in `tests/unit/estoque-action.test.ts`, and this Slice 2 documentation update. |

## Slice 2 targeted runtime remediation: valid prior-image return

- Scope: only targeted Slice 2 runtime-remediation evidence in this file and `tasks.md`; migration, tests, and source were not edited. Slice 3/4, review lifecycle, staging, commits, and resets were not started.
- Root cause: in PL/pgSQL, `full` and `thumb` are output parameters generated by `RETURNS TABLE`; assigning to `full := ...` in this function did not compile in the host Docker migration probe.
- Result: `substituir_imagem_produto` now uses `RETURN QUERY SELECT v_previous_full AS full, v_previous_thumb AS thumb`, returning exactly the locked prior pair while retaining the function signature and row update contract.

### Corrective TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| 2.1–2.3 targeted migration return regression | `tests/unit/estoque-action.test.ts` | Unit/static PostgreSQL implementation contract | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 13/13 passed before editing | Added the explicit `RETURN QUERY SELECT` assertion before changing SQL; focused test exited 1 with 1/14 failed because the migration used `full :=`, `thumb :=`, and `RETURN NEXT`. | Replaced those assignments with the explicit prior-value query; focused test exited 0; 14/14 passed. | The regression asserts both returned aliases (`full` and `thumb`) and separately rejects output assignments and `RETURN NEXT`, preventing a one-column or invalid-pattern substitute. | No extra refactor: the minimal query return preserves the existing `RETURNS TABLE(full text, thumb text)` API. |

### Corrective Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused RED | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 1; 1 file, 1/14 failed on the missing `RETURN QUERY SELECT` pattern. |
| Focused GREEN | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 14/14 passed. |
| Type check | `npx tsc --noEmit` — exit 0. |
| Host Docker transaction | Applied `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql` successfully, emitted all `CREATE FUNCTION` statements, then rolled back successfully. Compile success is explicit. |
| Runtime return-pair probe | Reached `substituir_imagem_produto` but was rejected with `CAMINHO_IMAGEM_INVALIDO` for canonical `full.webp` and `thumb.webp` paths; no runtime return-pair success is claimed. |
| Regex defect probe | Direct comparison proved the migration's `full\\.webp` SQL regex string does not match the canonical `full.webp` path, while the single-backslash regex does. Record as an unapproved adjacent image-path validation risk/blocker only; do not fix in Slice 2. |
| Rollback boundary | Revert only the explicit return query in `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql`, its focused test assertion in `tests/unit/estoque-action.test.ts`, and this Slice 2 documentation update. |

## Slice 2 targeted correction: canonical image-path regex escaping

- Scope: only the lifecycle migration, its focused SQL-contract test, and Slice 2 task/progress evidence. No application source, Slice 3/4, Docker runtime, staging, commit, reset, or Gentle AI review was performed.
- Root cause: ordinary PostgreSQL string literals preserve backslashes, so the doubled `\\\\.webp` source sequence passed two backslashes to the POSIX regex engine. That regex expects a literal backslash before any character and rejects canonical `.webp` object names.
- Result: changed the `.webp` literal-dot escapes from doubled to single backslashes in both `substituir_imagem_produto` full/thumb validation and `registrar_limpeza_imagem_pendente` canonical/legacy cleanup validation. The explicit `v_path IS NULL` rejection remains unchanged.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| 2.1–2.3 targeted regex regression | `tests/unit/estoque-action.test.ts` | Unit/static PostgreSQL SQL contract | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 14/14 passed before editing | Added the exact single-backslash source assertions and canonical full/thumb, legacy full/thumb, and malformed-path cases first; focused test exited 1 with 1/15 failed because SQL contained `\\\\.webp`. | Replaced only the four affected regex escapes; focused test exited 0; 15/15 passed. | Canonical paths cover both slots and full/thumb names; cleanup coverage accepts both legacy naming variants and rejects a non-UUID arbitrary version path. | No refactor beyond applying the same literal-dot correction consistently to both RPC validators. |

### Corrective Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused RED | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 1; 1 file, 1/15 failed because the migration did not contain the required single-backslash `.webp` source pattern. |
| Focused GREEN | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 15/15 passed. |
| Type check | `npx tsc --noEmit` — exit 0. |
| Runtime SQL / Docker | Not run by this executor: only the parent has the Docker socket. No Docker runtime acceptance claim is made. |
| Rollback boundary | Revert only the four `.webp` escape corrections in `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql`, the focused regression in `tests/unit/estoque-action.test.ts`, and this Slice 2 documentation update. |

### Parent host runtime verification

The parent orchestrator executed the migration and image-lifecycle probes against `supabase_db_Asados` inside a single `BEGIN`/`ROLLBACK` transaction. PostgreSQL compiled all five functions; canonical versioned full/thumb paths were accepted; `substituir_imagem_produto` returned the exact legacy prior-image pair; mixed legacy/versioned cleanup paths persisted; and both `NULL` and arbitrary cleanup paths were rejected with `CAMINHO_IMAGEM_INVALIDO`. The command exited 0 and rolled back all schema and fixture changes.

## Slice 2 disposable hosted operational validation — blocked

- Scope: approved non-production validation only. No production project (`xvzdxoktwnzmxsfizkxo`), source file, migration, fixture, or Slice 3/4 work was changed.
- Preflight: the `asados-readonly-validation` profile successfully listed the authorized organization `jhbbteibaxcvwnjlkfvf`; CLI help confirms it exposes `projects create` and `projects delete`.
- Blocker: hosted project provisioning was attempted with an ephemeral generated database password and failed before a project reference was allocated. Supabase reported: `The following organization members have reached their maximum limits for the number of active free projects within organizations where they are an administrator or owner: wilkinbarban (2 project limit).`
- Required external action: delete, pause, or upgrade an existing project for `wilkinbarban`, then rerun the disposable-project validation. Do not use or mutate the production project as a substitute.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Slice 2 disposable hosted lifecycle validation | External Supabase project/Storage/RPC harness | Hosted integration | N/A — no repository source was modified | N/A — no production change is permitted in this operational-validation work unit | Blocked before the isolated environment existed | N/A — no fixture could be created | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | Blocked before test execution: an external disposable Supabase project is required to exercise the real hosted Auth/RLS/Storage boundary. No source was changed, so `npm run test:unit` was not rerun. |
| Runtime harness command/scenario | `npx --yes supabase projects create "asados-slice2-validation-20260713" --org-id jhbbteibaxcvwnjlkfvf --db-password "[ephemeral-generated-secret]" --region sa-east-1 --profile asados-readonly-validation --output json` — exit 1. Provisioning failed with the active-free-project limit before project creation, migration application, fixture creation, or any production access. |
| Rollback boundary | No remote rollback is required: no disposable project reference, schema mutation, object, fixture, or user was created. Revert only this evidence section if the attempt record must be removed. |

## Slice 2 disposable hosted operational validation — resumed safely, blocked by missing baseline

- Scope: non-production only. The production project was not linked, queried, or mutated.
- Disposable project reference: `fepzqpggbroioaxxggnb` (created for this attempt and deleted by the cleanup trap after the first migration failed).
- Preflight: the profile listed only the protected production project before and after the attempt. The required focused unit suite passed before remote work.
- Result: the project was linked only from an ephemeral `/tmp` work directory with an in-memory generated database password. Applying `20260712164546_admin_products_authenticated_inventory_rpc.sql` failed at its first dependency because a newly provisioned project has no application baseline: `ERROR: 42704: type "public.tipo_movimentacao" does not exist`.
- Safety stop: no second migration, fixture identity, product, Storage object, or lifecycle RPC call was attempted. The cleanup trap deleted the disposable project; a final project listing contains only `xvzdxoktwnzmxsfizkxo`.
- Required next action: provide a disposable target preloaded with the non-Slice-1/2 application baseline, or explicitly approve a separate baseline-bootstrap procedure. This work unit cannot apply **only** the two approved migrations to an empty hosted project because the first migration depends on pre-existing application types, tables, functions, and the Storage bucket.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Slice 2 hosted disposable lifecycle validation | `tests/unit/estoque-action.test.ts` + hosted Supabase harness | Unit + hosted integration | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 18 tests passed | N/A — no production code changed | Unit safety net passed; hosted GREEN blocked before the first migration could establish its required dependencies | N/A — no valid isolated schema existed for runtime scenarios | N/A — no repository code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 18 tests passed. |
| Runtime harness command/scenario | Ephemeral project creation, link from `/tmp/asados-slice2-validation.*`, then `supabase db query --linked --file supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql` — exit 1: `ERROR: 42704: type "public.tipo_movimentacao" does not exist`. The second approved migration was not run. |
| Cleanup verification | The shell `EXIT` trap deleted `fepzqpggbroioaxxggnb`; `supabase projects list --profile asados-readonly-validation --output-format json` afterward returned only the protected production project. |
| Rollback boundary | No schema, Auth, product, or Storage mutation survived. The disposable project itself was deleted; revert only this evidence section if its audit record must be removed. |

## Slice 2 disposable hosted lifecycle validation — scope-contamination safety stop

- Scope: explicitly approved disposable baseline bootstrap and hosted lifecycle validation only. No repository source, Git state, production project (`xvzdxoktwnzmxsfizkxo`), Slice 3, or Slice 4 was changed.
- Focused strict-TDD safety net: `npm run test:unit -- tests/unit/estoque-action.test.ts` exited 0 with 1 file and 18 tests passed before hosted work.
- A uniquely named disposable project (`ihxlkkymkbjnlbkgpjjv`) was created in `sa-east-1`, linked only from a generated `/tmp/asados-slice2-validation.*` workspace, and the workspace contained exactly the eight approved migration files: `20260703210000`, `20260704140000`, `20260704170000`, `20260705010000`, `20260708000000`, `20260708160000`, `20260712164546`, and `20260713110019`. `seed.sql` was not copied or run.
- The migration command reported only the final lifecycle migration, then `supabase migration list --workdir <ephemeral-workspace> --linked` showed remote history entries outside the approved subset (`20260704150000`, `20260704160000`, `20260705000000`, `20260707000000`, `20260707180000`, `20260709210602`, `20260710155007`, `20260711144706`, `20260711155000`, `20260712194500`, `20260712200000`, `20260712210000`, and `20260712210500`). This proves the hosted migration operation did not preserve the required reviewed-subset boundary.
- Safety stop: preflight query happened after the contaminated migration history and confirmed the baseline objects existed (`tipo_movimentacao`, `produtos`, `produto-imagens`, and `gen_random_uuid()`); it did not create fixtures or exercise Auth, RLS, Storage, or lifecycle RPCs. No retry was attempted.
- Cleanup: the disposable project was deleted with `supabase projects delete ihxlkkymkbjnlbkgpjjv --profile asados-readonly-validation --yes`; the final project list returned only protected production reference `xvzdxoktwnzmxsfizkxo`. The ephemeral workspace and generated database password were removed from the executor environment.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Slice 2 hosted disposable lifecycle validation | `tests/unit/estoque-action.test.ts` + hosted Supabase harness | Unit + hosted integration | `npm run test:unit -- tests/unit/estoque-action.test.ts` — 18/18 passed | N/A — no production code changed | Blocked: migration history escaped the approved subset before hosted scenario setup | N/A — no valid scoped hosted schema remained | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 18 tests passed. |
| Runtime harness | `supabase db push --workdir <ephemeral-workspace> --linked --include-all` completed, but subsequent migration history included 13 versions outside the eight approved migrations. Validation stopped before fixture setup. |
| Preflight | Hosted query returned `tipo_movimentacao`, `produtos`, `produto_imagens_bucket=true`, and `uuid_available=true`; required Auth/Storage role, grant, RLS, replacement, compensation, cleanup retry, and unauthorized-role scenarios were not run because their prerequisite scope boundary failed. |
| Cleanup/project deletion | Deleted disposable `ihxlkkymkbjnlbkgpjjv`; final profile project list contains only `xvzdxoktwnzmxsfizkxo`. No fixtures, objects, users, or sessions were created, so no per-fixture cleanup remained. |
| Rollback boundary | No repository change beyond these SDD artifacts. All disposable remote schema history disappeared with the deleted project; production was never linked, queried, or mutated. |

### Concrete blocker

`supabase db push` did not retain the approved eight-migration workspace boundary: the disposable remote history contained unreviewed migration versions. A hosted lifecycle validation cannot continue safely until the migration command is isolated and independently proven to apply only the reviewed subset.

## Slice 2 manifest-pinned disposable hosted validation — preflight safety stop

- Scope: explicitly authorized disposable hosted validation only. No production project (`xvzdxoktwnzmxsfizkxo`), application source, Git state, Slice 3, or Slice 4 was changed.
- Strict-TDD safety net: `npm run test:unit -- tests/unit/estoque-action.test.ts` exited 0; 1 file and 18 tests passed.
- Before remote migration work, all eight approved source hashes passed with `sha256sum --check --strict`. The created disposable project was `kholgjudejxkxzrkkuqi`, was distinct from production, and reached `ACTIVE_HEALTHY`.
- Required read-only preflight connected to the disposable owner database and correctly rejected it with `ERROR: missing_supabase_realtime`. The plan requires `supabase_realtime` to exist before the dependency closure is run because the selected chat migration conditionally creates it. The transaction was rolled back.
- Safety stop: the direct fixed eight-`\i` `psql --single-transaction` command was never started. Consequently, no migration, migration-history entry, postflight object, grant, RLS policy, Auth fixture, Storage object, lifecycle RPC, replacement, compensation, cleanup retry, or unauthorized-role scenario was run.
- Cleanup: the trap removed the empty temporary workspace, deleted disposable `kholgjudejxkxzrkkuqi`, and verified the profile listing contains only protected production `xvzdxoktwnzmxsfizkxo`. No fixture-specific cleanup was necessary because preflight stopped before fixture creation.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Slice 2 manifest-pinned hosted lifecycle validation | `tests/unit/estoque-action.test.ts` + hosted Supabase preflight | Unit + hosted integration | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 18/18 passed | N/A — no repository production code changed | Blocked before direct migration execution by the required hosted-baseline guard | N/A — no valid scoped hosted schema existed | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 18 tests passed. |
| Manifest validation | `sha256sum --check --strict` over the eight approved paths — exit 0; 8/8 SHA-256 entries passed. |
| Runtime harness command/scenario | Owner-session read-only `psql` preflight on disposable `kholgjudejxkxzrkkuqi` — exit 3: `ERROR: missing_supabase_realtime`. This was the required guard before the static eight-include direct `psql --single-transaction` command; that mutation command was not started. |
| Cleanup/project deletion | The `EXIT` trap deleted `kholgjudejxkxzrkkuqi`, removed the temporary workspace, and verified only production `xvzdxoktwnzmxsfizkxo` remained in the profile listing. |
| Rollback boundary | No remote schema or fixture mutation survived because migration execution never began. Revert only this evidence section and the matching task note if the audit record must be removed. |

### Concrete blocker

A newly provisioned hosted project did not satisfy the approved baseline precondition: `supabase_realtime` was absent. Do not bypass the guard or substitute production. A renewed manifest-pinned validation requires an explicitly approved disposable baseline that already provides this schema, or an updated approved manifest/preflight plan that explains the safe dependency treatment.

## Slice 2 manifest-pinned disposable hosted validation — corrected preflight retry blocked by pinned migration

- Scope: explicitly authorized disposable hosted validation only. No production project (`xvzdxoktwnzmxsfizkxo`), application source, Git state, Slice 3, or Slice 4 changed.
- Strict-TDD safety net: `npm run test:unit -- tests/unit/estoque-action.test.ts` exited 0; 1 file and 18 tests passed before remote work.
- Disposable `stiriejvmlncasdpycxz` was created with profile `asados-readonly-validation`, differed from production, and reached `ACTIVE_HEALTHY`. The profile listing before and after contained only production apart from this temporary project.
- Manifest validation passed all eight approved SHA-256 entries. Owner preflight returned `auth=true`, `storage=true`, `gen_random_uuid()=true`, `schema_migrations absent=true`, and `supabase_realtime publication present=true`. Publication presence was recorded, not required.
- The exact fixed eight-include owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` command began. The historical chat migration safely retained the publication and registered `public.conversas` and `public.mensagens`. The transaction then failed at `20260712164546_admin_products_authenticated_inventory_rpc.sql:5`: `ERROR: function public.ajustar_estoque_atomico(uuid, integer, tipo_movimentacao, text, uuid) does not exist`.
- Cause: the pinned Slice 1 migration unconditionally revokes privileges from the legacy five-argument function, but the exact eight-file fresh baseline does not define that signature. `--single-transaction` rolled back every migration statement. No postflight, fixture/user/session, hosted Storage upload/replacement, persistence-failure compensation, cleanup retry/completion, or unauthorized-denial scenario was run.
- Cleanup trap deleted the temporary project. Final CLI listing confirmed only protected production `xvzdxoktwnzmxsfizkxo` remains.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Slice 2 corrected manifest-pinned hosted lifecycle validation | `tests/unit/estoque-action.test.ts` + hosted Supabase harness | Unit + hosted integration | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 18/18 passed | N/A — no repository production code changed | Blocked: the pinned migration transaction rolled back on the absent legacy function before lifecycle fixtures | N/A — no valid scoped hosted schema existed | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 18 tests passed. |
| Manifest validation | `sha256sum --check --strict` over the eight approved paths — exit 0; 8/8 SHA-256 entries passed. |
| Runtime harness command/scenario | Owner-session preflight on disposable `stiriejvmlncasdpycxz` recorded `supabase_realtime=true`; exact static eight-include `psql --single-transaction` then exited non-zero at pinned migration `20260712164546...:5` with missing five-argument `ajustar_estoque_atomico`. The transaction rolled back. |
| Fixture and project cleanup | No fixtures were created. The shell trap deleted `stiriejvmlncasdpycxz`; the final profile listing contains only production `xvzdxoktwnzmxsfizkxo`. |
| Rollback boundary | The migration transaction rolled back in full and the disposable project was deleted. Revert only this evidence section and the matching task note; no source or Git change exists. |

### Concrete blocker

The immutable eight-file manifest cannot establish the Slice 1 legacy rollback bridge on a fresh disposable baseline because `20260712164546_admin_products_authenticated_inventory_rpc.sql` assumes a pre-existing five-argument function not supplied by the approved closure. Do not retry or patch the pinned file in place. Resume only after approval of a manifest revision that safely handles the absent function (for example, an idempotent existence guard with a newly pinned hash) or a disposable baseline that contains the exact legacy signature.

## Slice 2 nine-file manifest-pinned hosted validation — partial operational result

- Scope: disposable hosted validation only; no production project (`xvzdxoktwnzmxsfizkxo`), source file, Slice 3/4 item, or Git state was changed.
- Safety net: `npm run test:unit -- tests/unit/estoque-action.test.ts` exited 0; 1 file and 18 tests passed before remote work.
- The approved nine SHA-256 entries passed on each disposable attempt. The direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` command contained only the nine approved absolute includes, in the documented order, including `20260711144706_admin_products_inventory_hardening.sql`.
- The nine-file transaction completed successfully on disposable projects. Postflight verified the four-argument RPC, the five-argument service-role-only bridge, RLS, Storage bucket/policies, and `supabase_realtime` registrations for `public.conversas` and `public.mensagens`; no migration-history table was created.
- A first actual hosted fixture run successfully created isolated Auth users/sessions, performed authenticated Storage uploads and a replacement RPC, created and retried a pending cleanup, completed cleanup, and exercised a rejected persistence path. Its final object-absence assertion incorrectly expected public-download HTTP `404`; the Storage API deletion itself returned success, but the public endpoint returned `400` for the intentionally minimal fixture bytes. The project trap deleted the entire disposable environment.
- The retry harness stopped without an actionable diagnostic before its final completion marker. Every temporary project was deleted by its trap. A final profile listing contains only protected production `xvzdxoktwnzmxsfizkxo`.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Slice 2 nine-file hosted operational validation | `tests/unit/estoque-action.test.ts` + hosted Auth/Storage/RPC harness | Unit + hosted integration | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 18/18 passed | N/A — no production code changed | Partial: migration/postflight passed; fixture harness did not reach a final all-scenario receipt | Replacement, retry, and rejection paths began on isolated hosted projects | N/A — no production code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/estoque-action.test.ts` — exit 0; 1 file, 18 tests passed. |
| Manifest and direct migration | `sha256sum --check --strict` — exit 0; 9/9. Fixed direct `psql --single-transaction` executed only the nine approved includes and committed successfully. |
| Hosted runtime harness | Partial. Isolated actual Storage upload/replacement, cleanup-pending/retry/completion, and rejection primitives ran; the harness needs corrected diagnostic handling before it can issue the required complete scenario receipt. |
| Cleanup receipt | Disposable refs `iyozflkuoitzdlvzzvox`, `rmdbsfsnrnrbjinxayxo`, `efbiefsdvklxoswoallj`, and `vmsobjkqildijeguwyng` were deleted. Final profile listing contains only `xvzdxoktwnzmxsfizkxo`. |
| Rollback boundary | No repository source change. All remote schema, users, sessions, fixtures, and Storage objects were removed by explicit fixture deletion where reached and by disposable-project deletion in every attempt. |

## Corrective hosted fixture receipt retry — incomplete

- Scope remained limited to the approved disposable nine-migration closure. Production `xvzdxoktwnzmxsfizkxo`, application source, Git state, and Slice 3/4 were not touched.
- Strict-TDD safety net: `npm run test:unit` exited 0; 29 files and 154 tests passed.
- Two disposable attempts were stopped before the direct transaction by harness-manifest transcription errors; both projects were deleted by their cleanup traps. A third disposable project completed all nine SHA-256 checks and the exact direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` closure.
- Third-attempt postflight passed: migration history remained absent, `substituir_imagem_produto(uuid, integer, text, text)` existed, and `supabase_realtime` had both `conversas` and `mensagens` registrations.
- The receipt is still incomplete: fixture creation did not begin because the harness's local `jq` key-selection expression had a syntax error while extracting disposable-only API keys. No Auth user/session, product, Storage object, lifecycle RPC fixture, or authorization probe was created in that attempt. The cleanup trap deleted the project.
- Final profile listing verified exactly one project, protected production `xvzdxoktwnzmxsfizkxo`.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Hosted fixture receipt retry | `tests/unit/estoque-action.test.ts` + disposable hosted harness | Unit + hosted integration | `npm run test:unit` — exit 0; 154/154 | N/A — no production source changed | Partial: nine-file closure and postflight passed; fixture phase did not start | N/A — no fixture state exists | N/A — no source change |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit` — exit 0; 29 files, 154 tests passed. |
| Runtime harness | Third attempt: nine-file `sha256sum --check --strict` passed 9/9; direct `psql --single-transaction` committed; postflight returned `{"history":true,"rpc":true,"realtime":2}`. Fixture receipt blocked before Auth/Storage setup by local `jq` syntax failure. |
| Cleanup | All three retry projects were deleted; final `supabase projects list --profile asados-readonly-validation --output-format json` returned only `xvzdxoktwnzmxsfizkxo`. |
| Rollback boundary | Only disposable projects were created and deleted. No repository code or production data changed. |

## Final isolated hosted fixture attempt — blocked before project allocation

- Scope: the user-authorized final Slice 2 hosted Storage receipt only. Production `xvzdxoktwnzmxsfizkxo`, application source, Git state, Slice 3, and Slice 4 were not touched.
- Strict-TDD safety net: `npm run test:unit` exited 0; 29 files and 154 tests passed.
- The exact nine-file SHA-256 manifest passed 9/9. The revised harness used robust, non-secret key selection (`map(select(.name == "anon")) | .[0].api_key` and the equivalent `service_role` expression), so the prior local `jq` syntax failure was corrected before any fixture step.
- The disposable-project creation command did not return before the executor's 20-minute command deadline; it yielded no project reference. A subsequent profile listing contained exactly protected production `xvzdxoktwnzmxsfizkxo`.
- Therefore no direct `psql` transaction, API-key retrieval from a disposable project, Auth user/session, product, Storage object, cleanup record, or authorization probe occurred. The required hosted Storage retrieval/list/head/object-not-found and cleanup/unauthorized receipts remain incomplete.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Final hosted fixture receipt | `tests/unit/*` + disposable hosted harness | Unit + hosted integration | `npm run test:unit` exit 0; 29 files, 154 tests | N/A — no production source change | Blocked before project allocation; no fixture test can run | N/A | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit` — exit 0; 29 files, 154 tests passed. |
| Runtime harness command/scenario | Nine hashes passed; `supabase projects create` under `asados-readonly-validation` exceeded the 20-minute executor deadline without returning a disposable ref. No migration or fixture command ran. |
| Rollback boundary | No remote fixture state exists. The only confirmed remote state is production-only profile inventory; source and Git were not changed. |

## Final hosted receipt execution — blocked before database access

- Scope: user-authorized disposable project `zoogimuqvcegargvuqpc` only. Production, application source, Git state, and Slice 3/4 were not touched.
- Strict-TDD safety net: `npm run test:unit` exited 0; 29 files and 154 tests passed.
- The approved SHA-256 manifest passed 9/9 entries before any remote operation.
- The disposable project was confirmed `ACTIVE_HEALTHY` and distinct from protected production. However, the supplied direct database connection and publishable key were not available to the executor as process environment variables, `.pgpass`/service configuration, or a secret-safe command-input channel. Supplying them in a command or artifact would violate the explicit no-log/no-file/no-artifact secret constraint.
- No `psql` connection, migration transaction, API request, Auth user/session, product, Storage object, lifecycle RPC, cleanup fixture, or authorization probe was executed. The hosted receipt is therefore not claimed.
- Cleanup: `supabase projects delete zoogimuqvcegargvuqpc --profile asados-readonly-validation --yes --output-format json` reported `Deleted project`; the post-cleanup profile inventory contains only protected production `xvzdxoktwnzmxsfizkxo`.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Final hosted Slice 2 receipt | `tests/unit/*` + disposable hosted harness | Unit + hosted integration | `npm run test:unit` exit 0; 29 files, 154 tests | N/A — no repository production code changed | Blocked before the database/API runtime boundary | N/A | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit` — exit 0; 29 files, 154 tests passed. |
| Manifest validation | `sha256sum --check --strict` over the approved manifest — exit 0; 9/9 entries passed. |
| Runtime harness command/scenario | Blocked before `psql`: no secret-safe process input existed for the user-supplied direct connection and publishable key. No migration or fixture command ran. |
| Cleanup/deletion receipt | `supabase projects delete zoogimuqvcegargvuqpc --profile asados-readonly-validation --yes --output-format json` reported `Deleted project`; immediate `projects list` returned only protected production. |
| Rollback boundary | No fixture or schema state was created. The disposable project was deleted; source and Git were untouched. |

## Final user-authorized nine-file hosted receipt — migration verified, fixture blocked

- Scope: the explicitly authorized disposable project only. Production, application source, Git state, Slice 3, and Slice 4 were not touched.
- Strict-TDD safety net: `npm run test:unit` exited 0; 29 files and 154 tests passed.
- The exact approved SHA-256 manifest passed 9/9 before mutation. Read-only preflight confirmed the managed `auth` and `storage` schemas, UUID support, absence of migration history, and an isolated target distinct from production.
- The fixed direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` command ran exactly the nine approved absolute migration includes and committed. Postflight verified the required tables, RLS, authenticated-only lifecycle and four-argument inventory RPC grants, service-role-only legacy bridge, public image bucket, Realtime publication registrations, and absent migration history.
- The isolated fixture could not establish an Auth session. The hosted Auth API rejected a normal email/password signup as invalid; a direct owner-created, confirmed bcrypt user also could not sign in. The fixture stopped before product creation, Storage upload, replacement, cleanup retry/completion, or unauthorized-denial execution. No system-schema bootstrap or unapproved SQL was attempted.
- Fixture cleanup attempted explicit product/object/user/session removal defensively. The disposable project was then deleted. The profile inventory verified that only protected production remains.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Final hosted Slice 2 receipt | `tests/unit/*` + disposable hosted harness | Unit + hosted integration | `npm run test:unit` exit 0; 29 files, 154 tests | N/A — no repository production code changed | Partial: migration and postflight passed; hosted Auth fixture could not establish a session | N/A — fixture boundary was blocked before the first Storage scenario | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit` — exit 0; 29 files, 154 tests passed. |
| Manifest validation | `sha256sum --check --strict` over the approved manifest — exit 0; 9/9 entries passed. |
| Runtime harness command/scenario | The fixed nine-include direct `psql --single-transaction` committed and postflight passed. Auth session setup then failed before the required retrieval-before-delete, missing-object download/list/HEAD, cleanup pending/retry/completion, and unauthorized Storage/RPC scenarios. |
| Cleanup/deletion receipt | Explicit fixture cleanup was attempted; disposable-project deletion succeeded; final profile inventory contains only protected production. |
| Rollback boundary | The disposable project deletion removes all remote schema and transient fixture state. No source or Git change exists. |

### Concrete blocker

The fresh disposable project's hosted Auth service did not accept a normal signup or a direct confirmed password-user sign-in. A complete receipt requires a newly authorized Auth/bootstrap remediation or a disposable project whose Auth email/password flow is operational. Do not alter managed Auth configuration or retry on production.

## Final hosted Auth/Storage receipt retry — blocked by hosted Auth rate limiting

- Scope: user-authorized disposable project `zdrqbtkutjaiqkhjcofr` only. Production `xvzdxoktwnzmxsfizkxo`, application source, Git state, Slice 3, and Slice 4 were not touched.
- Strict-TDD safety net: `npm run test:unit` exited 0; 29 files and 154 tests passed.
- The approved nine-file SHA-256 manifest passed 9/9. The exact direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` command included only the nine approved absolute migration files and committed. Preflight confirmed Auth/Storage schemas, UUID support, and absent migration history; postflight confirmed absent migration history, lifecycle RPC presence, Realtime publication with two expected registrations, and the public image bucket.
- Supported hosted Auth signup and password sign-in were attempted before any fixture bootstrap action. Both returned HTTP 400; sanitized error classification identified email rate limiting. No session was created. No direct Auth SQL, profile/bootstrap SQL, Auth configuration mutation, product, Storage object, lifecycle call, or unauthorized fixture request was issued.
- Cleanup: no Auth user, session, product, or object existed. The disposable project deletion was confirmed, and the authorized profile inventory subsequently returned `disposable_ref_present=0`; deletion removes the applied validation schema. Credentials were process-only and are not recorded here.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Final hosted Slice 2 Auth/Storage receipt | `tests/unit/*` + disposable hosted harness | Unit + hosted integration | `npm run test:unit` — exit 0; 29 files, 154 tests | N/A — no repository source changed | Partial: manifest, transaction, and postflight passed; supported Auth could not issue a session | N/A — Auth boundary blocked before authorized fixture scenarios | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit` — exit 0; 29 files, 154 tests passed. |
| Manifest validation | `sha256sum --check --strict` over the approved manifest — exit 0; 9/9 entries passed. |
| Runtime harness command/scenario | Disposable-only direct nine-include `psql -X --set=ON_ERROR_STOP=1 --single-transaction` committed. Safe postflight tuple: history absent=1, lifecycle RPC=1, Realtime publication=1, expected registrations=2, public bucket=1. Supported Auth signup and password sign-in both returned HTTP 400; sanitized classification: email rate limiting. |
| Required scenario status | Blocked before session establishment: no authorized WebP upload/retrieval/delete, Storage list/HEAD/not-found, cleanup pending/retry/completion, or unauthorized fixture request can be claimed. |
| Cleanup / deletion receipt | No fixtures were created. Disposable-project deletion was confirmed; authorized profile inventory returned `disposable_ref_present=0`. |
| Rollback boundary | Deleting the disposable project removes the migration closure and all potential fixture state; repository source and Git were untouched. |

### Concrete blocker

Hosted email/password Auth is rate limited on the disposable project. The requested receipt requires a supported authenticated session, but direct Auth/bootstrap SQL and Auth-configuration changes are prohibited. Retry only after the rate limit clears or an explicitly authorized Auth remediation is provided; never use production as a substitute.

## User-authorized disposable Slice 2 hosted receipt — target absent

- Scope: user-authorized disposable hosted receipt execution only. The required target was expected to be `jyfnicpixhejzeekkdzp`; protected production is `xvzdxoktwnzmxsfizkxo`.
- Strict-TDD safety net: `npm run test:unit` exited 0 with 30 files and 160 tests passed.
- Independent preflight used the authenticated `asados-readonly-validation` profile. It returned exactly one active project: protected production `xvzdxoktwnzmxsfizkxo`. The expected disposable reference was absent, so it could not equal production and was not active.
- Safety stop: no launcher was executed, no project was created, no database connection or migration transaction was opened, and no Auth, profile, Storage, lifecycle, or denial fixture action occurred. This prevents the stale-DNS runner from being pointed at an absent or unsafe target.
- Cleanup/deletion receipt: no disposable project or fixture existed for this execution. The final inventory contains only production `xvzdxoktwnzmxsfizkxo`; production was not queried or mutated.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Disposable Slice 2 hosted receipt execution | `tests/unit/*` + hosted Supabase preflight | Unit + hosted integration | `npm run test:unit` — exit 0; 30 files, 160 tests passed | N/A — no repository production code changed | Blocked: approved disposable target is absent before any remote mutation | N/A — no valid disposable target exists | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit` — exit 0; 30 files, 160 tests passed. |
| Runtime harness command/scenario | `npx --yes supabase projects list --profile asados-readonly-validation --output json` — exit 0; exactly one `ACTIVE_HEALTHY` project, `xvzdxoktwnzmxsfizkxo`. No `jyfnicpixhejzeekkdzp` entry was returned. |
| Rollback boundary | No source or remote mutation occurred. No disposable target or fixture state exists to roll back. |

## Final disposable Auth/Storage lifecycle receipt — secret-safe preflight stop

- Scope: user-authorized disposable project only. Production `xvzdxoktwnzmxsfizkxo`, repository source, Git state, Slice 3, and Slice 4 were not touched.
- Strict-TDD safety net: `npm run test:unit` exited 0; 29 files and 154 tests passed.
- The authenticated `asados-readonly-validation` profile listed the disposable project as `ACTIVE_HEALTHY`, distinct from production. CLI help was used to confirm the project-key and deletion commands before use.
- Safety stop: the direct database password was not available through a process-secret channel (`PGPASSWORD` and `.pgpass` were absent). Passing a user-supplied credential through a command, file, or artifact would violate the explicit no-log/no-file constraint. Consequently, no manifest hash check, direct `psql` transaction, API-key revelation, Auth user/session, profile mutation, product, Storage object, lifecycle RPC, or unauthorized probe was issued.
- Cleanup/deletion receipt: `supabase projects delete` completed for the disposable project. The immediate authenticated profile inventory returned exactly one project: protected production `xvzdxoktwnzmxsfizkxo`.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Final disposable Slice 2 Auth/Storage receipt | `tests/unit/*` + hosted Supabase harness | Unit + hosted integration | `npm run test:unit` — exit 0; 29 files, 154 tests | N/A — no repository production code changed | Blocked before the database/API runtime boundary | N/A | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit` — exit 0; 29 files, 154 tests passed. |
| Runtime harness command/scenario | Blocked before `psql`: no secret-safe process input was available for the direct database password. No migration, fixture, or API command ran. |
| Cleanup/deletion receipt | `supabase projects delete svphmtaxiphwejfegoxb --profile asados-readonly-validation --yes` completed; immediate profile listing returned only protected production. |
| Rollback boundary | No remote mutation was initiated. Disposable-project deletion removes the target environment; source and Git were untouched. |

### Concrete blocker

The required direct database credential was supplied conversationally but was not injected as an execution-process secret. A later retry must provide it through a non-logged process-secret mechanism; do not put it in commands, files, OpenSpec, or logs.

## Manual hosted Auth/Storage receipt harness

- Added `scripts/validate-slice2-hosted-receipt.sh`, a user-run-only support harness. It requires environment-only connection/API secrets, refuses production ref `xvzdxoktwnzmxsfizkxo`, validates the nine pinned hashes, and uses direct `psql --single-transaction` for the approved migration closure.
- The harness creates confirmed disposable Auth users through the Admin API, signs in normally, grants only the main fixture an active `admin` profile, validates authenticated WebP retrieval before deletion plus list/GET/HEAD absence, proves cleanup pending/retry/completion and a no-profile denial, and traps fixture/object/session/user cleanup. It never creates or deletes projects; the operator must delete the disposable project after either outcome.
- This artifact was not run against a remote target. When a human runs it against an explicitly acknowledged disposable ref, it applies only the pinned nine-migration closure through direct `psql --single-transaction`; it does not alter Auth configuration/rate limits, use direct `auth` schema SQL, infer secrets, or modify production.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Manual hosted receipt harness | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Unit/static contract | N/A (new files) | File-missing contract test failed: 2/2 | Focused command passed: 2/2 | Secret/production guard and runtime-receipt contract cases | Trap cleanup and secret-safe curl configuration; focused test remained green |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 2 tests passed. |
| Full unit suite | `npm run test:unit` — exit 0; 30 files, 156 tests passed. |
| Static shell check | `bash -n scripts/validate-slice2-hosted-receipt.sh` — exit 0; harness is 203 lines, below the 400-line limit. |
| Runtime harness | Not executed by design: this task must not contact a remote target. |
| Rollback boundary | Revert only `scripts/validate-slice2-hosted-receipt.sh`, `tests/unit/slice2-hosted-receipt-harness.test.ts`, and this section; no application or remote state is affected. |

## Bounded correction: manual Slice 2 hosted receipt harness

- Scope: only `scripts/validate-slice2-hosted-receipt.sh`, `tests/unit/slice2-hosted-receipt-harness.test.ts`, and this progress record. No remote command, credential, production target, Slice 3, or Slice 4 action was executed.
- Result: `storage_upload` now sends the generated 1x1 WebP fixture with `--data-binary "@${WEBP_FILE}"` and `Content-Type: image/webp`. Every curl request uses bounded `--connect-timeout` and `--max-time` values so the cleanup trap can run.
- Target boundary: the harness accepts only an exact 20-letter lowercase Supabase project ref, rejects the protected production ref, derives `https://<ref>.supabase.co` internally, and rejects any arbitrary URL input. It requires `SUPABASE_DISPOSABLE_TARGET_ACK=DELETE:<ref>` before any work, explicitly recording the human acknowledgment that the disposable project will be deleted after the receipt.
- Credential boundary: curl now receives requests, URLs, and headers directly; no secret is interpolated into a parsed curl config file.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Manual hosted receipt harness correction | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Unit/static contract | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 2/2 passed | Added ref/ack/derived-URL/direct-curl and WebP-payload/timeout assertions first; same command exited 1; 2/3 failed | Same command exited 0; 3/3 passed | Separate target-boundary and upload/timeout cases prove distinct security and payload paths | Removed parsed curl config construction; shared bounded curl arguments are explicit in both request paths |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 3 tests passed. |
| Full unit suite | `npm run test:unit` — exit 0; 30 files, 157 tests passed. |
| Static shell check | `bash -n scripts/validate-slice2-hosted-receipt.sh` — exit 0. |
| Runtime harness command/scenario | N/A — deliberately not run: this correction authorizes no remote operation, secret acceptance, production access, or disposable-project mutation. |
| Rollback boundary | Revert only `scripts/validate-slice2-hosted-receipt.sh`, `tests/unit/slice2-hosted-receipt-harness.test.ts`, and this correction section. |

## Local Slice 2 hosted receipt launcher

- Scope: user-authorized local support artifact only. The ignored root launcher supplies the disposable receipt harness's required environment values without terminal copy/paste and retrieves the privileged API key at run time through the authenticated Supabase CLI.
- Safety: the launcher disables shell tracing, contains no echo/log command, is mode `700`, and is ignored by exactly one root `.gitignore` entry. It was not executed; no remote action, production/source behavior, Slice 3/4 work, or Git history changed.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Local launcher | `run-slice2-hosted-receipt.local.sh` | Static shell contract | N/A (new ignored local file) | File-absence contract exited 1 before creation. | `bash -n` exited 0; redacted structural inspection passed. | Checked syntax, required exports/dynamic key retrieval, no-echo boundary, exact ignore count, and executable mode. | None needed; the 15-line launcher is intentionally direct. |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `bash -n run-slice2-hosted-receipt.local.sh` — exit 0. |
| Runtime harness command/scenario | N/A — explicitly not executed; running it would contact a hosted target. |
| Rollback boundary | Delete `run-slice2-hosted-receipt.local.sh` and its one `.gitignore` entry; this removes only local launcher behavior. |

## Bounded correction: hosted receipt capture and initialized-target guard

- Scope: only `scripts/validate-slice2-hosted-receipt.sh`, `tests/unit/slice2-hosted-receipt-harness.test.ts`, and this progress record. No remote command, credential, production target, project lifecycle action, Slice 3, or Slice 4 action was executed.
- Root cause: `psql -At` emitted `INSERT 0 1` command-status lines for the fixture-profile INSERT and the fixture-product INSERT. Command status could therefore be captured with the returned UUID and form an invalid multiline Storage object URL.
- Result: fixture capture now uses `psql -X -qAt` and rejects any value that is not exactly one RFC 4122 UUID before a Storage path, curl request, or cleanup path is formed. Historical migrations remain forward-only and non-idempotent.
- Safety boundary: a quiet read-only pre-migration guard rejects a target where `public.produtos` or `public.perfis` already exists. After any post-migration failure, the operator must delete and recreate the disposable project rather than rerun historical migrations against that initialized target.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Hosted receipt capture and initialized-target guard | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Unit/static shell contract | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 3/3 passed | Added quiet tuple-only UUID capture/validation and initialized-target-before-migration assertions first; focused command exited 1; 2/5 failed. | Same focused command exited 0; 1 file, 5/5 passed. | UUID validation is ordered before Storage path construction; initialized-target invocation is separately ordered before the historical migration transaction. | Extracted `assert_uninitialized_target` to keep the fail-fast boundary explicit; focused test remained green. |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 5 tests passed. |
| Full unit suite | `npm run test:unit` — exit 0; 30 files, 159 tests passed. |
| Shell syntax | `bash -n scripts/validate-slice2-hosted-receipt.sh` — exit 0. |
| Runtime harness command/scenario | N/A — deliberately not run: this bounded correction prohibits remote operations, secret acceptance/storage, production access, project creation/deletion, and hosted mutation. |
| Rollback boundary | Revert only the quiet capture/UUID guard and `assert_uninitialized_target` logic in `scripts/validate-slice2-hosted-receipt.sh`, the two matching static-contract tests, and this section. No historical migration, remote state, or Slice 3/4 behavior is included. |

## Bounded correction: Slice 2 hosted receipt persistence heredoc

- Scope: only `scripts/validate-slice2-hosted-receipt.sh`, `tests/unit/slice2-hosted-receipt-harness.test.ts`, and this progress record. No remote operation, project lifecycle action, production mutation, secret acceptance/storage, or Slice 3/4 work was performed.
- Root cause: the prior persistence update passed `:'old_full'`, `:'old_thumb'`, and `:'product_id'` through `psql -c`, which forwarded the literals instead of expanding the supplied psql variables and caused PostgreSQL to reject the statement.
- Result: the persistence update now supplies the values with `psql -v` and sends the SQL through one single-quoted `<<'SQL'` stdin heredoc. This preserves psql variable expansion while preventing the shell from expanding the SQL body. The focused static contract rejects `-c` for that update.
- Rerun boundary: because this failure occurs after the historical migration transaction has committed, the operator MUST delete the failed disposable target and create a new target before rerunning the harness. Historical migrations remain forward-only and non-idempotent.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Hosted receipt persistence update | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Unit/static shell contract | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 5/5 passed | Added the quoted-heredoc/psql-variable/no-`-c` contract first; focused command exited 1; 1/6 failed because the update used `-c`. | Replaced only the update invocation with `-v` plus `<<'SQL'`; focused command exited 0; 1 file, 6/6 passed. | Skipped: this is one structural command boundary with a single required invocation form; independent assertions cover variable forwarding, literal SQL, and `-c` exclusion. | None needed; the minimal three-line stdin command is clearer than the former shell-quoted `-c` string. |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 6 tests passed. |
| Full unit suite | `npm run test:unit` — exit 0; 30 files, 160 tests passed. |
| Shell syntax | `bash -n scripts/validate-slice2-hosted-receipt.sh` — exit 0. |
| Runtime harness command/scenario | N/A — deliberately not run: this bounded correction prohibits remote operations, project creation/deletion, production access, secret acceptance/storage, and hosted mutation. |
| Rollback boundary | Revert only the persistence-update heredoc in `scripts/validate-slice2-hosted-receipt.sh`, its static contract in `tests/unit/slice2-hosted-receipt-harness.test.ts`, and this section. |

## Autonomous disposable Slice 2 hosted receipt — Auth fixture blocker

- Scope: user-authorized disposable validation only. Production `xvzdxoktwnzmxsfizkxo`, application behavior, Git history, and Slice 3/4 were not touched.
- Delivery: the existing Slice 2 task checkboxes remain complete; this is a hosted evidence attempt for the stacked-to-main Slice 2 boundary, not new application scope.
- Runtime setup: `npx --yes supabase` 2.109.1 command help established `projects create`, `api-keys`, and `delete` syntax. Profile `asados-readonly-validation` created disposable `xwmm…sdbc` in organization `jhbbteibaxcvwnjlkfvf`; it reached `ACTIVE_HEALTHY`. Its generated database password, publishable API key, fixture passwords, and tokens existed only in the execution process and are not recorded.
- Migration: the pinned nine-file SHA-256 manifest passed 9/9. The exact direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` command used only those nine includes and committed. No `db push` command was used.
- Fixture stop: direct disposable `auth.users`/`auth.identities` fixture SQL was used only under the explicit authorization. The subsequent ordinary Auth password-grant sign-in returned HTTP non-success with sanitized body `Database error querying schema`. Therefore no authenticated WebP upload/retrieval/delete/list/HEAD, lifecycle cleanup retry/completion, or denied-role scenario is claimed.
- Cleanup: the EXIT trap deleted the disposable project. Final authenticated profile inventory was exactly the protected production reference; production was never connected or mutated.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Hosted Slice 2 Auth/Storage receipt | `tests/unit/*` + disposable hosted harness | Unit + hosted integration | `npm run test:unit` — exit 0; 30 files, 160 tests passed | N/A — no repository production change | Partial: manifest and transaction passed; normal Auth sign-in could not issue a session | N/A — Auth boundary stopped before authorized fixture scenarios | N/A — no source change |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:unit` — exit 0; 30 files, 160 tests passed. |
| Runtime harness command/scenario | Disposable create → `ACTIVE_HEALTHY` → supported `projects api-keys` runtime detail retrieval → 9/9 checksum validation → direct nine-include owner transaction committed → authorized direct Auth fixture SQL → normal `/auth/v1/token?grant_type=password` sign-in failed with sanitized `Database error querying schema`. |
| Rollback boundary | The disposable project deletion removes the committed migration closure, Auth rows/sessions, profile fixture, and any possible Storage state. No repository production behavior was changed. |

## Final hosted Slice 2 receipt recovery — strict-TDD safety stop

- Scope: user-authorized disposable-only recovery. Production `xvzdxoktwnzmxsfizkxo`, application behavior, Git state, and Slice 3/4 were not touched.
- Preflight inventory: the authenticated Supabase profile returned exactly one `ACTIVE_HEALTHY` project, protected production. There was no stale disposable project to recover or delete.
- Strict-TDD gate: `npm run test:unit` exited 1 before any provider mutation: 29 test files passed, but `tests/unit/slice2-hosted-receipt-harness.test.ts` failed one assertion (163 passed / 164 total). The stale assertion requires `'00000000-0000-0000-0000-000000000000'::uuid`; the current authorized direct Auth fixture correctly inserts nullable `instance_id` and verifies `u.instance_id is null`.
- Safety stop: no project was created, no provider connection, direct `psql` transaction, Auth fixture, normal password grant, WebP operation, lifecycle RPC, denied-role scenario, or fixture cleanup occurred. The inventory remained production-only.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Final hosted Slice 2 receipt | `tests/unit/*` + disposable hosted harness | Unit + hosted integration | Failed: `npm run test:unit` exit 1; 29 files passed, 1 file failed; 163/164 tests passed | N/A — no production change was authorized after a failing baseline | Blocked by the pre-existing static fixture-contract mismatch | N/A — no runtime work was safe to begin | N/A — no code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused/full test command | `npm run test:unit` — exit 1; 29 files passed, `tests/unit/slice2-hosted-receipt-harness.test.ts` failed 1 assertion; 163/164 tests passed. |
| Runtime harness command/scenario | N/A — strict-TDD safety gate failed before provider mutation. |
| Project cleanup/inventory | `npx --no-install supabase projects list --output json` — exit 0; exactly one project, protected production `xvzdxoktwnzmxsfizkxo`. No disposable existed. |
| Rollback boundary | Revert only this recovery-attempt documentation. No remote state or application behavior was changed. |

## Final autonomous hosted Slice 2 receipt — Auth password-grant blocker

- Scope: user-authorized disposable-only operational receipt in organization `jhbbteibaxcvwnjlkfvf`. Protected production `xvzdxoktwnzmxsfizkxo` was hard-blocked and never connected, queried, or mutated. No repository production source changed.
- Baseline: full `npm run test:unit` completed before provider mutation with 30 files and 164 tests passing.
- Migration evidence: a fresh generated-credential disposable project reached `ACTIVE_HEALTHY`; the nine approved SHA-256 entries passed 9/9; and the exact direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` closure committed using only the nine approved includes.
- Auth evidence: the current harness preflight accepted the hosted nullable `auth.users.instance_id` schema. Both direct Auth fixtures passed the complete bcrypt-confirmed email identity-graph assertion. The first ordinary `/auth/v1/token?grant_type=password` request then returned HTTP 400 with a body that did not match the harness's safe known categories. The receipt stopped immediately.
- Scenario status: no profile/product was created after the failed grant. Therefore WebP upload/retrieval/delete, Storage absence list/HEAD, cleanup-pending/retry/completion, and denied-role assertions are not claimed.
- Cleanup: the harness ran its fixture cleanup trap; the outer process deleted the disposable project and verified authenticated inventory contains exactly the protected production project. Credentials, tokens, password material, and disposable reference are intentionally omitted.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| Final hosted Slice 2 receipt | `tests/unit/*` + disposable hosted harness | Unit + hosted integration | `npm run test:unit` — exit 0; 30 files, 164 tests passed before remote mutation | N/A — no repository code changed | Partial: hashes, direct transaction, and current Auth identity-graph proof passed; password grant returned HTTP 400 | N/A — authenticated scenarios could not start | N/A — no repository code changed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused/full test command | `npm run test:unit` — exit 0; 30 files, 164 tests passed. |
| Runtime harness command/scenario | Disposable create → `ACTIVE_HEALTHY` → runtime API-key retrieval → nine SHA-256 checks 9/9 → direct nine-include `psql --single-transaction` committed → nullable-instance Auth schema and two complete identity graphs verified → first normal password grant returned HTTP 400 (`unclassified-auth-error`). |
| Required scenario receipt | Blocked before session establishment; no WebP, Storage list/HEAD/absence, cleanup lifecycle, or denied-role result is claimed. |
| Cleanup / final inventory | Harness cleanup trap ran; outer cleanup deleted the disposable target; authenticated final inventory check passed with production-only state. |
| Rollback boundary | The deleted disposable project contained the migration closure and any transient Auth fixture state. No application source changed. |

## Slice 2 final closeout — successful local hosted-equivalent receipt

### Cumulative state

- Completed and frozen: Slice 1 tasks 1.1–1.3, bridge remediation R1–R3, Slice 2 tasks 2.1–2.3, cleanup-observability tasks O1–O3, and closeout tasks C1–C3.
- Next: Slice 3 tasks 3.1–3.3. Slice 4 remains pending after Slice 3.
- Archive state: **not eligible**. The whole change must remain active because Slice 3 and Slice 4 are incomplete.
- Scope of this reconciliation: OpenSpec and Engram artifacts only. No application code, migration, local database, cloud/production state, or Slice 3 implementation changed.

### Successful operational receipt

The explicitly selected local hosted-equivalent Supabase Auth/Storage/REST gateway completed the isolated Slice 2 lifecycle. Retained evidence records confirmed admin and cliente creation, ordinary password sign-in, active admin authorization, valid WebP upload/retrieval, UUID-versioned replacement/retrieval, cleanup pending → failed attempt (`tentativas = 1`) → retry → object deletion → completed, and cliente denial with `USUARIO_NAO_AUTORIZADO`.

Independent read-only corroboration passed migration order and lifecycle source hash, current RPC metadata, RLS, table grants, and Storage policies. The lifecycle RPCs are `SECURITY DEFINER`, use an empty `search_path`, and expose the intended authenticated boundary; the cleanup table has RLS and no anon/authenticated table privileges; Storage mutations remain restricted to authenticated admin/supervisor while public read is retained.

Final fixture-scoped read-back returned zero matching products, profiles, Auth users, Storage objects, and cleanup records. This is **not** a whole-table-zero claim: the unrelated local baseline contains four profiles and four Auth users, while both Slice 2 fixture identities are absent.

### Independent verify receipt

| Evidence | Exact result |
|---|---|
| Focused tests | `npm run test:unit -- tests/unit/estoque-action.test.ts tests/unit/inventory-rpc-migration.test.ts tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 59/59 passed. |
| Full unit suite | `npm run test:unit` — exit 0; 34 files, 213/213 passed. |
| Type check | `npx tsc --noEmit` — exit 0. |
| Build | `npm run build` — exit 0. |
| Migration/RPC/RLS/grants | Passed independent local read-only corroboration, including lifecycle migration order/hash, RPC security metadata, cleanup-table RLS/grants, and Storage policies. |
| Operational scenario | Passed WebP upload/retrieval/replacement, cleanup fail/retry/complete and object deletion, ordinary sign-in, and cliente denial. |
| Cleanup | Fixture-scoped zero residual products, profiles, Auth users, Storage objects, and cleanup records; unrelated baseline remains four profiles/four Auth users. |
| Independent report | `verify-report.md`, evidence revision `sha256:c0c8bad569ee43374c18e4a248809e0592712412932b5ace91e162bb381e8eb0` — `PASS WITH WARNINGS`, 0 blockers, 0 critical findings, 3/3 Slice 2 scenarios compliant. |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command and exact result | No new command required for artifact-only reconciliation; retained independent verify result is 59/59 focused, exit 0. |
| Runtime harness command/scenario and exact result | No new runtime execution authorized; retained local hosted-equivalent operational receipt passed Auth, WebP lifecycle, cleanup retry/completion, and cliente denial. |
| Artifact consistency check | `tasks.md`, `apply-progress.md`, `verify-report.md`, and matching Engram topics reconciled to Slice 2 closed/frozen with Slice 3 next. |
| Rollback boundary | Revert only this closeout section, C1–C3 and the closure note in `tasks.md`, and matching Engram artifact revisions. No application/runtime state is part of this reconciliation. |

### Retention warning

Future operational stdout should be retained as a redacted immutable receipt. Do not retain credentials, tokens, project references, fixture UUIDs, object paths, parameter values, or unredacted response bodies.

### Result Contract

- Status: success — Slice 2 closed and frozen.
- Next recommended: apply Slice 3 only.
- Archive: prohibited until Slice 3 and Slice 4 are complete and verified.
- Production/cloud/local DB: not accessed or changed by this reconciliation.

## Slice 3 bounded correction reconciliation — atomic product ordering

### Cumulative state

- Slice 3 tasks 3.1–3.3 and verification remediation V3.1–V3.4 remain complete.
- Frozen blocker `R4-001` is corrected within its four genesis paths. The correction replaced sequential order writes and fallible compensation with one bulk PostgREST upsert request.
- Overall task progress remains 22/25. Slice 4 tasks 4.1–4.3 remain pending.
- Slice 3 is ready for independent SDD verification. It is not yet accepted or archive-ready, and this reconciliation does not grant verification or review authority.
- Delivery remains stacked-to-main: `main ← Slice1 ← Slice2 ← 📍 Slice3 ← Slice4`.

### Corrected behavior and bounded evidence

| Evidence | Exact result |
|---|---|
| Native scoped review | Lineage `review-admin-products-slice3-v1` reviewed only the 10 staged Slice 3 paths and reached terminal state `approved`; resolved finding: `R4-001`. |
| Correction boundary | Exactly four genesis paths changed. The correction was 155 changed lines against a 160-line forecast and remained below the 400-line review budget. |
| Server persistence | The prior sequential order writes and fallible compensation were replaced by one bulk PostgREST upsert request. |
| Client rejection recovery | A rejected persistence promise restores ordering by product identity, reports the failure, and clears pending controls. |
| Corrected focused tests | 18/18 passed. |
| Slice 3 focused tests | 23/23 passed. |
| Full unit suite | 226/226 passed. |
| Static and build gates | TypeScript, scoped ESLint, and the production build passed. |
| Runtime harness | No new runtime harness was run by this artifact-only reconciliation. The bounded validation found no live hosted atomicity integration test. |
| Rollback boundary | Revert only the atomic reorder changes in `src/app/actions/produtos.ts`, identity-based rejection recovery in `src/components/operator/InventoryManager.tsx`, and their focused corrections in `tests/unit/produtos-action.test.ts` and `tests/components/operator/InventoryManager.test.tsx`; retain all other Slice 3 and prior-slice behavior. |

### Review receipt

- Receipt: `.git/gentle-ai/review-transactions/v2/review-admin-products-slice3-v1/review-receipt.json`
- Lineage: `review-admin-products-slice3-v1`, generation 1, projection `staged`
- Terminal state: `approved`
- Final candidate tree: `ea01fb81a5311bb86c6f1ed60c726eb4d525f7b5`

### Remaining non-blocking risks

- Concurrent clients still use last-writer-wins ordering semantics.
- The bulk upsert resends trusted `nome` and `preco_centavos` fields because they are required by the table contract, so concurrent edits to those fields could be overwritten.
- No live hosted integration test currently proves transaction atomicity at the Supabase/PostgREST boundary.

### Reconciliation boundary

This continuation updated OpenSpec and Engram apply-progress only. It did not modify source, tests, migrations, Git staging, review authority, or start another implementation or review cycle.
