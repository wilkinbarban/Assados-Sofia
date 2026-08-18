# Tasks: Admin Products Unified Remediation

## Review Workload Forecast

| Slice | Estimated changed lines | Risk | Focused gate | Rollback |
|---|---:|---|---|---|
| 1 Data/RLS/SQL | 180-260 | High | `supabase test db` + SQL hardening test | Revert migration/test; restore compatible RPC only if old callers remain |
| 2 Server/images | 260-360 | High | `npm run test:unit -- estoque-action` | Revert `src/app/actions/estoque.ts` and lifecycle tests; retain referenced assets |
| 3 UI/redirect | 300-400 | High | component/order tests + build | Revert manager/page/UI tests only |
| 4 Auth E2E | 220-320 | Medium | `npm run test:e2e -- admin-products.spec.ts` | Revert fixture/spec/config changes only |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Apply only Slice 1 first; strategy is resolved. Each slice lands with its tests and gates before the next.

## Slice 1: Database identity, RLS, and SQL tests (PR 1)

- [x] 1.1 **RED:** extend `tests/unit/inventory-rpc-migration.test.ts` and `supabase/tests/admin_products_inventory_hardening.sql` for four-argument RPC, `auth.uid()` actor, no `p_usuario_id`, anon/unauthorized denial, and atomic rollback.
- [x] 1.2 **GREEN:** add forward-only `supabase/migrations/<timestamp>_admin_products_unified_remediation.sql`: official four-argument authenticated RPC plus a temporary service-role-only legacy rollback bridge, active admin/supervisor checks, `FOR UPDATE`, atomic writes, and RLS/Storage policies.
- [x] 1.3 **REFACTOR/VERIFY:** run SQL tests and focused migration tests; require contraction removal of the bridge after the four-argument caller rollout succeeds.

## Explicit remediation work unit: deferred bridge contraction

- [x] R1 **RED:** extend the focused migration test and SQL runtime harness to prove `PUBLIC`/`anon`/`authenticated` cannot execute the five-argument bridge, while `service_role` without a caller JWT can execute the legacy rollback path and the official four-argument path remains `authenticated`/`auth.uid()`-bound.
- [x] R2 **GREEN:** preserve the service-role-only bridge's transaction-local actor claim and add `supabase/contractions/20260712_admin_products_inventory_rpc_bridge.sql`, an executable non-auto-applied contraction that revokes and drops only the five-argument signature.
- [x] R3 **REFACTOR/VERIFY:** document the promotion gate: verify the four-argument caller rollout and an agreed no-legacy-call window, then apply the deferred artifact through the audited release SQL path; never move it into `supabase/migrations/`.

## Slice 2: Authenticated server boundary and image lifecycle (PR 2; depends 1)

- [x] 2.1 **RED:** add `tests/unit/estoque-action.test.ts` cases for session RPC calls, forged actor rejection, versioned full/thumb paths, prior-image preservation, successful old-image cleanup, and durable `cleanup_pending` observability/retry.
- [x] 2.2 **GREEN:** update `src/app/actions/estoque.ts` to use the session client/RPC, avoid client actor IDs and broad admin writes, upload `produtos/{id}/{slot}/{uuid}/{full,thumb}.webp`, compensate only new paths, and persist retriable cleanup failures.
- [x] 2.3 **REFACTOR/VERIFY:** lock per-product/slot operations, revalidate `/atendimento/admin`, run focused unit tests and build; verify client catalog behavior is unchanged.

## Slice 2 minimal cleanup E2E observability remediation

- [x] O1 **RED:** inject HTTP 400 independently into all six hosted-harness cleanup substeps and require unique fixed-step attribution with no response, credential, project-ref, UUID, or parameter-value disclosure.
- [x] O2 **GREEN:** emit one redacted JSON observation per cleanup HTTP request with fixed step ID, numeric status, allowlisted error code/message, and parameter names only.
- [x] O3 **REFACTOR/VERIFY:** pass the focused harness suite, full `npm run test:unit`, shell syntax, and local-only preflight; do not execute remote flows or modify systemd, migrations, or business behavior.

> Corrective rerun (2026-07-13): Slice 2 remains checked after the legacy-path, persistence-failure, NULL-element, return-contract, and approved canonical regex regressions passed with strict-TDD static RED/GREEN evidence and `tsc`. The host Docker transaction successfully applied `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql`, emitted all `CREATE FUNCTION` statements, and then rolled back. A prior runtime return-pair probe reached the function but was rejected with `CAMINHO_IMAGEM_INVALIDO` for canonical `full.webp` and `thumb.webp` paths. The approved targeted correction replaces the doubled backslashes before `.webp` with PostgreSQL-compatible single-backslash regex escapes in both image RPCs, while retaining explicit NULL rejection and the product-bound canonical/legacy allowlists. Focused static tests prove canonical full/thumb versioned paths and allowed legacy cleanup paths are accepted while arbitrary paths are rejected; Docker runtime was not run by this executor. Slice 3/4 work was not started.

> Final hosted-fixture attempt (2026-07-13): `npm run test:unit` passed 29 files / 154 tests and the approved nine-file manifest passed 9/9 hashes. The disposable-project creation command did not return before the 20-minute harness deadline; no disposable reference was allocated. The final profile listing contains only protected production `xvzdxoktwnzmxsfizkxo`. No fixture, Auth user/session, Storage object, migration transaction, source, Git, Slice 3, or Slice 4 work occurred. The hosted Storage receipt remains incomplete.

> Hosted validation safety stop (2026-07-13): the explicitly approved disposable baseline bootstrap was stopped after `supabase db push --workdir <ephemeral-workspace>` recorded unreviewed migration versions outside the eight-file subset. The disposable project was deleted and the protected production project remained the sole listed project. No lifecycle fixture, Auth user/session, or Storage object was created; Slice 3/4 remain out of scope.

> Manifest-pinned hosted validation safety stop (2026-07-13): after all eight approved migration hashes passed and a new disposable project was created, the required read-only preflight rejected the fresh hosted baseline because schema `supabase_realtime` was absent. Direct `psql` migration execution was not started, so no schema, fixture, Auth, Storage, RPC, grant, or policy mutation occurred. The disposable project was deleted and the final profile listing contained only protected production `xvzdxoktwnzmxsfizkxo`; Slice 3/4 remain out of scope.

> Corrected manifest-pinned hosted validation retry (2026-07-13): the new preflight correctly recorded (and did not require) the existing `supabase_realtime` publication. All eight hashes passed and the fixed direct `psql --single-transaction` command started on disposable `stiriejvmlncasdpycxz`. It rolled back at `20260712164546_admin_products_authenticated_inventory_rpc.sql:5` because the historical five-argument `ajustar_estoque_atomico` signature is absent from the exact eight-migration baseline and the pinned migration uses an unconditional `REVOKE` on that nonexistent function. No fixture, Auth/session, Storage, lifecycle, or unauthorized scenario ran. The disposable project was deleted; the final profile listing contains only protected production `xvzdxoktwnzmxsfizkxo`; Slice 3/4 remain out of scope.

> Final hosted Auth/Storage receipt retry (2026-07-13): the approved nine-file SHA-256 manifest passed 9/9, and the exact direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` closure committed on disposable `zdrqbtkutjaiqkhjcofr`. Safe postflight confirmed absent migration history, the lifecycle RPC, Realtime registrations, and the public image bucket. Supported email/password signup and password sign-in both returned HTTP 400; the sanitized Auth error category was email rate limiting, so no authenticated session could be established. No direct Auth/bootstrap SQL or Auth configuration change was issued. The required authorized retrieval-before-delete, Storage absence/list/HEAD, cleanup retry/completion, and unauthorized-denial fixture receipt remains incomplete. The disposable project was deleted; no source, Git, production, Slice 3, or Slice 4 mutation occurred.

> Final disposable lifecycle receipt preflight (2026-07-13): `npm run test:unit` passed 29 files / 154 tests and the authenticated validation profile confirmed the disposable target was distinct from production. The direct database secret was unavailable through a non-logged process-secret channel, so no checksum, `psql`, API-key reveal, Auth/Storage fixture, or authorization probe ran. The disposable project was deleted; immediate profile inventory contains only protected production. The hosted receipt remains incomplete.

> Autonomous disposable receipt execution (2026-07-14): `npm run test:unit` passed 30 files / 160 tests. CLI 2.109.1 help was used with profile `asados-readonly-validation` before creating a new non-production project in organization `jhbbteibaxcvwnjlkfvf`; it reached `ACTIVE_HEALTHY`. The supported CLI API-key command supplied the disposable publishable runtime key, and the generated database password remained process-only. The nine-file SHA-256 manifest passed 9/9, then the exact direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` closure committed. Direct disposable Auth fixture SQL was attempted as explicitly authorized; normal password sign-in then failed with the sanitized hosted Auth error `Database error querying schema`. No authenticated Storage/RPC, cleanup, or denied-role assertion can be claimed. The trap deleted the disposable project and the final authenticated profile inventory contains only protected production `xvzdxoktwnzmxsfizkxo`; Slice 3/4 remain out of scope.

> Direct-Auth fixture remediation (2026-07-14): focused strict-TDD tests now require actual hosted Auth column/type/constraint preflight, nullable `instance_id`, generated identity-email handling, a complete bcrypt-confirmed identity graph, and normal password grants. Disposable probes established the current hosted identity `id` is UUID and `auth.identities.email` is generated; the harness was corrected accordingly. All retries passed the nine-file hash manifest and committed only the direct nine-migration `psql` transaction; every disposable target was deleted and final inventory was production-only. The last runtime failure isolated psql `-c` variable non-expansion in identity-graph verification; the harness now uses a quoted stdin heredoc. The post-correction hosted scenarios (password grant, WebP, deletion absence, cleanup retry/completion, and denial) remain unproven until the next disposable rerun.

> Bounded direct-Auth bcrypt correction (2026-07-14): strict-TDD static regression coverage now requires the identity graph to accept `crypt(..., gen_salt('bf'))` bcrypt prefixes with `^\$2[aby]\$`, rather than only the literal `$2` prefix. The harness correction is limited to this predicate; focused static tests (8/8), the full unit suite (30 files / 162 tests), and `bash -n` passed. No remote project or hosted harness was run; post-correction hosted scenarios remain unproven.

> Final hosted-receipt recovery safety stop (2026-07-14): authenticated project inventory returned only protected production `xvzdxoktwnzmxsfizkxo`; no disposable project existed to recover or delete. The mandatory strict-TDD command `npm run test:unit` then failed before any provider mutation: `tests/unit/slice2-hosted-receipt-harness.test.ts` still requires a zero UUID `auth.users.instance_id`, while the authorized nullable-instance fixture harness inserts `NULL` and asserts `u.instance_id is null`. No project was created, no connection or migration transaction was opened, no fixture or Storage/RPC scenario ran, and production was not touched. The final hosted receipt remains blocked until the pre-existing static contract mismatch is reconciled under its own TDD cycle.

> Direct-Auth nullable-instance contract correction (2026-07-14): the focused static contract now asserts the hosted-supported nullable `auth.users.instance_id` schema and the harness's `u.instance_id is null` identity graph, while explicitly rejecting the obsolete zero-UUID requirement. The prior failure supplied RED evidence; focused GREEN passed 10/10 and the full unit suite passed 30 files / 164 tests. No remote operation or hosted harness was run. The hosted Slice 2 receipt remains pending.

> Final autonomous hosted receipt attempt (2026-07-14): the mandatory full `npm run test:unit` baseline passed 30 files / 164 tests before mutation. A newly generated disposable project in the authorized organization reached `ACTIVE_HEALTHY`, all nine pinned migration hashes passed, and the exact direct owner `psql -X --set=ON_ERROR_STOP=1 --single-transaction` closure committed. The current harness's nullable-instance direct Auth fixtures passed schema compatibility and complete identity-graph assertions, but the first normal password grant returned HTTP 400 with no recognized safe error category. The harness stopped before creating profiles/products or running WebP, Storage, cleanup, and denied-role scenarios. Fixture cleanup ran, the disposable project was deleted, and final authenticated inventory was production-only. No credential, token, or project identifier is recorded.

## Slice 2 closeout — local hosted-equivalent receipt and independent verification

- [x] C1 **OPERATIONAL RECEIPT:** the isolated local Supabase Auth/Storage/REST gateway passed ordinary admin and cliente password sign-in, active-admin authorization, valid WebP upload/retrieval, UUID-versioned replacement/retrieval, pending cleanup failure/retry/completion, object deletion, and cliente denial with `USUARIO_NAO_AUTORIZADO`.
- [x] C2 **DATABASE BOUNDARY:** migration order/hash, lifecycle RPC metadata, RLS, table grants, and Storage mutation/public-read policies passed independent read-only corroboration. Fixture-scoped final counts are zero for products, profiles, Auth users, Storage objects, and cleanup records.
- [x] C3 **INDEPENDENT VERIFY:** focused tests passed 59/59, the full unit suite passed 213/213 in 34 files, type check/build/shell syntax passed, and the Slice 2 verify report concluded `PASS WITH WARNINGS` with 3/3 scenarios compliant.

> **Slice 2 is closed and frozen.** The next implementation work is Slice 3. Do not reopen Slice 2 without a separately approved remediation, and do not archive `admin-products-unified-remediation`: Slice 3 and Slice 4 remain pending. The zero cleanup receipt is fixture-scoped; the unrelated local baseline contains four profiles and four Auth users. Preserve future operational stdout as a redacted immutable receipt rather than retaining secrets, identifiers, or unredacted response data.

## Slice 3: Official InventoryManager UI (PR 3; depends 2)

- [x] 3.1 **RED:** add `tests/components/operator/InventoryManager.test.tsx` and `tests/unit/product-ordering.test.ts` for six-column responsive cards, admin/supervisor gating, global-only DnD, keyboard/aria-live access, rollback/error state, and reload order.
- [x] 3.2 **GREEN:** consolidate `src/components/operator/InventoryManager.tsx`; move reusable behavior from `ProductCRUD.tsx`, disable DnD with search/status filters, persist the complete global sequence, and redirect `src/app/atendimento/produtos/page.tsx` to `/atendimento/admin?tab=estoque`.
- [x] 3.3 **REFACTOR/VERIFY:** run focused component/order tests, lint/build, and confirm no public catalog/query behavior changes.

## Slice 3 verification remediation (Slice 4 not started)

- [x] V3.1 **RED/GREEN:** prove small-viewport card reflow retains named, enabled inventory actions; add only the missing product-specific accessible names exposed by the failing test.
- [x] V3.2 **RED/GREEN:** prove reload/refetch restores the returned persisted sequence and `listarProdutos` queries `ordem_exibicao, nome`.
- [x] V3.3 **REGRESSION:** prove the client catalog retains its existing `buscar_produtos_disponiveis` RPC and returned ordering.
- [x] V3.4 **REGRESSION:** cover Space start/confirm and Escape cancellation without persistence.

## Slice 4: Authenticated deterministic Playwright E2E (PR 4; depends 3)

- [x] 4.1 **RED:** add isolated local-only auth/data/storage fixture and `tests/e2e/admin-products.spec.ts` covering CRUD, filters, image success/failure, cleanup, DnD gating, persistence, redirect, and unauthorized access.
- [x] 4.2 **GREEN:** wire deterministic seed/session setup without production credentials, unique prefixes, cleanup, and failure interception/assertions in `playwright.config.ts`/fixture files.
- [x] 4.3 **REFACTOR/VERIFY:** run `npm run test:e2e -- admin-products.spec.ts`; record trace-safe failures and gate the full suite with `npm run test:all`.
