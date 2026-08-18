# Apply Progress: Admin Inventory Security and Deployment Hardening

## Mode and boundary

- Mode: Strict TDD
- Delivery: force-chained, stacked-to-main
- Work unit: cumulative Slice 1–6 evidence, including Slice 5 atomic order stock lifecycle and Slice 6 official product ordering
- Completed safe tasks: 1.1, 1.2, 1.3, 1.8, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3
- A0 status: PARTIAL; the runtime now carries replacement fingerprints, but this A1a authorization does not authorize retroactive A0 completion and task 1.4 remains unchecked.
- Explicitly unchecked/deferred: 1.4/A0, 1.5/A1, 1.6/B1, 1.7/B2.
- No credential revocation, Git rewrite or garbage collection, publication, commit, push, pull request, restart, container operation, image build, deployment, production data/schema mutation, or production-mutating E2E was performed.

## Completed tasks

- [x] 1.1 Baseline inventory and preservation: current private preservation evidence is owner-scoped, the Git bundle is valid, and restoration passed in a disposable location.
- [x] 1.2 RED: incident-precondition coverage was expanded to exercise current-state preservation, archive and manifest traversal resistance, strict owner/refspec validation, and tamper rejection.
- [x] 1.3 GREEN: the corrected validation-only verifier requires real current-state preservation, valid `git bundle verify`, disposable restoration, traversal-safe archives and manifests, strict owner/refspec validation, and fails closed on tampering.
- [x] 1.8 REFACTOR/GATE: focused tests and static checks pass, while the current repository still fails closed at `remote-missing`.
- [ ] 1.4 A0 PARTIAL: source and mutable local consumers were migrated and replacements verified. `asados-web` now carries both replacements, but this A1a authorization does not complete or reclassify A0.

## TDD Cycle Evidence

| Task | Test file/layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| 1.1 | Recovery harness / integration | N/A (preservation task) | N/A structural gate | Actual disposable restoration passed | Current state, bundle validity, archive contents, and manifests checked | Private owner-scoped preservation root retained |
| 1.2 | `tests/unit/incident-preconditions.test.ts` / unit-integration | Existing incident tests | Correction cases exercised before approval | 11/11 focused tests passed | Preservation, restoration, traversal, owner/refspec, and tamper paths covered | Assertions preserve fail-closed behavior |
| 1.3 | Same / unit-integration | Existing incident tests | Unsafe verifier behavior rejected | 11/11 focused tests passed | Valid and invalid bundle, archive, manifest, owner, refspec, and tampering paths | Bash and ESLint checks passed |
| 1.8 | Static + runtime gate | 11/11 green | N/A approval/minimization | 11/11 remain green | Real current repository and disposable restore paths | Current repository exits fail-closed at `remote-missing` |
| 1.4 | `tests/unit/credential-consumer-migration.test.ts` / unit-integration | 11/11 incident tests passed before edits | 4/4 tests failed against embedded credential, open target, and generic executor | 4/4 migration-runner tests passed | Missing environment, target mismatch, linked dry-run arguments, and child-output redaction covered | Generic `exec_sql` removed; supported linked CLI dry-run is the default |
| 1.5/A1a | Official API semantics + read-only runtime probes | Replacement credentials and runtime checked before the decision boundary | N/A — no production code and no platform mutation; discovery proved the authorized operation is unsupported | BLOCKED fail-closed; no legacy key state changed | Legacy disable endpoint controls `anon` and `service_role` together; JWT-secret rotation would also exceed authorization | No refactor; task 1.5 remains unchecked |

## Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Correction delta | 133/140 lines; diff checks passed |
| Focused test | `npm run test:unit -- tests/unit/incident-preconditions.test.ts` → 11/11 tests passed |
| Runtime harness | Actual restoration from the current preservation evidence passed in a disposable location; verifier against the current repository remains fail-closed at `remote-missing` |
| Static checks | Bash syntax and targeted ESLint checks passed |
| Corrected verifier guarantees | Requires real current-state preservation, valid `git bundle verify`, disposable restoration, traversal-safe archive/manifests, strict owner/refspec validation, and fail-closed tamper handling |
| Rollback boundary | Revert only the approved Slice 1 correction in `tests/unit/incident-preconditions.test.ts`, `scripts/verify-incident-preconditions.sh`, and `docs/runbooks/credential-incident.md`; preserve the external recovery evidence and leave A0/A1/B1/B2 untouched |

## Gate A0 evidence

- Authorization: explicit interactive maintainer response `ejecuta el siguiente paso`; A0 only.
- Actor/time: `interactive-maintainer / sdd-apply executor`, `2026-07-16T10:26:50Z`.
- Target: `xvzdxoktwnzmxsfizkxo`; CLI project list, linked project file, and API endpoint matched exactly.
- Legacy fingerprints: `ab511256db7d` (legacy anon) and `f2fbedc4dc40` (legacy service role); both remain active by read-only HTTP 200 probes.
- Replacement fingerprints: `af06cb9cb418` (publishable) and `d40a72c813d9` (secret/service role); both passed read-only HTTP 200 probes.
- Creation result: Management API POST returned HTTP 400 for additional publishable and secret keys because the project already has an active current pair. No new key material was retained. The existing unexposed independently revocable defaults were revealed process-locally and atomically installed in owner-only `.env` mode 0600.
- Consumer inventory at the A0 observation time: tracked runner migrated; ignored `.env` migrated; ignored generic SQL helpers removed; shell/profile and accessible process scans found no consumers; systemd/CI scans found no exposed fingerprints; Git history/recovery retain the legacy service reference pending B1/B2; a private Playwright log retains the legacy anon reference; `asados-web` then carried both legacy keys. The A1a precondition check later found the running container on replacement fingerprints.
- Secret scan: zero replacement plaintext matches outside owner-only `.env`; no replacement value entered tracked files, tests, logs, command arguments, Engram, or SDD artifacts.
- Incident note: an initial CLI inventory command without `--reveal` unexpectedly returned full legacy JWT fields, and the first RED assertion rendered the pre-existing tracked legacy literal in test failure output. No replacement value was exposed. Subsequent inventory and assertions were hardened to emit fingerprints/booleans only; this output exposure is an additional reason A0 cannot be reported complete.
- A0 historical blocker: changing `asados-web` required separately authorized lifecycle activity. The current container is now on replacements, but task 1.4 remains unchecked because this narrow A1a authorization does not authorize A0 completion. Full A1 remains blocked by the deferred legacy publishable boundary.

## Gate A0 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| RED | `npm run test:unit -- tests/unit/credential-consumer-migration.test.ts` → 4/4 failed before production change |
| Focused GREEN | `npm run test:unit -- tests/unit/credential-consumer-migration.test.ts tests/unit/incident-preconditions.test.ts` → 15/15 passed |
| Static checks | Targeted ESLint passed; replacement plaintext scan returned 0 outside `.env`; TypeScript reached only two pre-existing `incident-preconditions.test.ts` `NODE_ENV` typing errors |
| Runtime harness | Four read-only production probes returned HTTP 200: replacement publishable, replacement secret, legacy anon, and legacy service role |
| Rollback boundary | Revert `scripts/run_migration.mjs` and `tests/unit/credential-consumer-migration.test.ts`; restore the prior `.env` values only while A1 remains unexecuted; removed ignored generic SQL helpers may remain absent. Do not alter container state or recovery artifacts. |

## Current preservation evidence

- Private root: `/home/wilkin/proyectos/Asados-worktrees/incident-baseline-20260716T024402Z`
- Actual disposable restoration: passed
- Current repository gate: fail-closed at `remote-missing`
- The older evidence set is quarantined and superseded. It MUST NOT be destroyed before an authorized retention release.

## Gate A1a privileged-only revocation attempt

- Authorization: maintainer selected `Autorizar revocación` for legacy privileged fingerprint `f2fbedc4dc40` only; legacy publishable fingerprint `ab511256db7d` must remain active until the clean Slice 9 image.
- Actor/time: `interactive-maintainer / sdd-apply executor`, `2026-07-16T11:05:27Z`.
- Target: exact project `xvzdxoktwnzmxsfizkxo` matched one linked CLI project and `supabase/.temp/project-ref`.
- Official semantics: legacy `anon` and `service_role` are coupled to the same JWT secret and cannot be independently rotated. The deprecated Management API legacy-key endpoint accepts one project-wide `enabled` boolean for both keys. Supabase CLI `2.109.1` exposes API-key listing but no legacy per-key revoke command.
- Verdict: unsupported under the authorized boundary. Executed: false. No Management API mutation, legacy-key disablement, or JWT-secret/signing-key rotation was attempted.
- Replacement state: privileged `d40a72c813d9` passed a read-only REST probe with HTTP 200; publishable `af06cb9cb418` passed Auth settings with HTTP 200.
- Runtime state: `asados-web` is running with restart count 0 and fingerprints `af06cb9cb418` / `d40a72c813d9`; neither legacy fingerprint is present in its environment. Direct `http://127.0.0.1:3020/` returned HTTP 200. `/api/health` is not implemented in this slice and returned HTTP 404.
- Legacy state: no mutation occurred. The last independent A0 probes recorded both `ab511256db7d` and `f2fbedc4dc40` active (HTTP 200); this A1a run did not re-read full legacy inventory or secret values. A Management API status probe returned HTTP 403 for the available token scope and was not retried through a secret-revealing path.
- Completion: A1a is BLOCKED/NOT EXECUTED; full task 1.5/A1 remains unchecked. Retire both legacy keys only after the legacy publishable consumer boundary is clean and separately authorized, currently planned with Slice 9.
- Secret handling: commands and evidence emitted fingerprints, booleans, and HTTP statuses only. No key was created, revealed, printed, or added to tracked files/OpenSpec/Engram. Previously detected OpenCode database/log persistence remains pending separately authorized offline sanitation.

## Gate A1a Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `supabase projects api-keys --help` on CLI `2.109.1` exited 0 and exposed list-only semantics; official Management API documentation defines only group `PUT /v1/projects/{ref}/api-keys/legacy?enabled=...` for legacy `anon` plus `service_role` |
| Runtime harness | Secret-safe read-only probes: replacement privileged REST HTTP 200; replacement publishable Auth settings HTTP 200; `asados-web` running with fingerprints `af06cb9cb418` / `d40a72c813d9`; direct root HTTP 200; `/api/health` HTTP 404 (endpoint not yet implemented) |
| Rollback boundary | No platform state changed. Revert only this A1a evidence section if administratively withdrawn; do not alter runtime, legacy keys, preservation evidence, or prior A0 work |

## Slice 2 profile hardening

- [x] 2.1 RED: `profile_hardening.sql` failed on self role escalation before production changes; action tests failed before RPC narrowing.
- [x] 2.2 GREEN: one CLI-created, rerun-safe migration restricts profile self-service to the actor's owned `nome`; direct `funcao`, `ativo`, mixed-column, and cross-row writes are denied. Managed changes derive `auth.uid()`: only active admins may assign or demote admin roles or mutate admin targets, while active supervisors may manage only `vendedor` and `cliente`. Actor-row locking and revalidation close the concurrent-revocation race; self-lockout, last-admin protection, and atomic audit remain enforced. Direct normal-role audit INSERT is denied. Both actions use authenticated RPCs without a caller actor or service-role bypass.
- [x] 2.3 GATE: migration rerun, local SQL/HTTP runtime paths, focused and full unit suites, targeted ESLint, build, linked read-only comparison, and recurring secret-safe scans passed. Zero live legacy privileged consumers were found, and no production mutation occurred.

### Slice 2 TDD Cycle Evidence

| Task | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| 2.1 | Existing related unit 6/6 | SQL rejected current self-escalation boundary | Profile pgTAP 1/1 passed | Direct/mixed/cross-row, anon/vendor/inactive/admin/supervisor, spoofing, rollback, self-lockout, last-admin | Transactional fixtures and one TAP result |
| 2.2 | Targeted ESLint clean | Action RPC tests failed before narrowing | Focused unit 6/6, full unit 273/273, lint, and build passed | Owned-name self-service; admin-only admin assignment/demotion and admin-target mutation; supervisor-only normal-role management; concurrent actor revocation; audit grants; migration rerun | Removed split service-role profile writes while preserving atomic audit and admin invariants |
| 2.3 | Native bound gate allow | N/A gate task | Recurring scans and all required local gates passed | Real local Data API/RPC HTTP paths | Evidence remains fingerprint/status-only |

### Slice 2 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Correction delta | 81/150 lines; correction remained within its approved review boundary |
| Focused tests | `supabase test db supabase/tests/profile_hardening.sql --local` → pgTAP 1/1; focused Vitest → 6/6; full unit suite → 273/273 |
| Runtime harness | Local Data API/RPC paths proved owned-`nome` self-service; denied protected, mixed, and cross-row writes; denied inactive/non-admin admin management and direct normal-role audit INSERT; allowed only the bounded admin/supervisor role matrix; preserved self-lockout, last-admin, atomic audit, and actor-lock revalidation behavior |
| Local/linked gates | Migration rerun passed; lint and build passed; linked read-only comparison passed; no production mutation occurred |
| Consumer scan | Recurring secret-safe scan found zero live legacy privileged consumers |
| Rollback boundary | Revert only the Slice 2 migration, SQL/unit tests, and RPC changes in `perfil.ts`/`admin.ts`; preserve prior dirty work and Slice 1 evidence |
| Deferred gates | A0 remains partial; A1, B1, and B2 remain incomplete/deferred. No production mutation or operational lifecycle action occurred. |

## Review authority

- Native lineage: `review-admin-estoque-hardening-slice2-v1`
- Review decision: approved
- Post-apply gate: allow
- Binding revision: `sha256:d6de506d3dfd13ecd797db8facdf60ceeb2c2b403e144936880e736053cebd12`
- This reconciliation records the existing authority only; it does not create, modify, or replace review authority.

## Next gate

Slice 3 is complete after the maintainer clarified that local `npm run build` verification was authorized. Slice 4 is next as a separate stacked-to-main work unit. A0 remains partial; A1/B1/B2 remain incomplete/deferred.

## Slice 3 product stock-write hardening

- [x] 3.1 RED: SQL, action, and component tests failed before production changes. They proved metadata UPDATE lacked a safe boundary, crafted stock fields reached generic update paths, and the inventory edit form submitted `quantidade_estoque`.
- [x] 3.2 GREEN: migration `20260716160600_product_metadata_write_boundary.sql` grants authenticated UPDATE only on approved metadata columns and restores an active-admin/supervisor UPDATE policy. Generic product edits reject or remove stock fields atomically; inventory edits omit stock; metadata and status writes are session-bound; direct normal-role stock updates and mixed stock/metadata updates are denied. `ajustar_estoque_atomico` remains the dedicated atomic stock control. Product creation and initial-stock transactionality remain deferred to Slice 4.
- [x] 3.3 GATE: local reset, SQL/runtime denial, unit/component suites, advisors, lint, TypeScript, local application build, linked read-only comparison, diff checks, and recurring secret-safe scans passed. No Docker image build, deployment, recreate/restart, or production mutation occurred.

### Slice 3 TDD Cycle Evidence

| Task | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| 3.1 | Related focused suite 37/37 | pgTAP failed before metadata grant; focused Vitest failed 4/41 | pgTAP 1/1 and focused Vitest 52/52 | Direct stock, mixed payload, vendor denial, metadata success, both generic actions, and UI payload | Assertions cover observable mutation and call boundaries |
| 3.2 | Dedicated inventory RPC runtime harness remained green | Generic service-role update and permissive payload paths were observable | Full unit 279/279; local HTTP harness passed all five outcomes | SQL role/column checks plus real Data API sessions | Kept creation and stock RPC behavior out of this slice |
| 3.3 | Bound Slice 2 post-apply authority returned `allow` | N/A gate task | Local Next.js build passed; all gate checks passed | Pre/post credential activity and live-consumer scans matched | Secret-safe evidence only |

### Slice 3 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused tests | pgTAP 1/1; focused Vitest 52/52; full unit 279/279 |
| Runtime harness | Local Data API: direct stock denied, mixed update denied without partial mutation, metadata update succeeded, vendor update denied, final stock remained 10; existing inventory RPC harness completed and rolled back |
| Local schema | `supabase db reset --local --yes --debug` completed; generated migration applied; security advisors reported no candidate errors and two unrelated existing warnings |
| Static checks | Targeted ESLint and diff checks clean; `npm run build` compiled, ran TypeScript, generated 17/17 static pages, and exited 0 |
| Linked read-only comparison | Linked ledger intentionally lacks the new Slice 2 profile and Slice 3 product migrations; linked schema has the official four-argument stock RPC but not the local deferred five-argument rollback bridge. No linked mutation occurred. |
| Credential scans | Pre/post target `xvzdxoktwnzmxsfizkxo`; replacement publishable/privileged, legacy publishable/privileged, and smoke all HTTP 200; web privileged fingerprint `d40a72c813d9`; zero live legacy privileged consumers |
| Rollback boundary | Revert only the Slice 3 migration, SQL test, generic product action/schema edits, InventoryManager edit payload/field change, and focused tests. Preserve dedicated stock controls, product creation behavior, prior slices, and unrelated dirty work. |
| Deferred | Slice 4 product creation/initial stock RPC, order stock flows, and A0/A1/B1/B2 remain untouched. Docker image build, deployment, and production lifecycle actions remain prohibited. |

## Slice 3 review authority

- The dirty baseline required four approved path-bound receipts:
  1. `review-admin-estoque-hardening-slice3-metadata-v1`
  2. `review-admin-estoque-hardening-slice3-action-v1`
  3. `review-admin-estoque-hardening-slice3-ui-v1`
  4. `review-admin-estoque-hardening-slice3-estoque-test-v1`, with a maintainer-approved 413-line test-only exception.
- Latest post-apply gate: `allow`.
- SDD binding: `sha256:c49f91b750bba7dcb7f79300172f17717ffebc8673ad174b48686315509486b0`.
- This reconciliation records existing review authority only; it does not create, modify, or replace review authority.

## Non-blocking follow-ups

- Distinguish unauthenticated failures from PostgreSQL permission error `42501`.
- Improve modal label and toggle accessibility in Slice 8.
- Strengthen inactive/supervisor coverage, metadata-field assertions, and cleanup SQL assertions.

## Slice 3 handoff (completed)

Slice 4 started only after interactive approval and a fresh secret-safe consumer/key-activity scan. A0 remains partial; A1, B1, and B2 remain incomplete/deferred.

## Slice 4 transactional inventory writers

- [x] 4.1 RED: new SQL, action, and component tests failed before production changes because `criar_produto_com_estoque` and retry correlation did not exist and creation still used a privileged generic insert.
- [x] 4.2 GREEN: the transactional inventory writers provide authenticated product creation, atomic initial movement/audit, immutable persistent idempotency ledgers for creation and adjustment, serialized stock adjustment, active-state coupling, compatible four/five/six-argument signatures, and narrow grants. Product creation and adjustment use authoritative session-bound paths; ambiguous retries retain their correlation while successful same-product writes invalidate stale intents.
- [x] 4.3 GATE: inventory pgTAP, concurrency, signature compatibility, focused and full unit suites, build, and the final privileged-consumer scan passed. The approved path-bound receipts and latest `allow` binding cover the reconciled Slice 4 result. No production mutation or prohibited lifecycle action occurred.

### Slice 4 RPC and idempotency contract

- `criar_produto_com_estoque(text,text,integer,integer,integer,boolean,uuid)` is transactional, authenticated-only, and returns stable creation results. Positive controlled stock creates exactly one `entrada` movement with reason `Estoque inicial`; controlled zero is inactive with no movement; uncontrolled zero remains active with no movement.
- Creation and adjustment use immutable persistent idempotency ledgers. An exact replay returns the original result even after later product mutation or deletion; correlation reuse with a changed payload fails deterministically with `IDEMPOTENCY_CONFLICT`.
- Four-, five-, and six-argument adjustment signatures remain compatible. The authoritative action/UI adjustment path uses the six-argument correlation contract.
- An exact ambiguous retry reuses its UUID. A successful adjustment invalidates stale intents for the same product without disturbing pending intents for other products.
- Action errors expose stable mappings for idempotency conflicts and whitespace-only product names. Structured failure logs remain correlation-safe and contain no secrets or personal data.

### Slice 4 TDD Cycle Evidence

| Task | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| 4.1 | Existing product and inventory safety nets | Creation RPC and authoritative retry correlation were absent; creation still used a privileged generic insert | Inventory pgTAP and the initial focused 19/19 suite passed | Positive/zero controlled state, uncontrolled zero, creation retry, conflicts, and rollback | Transactional creation contract retained |
| 4.2 | Existing four/five-argument compatibility harness | Durable replay and authoritative six-argument adjustment behavior were not yet proven | Concurrency and four/five/six-signature compatibility passed; follow-up focused suites passed 17/17 and 8/8 | Replay after mutation/deletion, deterministic conflicts, ambiguous retry UUID reuse, same-product invalidation, and cross-product isolation | Immutable ledgers separate replay history from mutable domain rows |
| 4.3 | Approved path-bound Slice 4 receipts | N/A gate task | Full unit suite passed 293/293; build passed; latest post-apply gate returned `allow` | Receipt paths, binding, and zero live legacy privileged consumers reconciled | Artifact-only reconciliation; authority unchanged |

### Slice 4 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Review budget | Eight approved path-bound receipts cover the Slice 4 SQL, action, UI, and test work. `review-admin-estoque-hardening-slice4-estoque-test-v1` carries the maintainer-approved 446-line test exception. |
| Focused tests | Inventory pgTAP passed; focused unit stages passed 19/19, then 17/17 and 8/8. Compatibility coverage for all four/five/six-argument signatures passed. |
| Full tests | Full unit suite passed 293/293; build passed. |
| Runtime harness | Concurrency scenarios passed. Controlled positive creation produced one `entrada`/`Estoque inicial`; controlled zero remained inactive; uncontrolled zero remained active. Original creation/adjustment replay survived later mutation/deletion, and conflicts were deterministic. |
| Action/UI harness | The authoritative adjustment path used six-argument correlation; exact ambiguous retry reused its UUID; same-product success invalidated stale intents while other products were unaffected. Stable mappings covered idempotency conflict and whitespace-only names. |
| Final secret-safe scan | Zero live legacy privileged consumers. |
| Review authority | Approved receipts: `review-admin-estoque-hardening-slice4-sql-v1`, `review-admin-estoque-hardening-slice4-action-v1`, `review-admin-estoque-hardening-slice4-ui-v1`, `review-admin-estoque-hardening-slice4-estoque-test-v1`, `review-admin-estoque-hardening-slice4-adjust-action-v1`, `review-admin-estoque-hardening-slice4-adjust-ui-v1`, `review-admin-estoque-hardening-slice4-error-action-v1`, and `review-admin-estoque-hardening-slice4-error-test-v1`. Latest gate: `allow`. Binding: `sha256:e23d780c183c9a93c692086b51311a96fff260ee1cd6b0c175324619e4af53c8`. This reconciliation records authority without changing it. |
| Rollback boundary | Revert only the Slice 4 transactional creation/adjustment writers, immutable ledger behavior, authoritative action/UI correlation flow, stable error mappings, and their focused tests. Preserve Slices 1–3, unrelated work, recovery evidence, and authority records. |

## Slice 4 residual risk and follow-ups

- The persistent idempotency ledger retention policy remains an explicit residual risk.
- Slice 8 follow-ups: modal error visibility, pending-close guard, accessible labels, and stronger bucket/update assertions.
- Service-role image cleanup remains deferred to Slice 7.
- A0 remains partial; A1, B1, and B2 remain deferred.

## Next gate after Slice 4

Slice 5 order-stock RPCs are the next separate stacked-to-main work unit, only after interactive approval and a fresh scan. A0 remains partial; A1, B1, and B2 remain incomplete/deferred. Production mutation, Docker image build/deploy/restart, commit/push/PR, and production-mutating E2E remain prohibited.

## Slice 5 atomic order stock lifecycle

- [x] 5.1 RED: order pgTAP failed because lifecycle RPCs were absent; action tests failed because confirmation/cancellation still used direct read-update-insert loops.
- [x] 5.2 GREEN: expand-only state/correlation columns and trusted actor/system RPCs aggregate duplicate lines, lock order then product UUIDs ascending, validate every item before writes, and atomically apply or restore controlled stock, active state, movements, order state, and audit.
- [x] 5.3 GATE: local reset, pgTAP, true concurrent confirmation/cancellation and opposite-input-order sessions, focused/full unit, advisors, targeted lint/TypeScript, local build, linked read-only comparison, diff checks, and final consumer scan passed.

### Slice 5 TDD Cycle Evidence

| Task | RED | GREEN | TRIANGULATE / REFACTOR |
|---|---|---|---|
| 5.1 | Missing RPC and legacy loops failed SQL/action tests | pgTAP 1/1; focused 2/2 | Shortage, duplicate lines, uncontrolled stock, denial, rollback, retry, cancellation, attribution |
| 5.2 | Direct non-atomic writers remained | Concurrent retry produced one effect; opposite line order avoided deadlock | Shared internal transition primitive; narrow public wrappers |
| 5.3 | N/A gate | Full unit 295/295; build and final scan passed | Linked target remained read-only and lacks Slices 2–5 |

### Slice 5 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Review budget | 398 authored additions plus deletions including SDD checkbox/progress updates; hard stop remained below 400 |
| Focused/runtime | pgTAP 1/1; action 2/2; concurrent same-order confirmation `7|1|aplicado`; cancellation `10|2|restaurado`; opposite line order `8,8|4` |
| Full/static | Full unit 295/295; targeted ESLint and TypeScript passed; advisors error-level clean; local Next.js build passed; full TypeScript retained two known incident-test errors |
| Linked comparison | Read-only ledger/dump: linked lacks local migrations `20260716145744` through `20260716212059` and has zero Slice 5 signatures/grants; no linked mutation |
| Final scan | Exact target `xvzdxoktwnzmxsfizkxo`; replacement privileged fingerprint `d40a72c813d9`; four key probes and smoke HTTP 200; zero live legacy privileged consumers across files, accessible processes, and 20 containers |
| Rollback boundary | Revert only the Slice 5 migration, order pgTAP/action tests, and lifecycle wiring in `pedidos.ts`; preserve Slices 1–4 and unrelated dirty/private evidence |

## Slice 5 native review approval reconciliation

- Tasks 5.1–5.3 remain completed. The original Slice 5 strict-TDD evidence and work-unit evidence above are retained as the baseline record.
- Native recovery created the approved successor `review-admin-estoque-hardening-slice5-v2` through Gentle AI 2.1.7 `scope_changed`.
- One bounded correction consumed 164/190 lines. It addressed INSERT lifecycle forgery, the item-snapshot race, legacy effects snapshot and replay-cancel behavior, and active-status preservation.
- Approved receipt hash: `sha256:5e3d67995969f7bad7462ea3feaed25f40ca07c0e1193bd092f6a8fb20a7ce3d`.
- Authority revision: `sha256:024b072b91cb59b882f103eab0072e716b6e8890f91252816dac778091520321`.
- Post-apply gate: explicit `allow`.
- SDD binding revision: `sha256:f94063e8adcc40b74d02ac18bee1d976fc9f191d61db8d14390fcf35c9d560fe`.
- This reconciliation records existing review provenance only; it does not create, modify, or replace review authority, receipt, or binding.

### Slice 5 successor verification

| Evidence | Exact result |
|---|---|
| Focused tests | 5/5 passed |
| Full tests | 298/298 passed |
| Build | Passed |
| Lint | 0 errors; 8 pre-existing warnings |
| Diff check | Passed |
| pgTAP | Unavailable: no disposable local PostgreSQL runtime was available, and project database/container mutation was prohibited |

## Next gate after Slice 5

- Risk: an initial read-only API-key inventory subprocess failure surfaced credential values in transient tool output; no value was persisted to repository artifacts or Engram, and the final scan was secret-safe.
- Slice 6 is NOT started. Interactive maintainer approval remains required before any Slice 6 work. A0 remains partial; A1/B1/B2 remain deferred and no production or lifecycle mutation was performed.

## Slice 6 official product ordering

- [x] 6.1–6.2 RED/GREEN: all named product consumers now use official `ordem_exibicao` with name/id fallbacks. The inventory surface and order selector defensively normalize legacy zero/null positions; catalog and RAG RPCs apply official order, and text search ranks exact/prefix/contains matches before official order.
- [x] 6.3 GATE: the secret-safe credential migration suite passed. No keys were revealed, persisted, or mutated; no remote Supabase, deployment, container lifecycle, or production-mutating E2E operation occurred.

### Slice 6 TDD Cycle Evidence

| Task | Test file/layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| 6.1 | `tests/unit/product-ordering-contract.test.ts` / unit | `product-ordering.test.ts` 4/4 | Missing `sortProductsByOfficialOrder` failed 2/2 | Helper and inventory use passed 2/2 | Persisted positions, duplicate positions, legacy zero/null, name/id fallback | Shared pure ordering helper prevents consumer drift |
| 6.2 | `tests/components/operator/CreateOrderModal.test.tsx` / component fixture | Related focused suites green | Legacy-zero catalog fixture rendered before the official position | Selector rendered the official position first and requested all three DB sort keys | Selector, inventory, client catalog/RAG RPC contracts cover unsearched, searched, and legacy fallback paths | The selector and inventory share the same pure normalizer |
| 6.3 | `tests/unit/credential-consumer-migration.test.ts` / unit gate | 50 focused ordering tests green | N/A gate task | 6/6 passed | Missing credentials, wrong target, redaction, root anchoring, and overlap redaction | No production credential operation |

### Slice 6 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm test -- --run tests/components/operator/CreateOrderModal.test.tsx tests/unit/product-ordering-contract.test.ts tests/unit/product-ordering.test.ts tests/unit/estoque-action.test.ts tests/components/operator/InventoryManager.test.tsx tests/unit/credential-consumer-migration.test.ts` → 6 files, 56/56 tests passed |
| Runtime harness | The CreateOrderModal fixture executed the actual `useEffect` catalog query chain and rendered selector options from a legacy-zero/official-position response; it selected the official position first. No local database harness was run because container lifecycle and remote Supabase mutation are prohibited. |
| Static quality | Targeted ESLint and `git diff --check` passed; `npm run build` passed (17/17 static pages). `npx tsc --noEmit` retains two pre-existing `incident-preconditions.test.ts` `ProcessEnv` errors. |
| Credential gate | `npm test -- --run tests/unit/credential-consumer-migration.test.ts` → 1 file, 6/6 passed; all probes use test sentinels and assert redaction. |
| Rollback boundary | Revert `20260718220556_product_official_ordering.sql`, the ordering helper and its two consumers, and the Slice 6 ordering tests. This removes the new-order trigger and ordering behavior without affecting Slices 1–5. |

### Slice 6.3 current secret-safe consumer/key-activity scan

- Timestamp: `2026-07-19T00:34:36.988Z`.
- Scope: the current Config.Env metadata of all running Docker containers and Supabase read-only status endpoints reached with the active `asados-web` credentials. No key-inventory or reveal command was invoked.
- Commands/categories: Docker status (`docker ps`); local runtime metadata inspection (`docker inspect`) streamed only into a local SHA-256 truncated-fingerprint comparator; read-only HTTP status probes (`curl`) that emitted status codes only.
- Verdict: PASS. Scanned 24 running containers. `asados-web` was the sole matched consumer, with replacement publishable fingerprint `af06cb9cb418` and replacement privileged fingerprint `d40a72c813d9`; each count was 1. Legacy publishable fingerprint `ab511256db7d` and legacy privileged fingerprint `f2fbedc4dc40` each had count 0.
- Activity: replacement publishable Auth settings probe returned HTTP 200; replacement privileged REST root probe returned HTTP 200. Neither legacy key was used or probed.
- Limitations: this observes running Docker Config.Env consumers only. It does not cover stopped containers, host processes, systemd/CI/remote consumers, historical Git/recovery evidence, or establish remote legacy-key enablement. No key was printed, revealed, created, disabled, rotated, or persisted.

### Slice 6 delivery boundary

- Delivery: force-chained, stacked-to-main; one autonomous Slice 6 unit.
- Forecast: 290–360 authored changed lines. Actual: 286 slice-attributed additions plus deletions, including task/progress evidence; inherited dirty changes are excluded.
- No commit or pull request was created.

## Slice 6 isolated native review approval reconciliation

- Lineage: `review-admin-estoque-hardening-slice6-v1`.
- Review scope: 7 paths, 234 lines; medium-reliability review with zero findings.
- Review decision: approved.
- Receipt: `sha256:73b4f8b5112fac4a9af1d1ed91c291c643d1eba13871fde67ff0c26634ce6070`.
- Authority revision: `sha256:726f54c435c9a7f19eb335f4f45765239b66a7a1d8f36b0e25a18fb96cb9eed8`.
- Post-apply explicit validation: `allow`.
- SDD binding revision: `sha256:ea7df6821e3ef10aaf696b6c9d9d80fa7a8204dfb326ed3852a2194d59f185e9`.
- Validation: 127/127 tests passed; the build compiled and completed TypeScript, then was blocked only at `/cadastro` because Supabase environment variables were absent. Lint was blocked by the pre-existing `AdminDashboard` error. Diff check passed. No disposable PostgreSQL runtime was available.
- Source state: Slice 6 is approved and bound in the isolated worktree, but is not yet integrated or committed into main. This reconciliation records existing provenance only; it does not create, modify, or replace review authority, receipt, binding, or repository state.

## Next gate after Slice 6

Slice 7 MUST NOT begin until an integration decision for the approved isolated Slice 6 source is made. A0 remains partial; A1/B1/B2 remain deferred. Production deployment, lifecycle operations, remote Supabase mutation, and production-mutating E2E remain prohibited.

## Slice 7 Work Unit 1 — orphan candidate classification

- [x] Introduced the pure dry-run classifier boundary for product-image candidates: only `produtos/` object keys that are unreferenced and at least 24 hours old are eligible; outside-scope, referenced, too-young, and invalid-timestamp candidates are protected.
- [ ] Tasks 7.1–7.2 remain incomplete: durable queue/claim/recheck/retry, Storage API worker, SQL-delete denial runtime evidence, and failure recovery are not part of this unit.
- [ ] Task 7.3 remains incomplete.

### TDD Cycle Evidence

| Work unit | Test file/layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| S7-WU1 classifier | `tests/unit/storage-orphan-reconciliation.test.ts` / unit | N/A: recovered pre-existing RED/GREEN source from the dirty worktree; current baseline 7/7 | Historical test-first ordering cannot be independently reconstructed, so this unit does not claim completion of task 7.1 | `npm test -- --run tests/unit/storage-orphan-reconciliation.test.ts` passed 7/7 | Eligible older object, exact 24-hour boundary, outside prefix, bare prefix, referenced, within grace, invalid timestamp | Pure function isolated from Storage and database effects; targeted ESLint passed |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm test -- --run tests/unit/storage-orphan-reconciliation.test.ts` → 1 file, 7/7 tests passed |
| Runtime harness | N/A for this autonomous unit: it is a pure deterministic classification boundary with no runtime/Storage/database interaction. Runtime proof remains mandatory for later Slice 7 worker units. |
| Static quality | `npx eslint apps/web/src/lib/storage-orphan-reconciliation.ts tests/unit/storage-orphan-reconciliation.test.ts` exited 0; `git diff --cached --check` passed before commit. |
| Review budget | 120 authored additions across two isolated files, below the 400-line limit. |
| Rollback boundary | Revert commit `855d958`; this removes only the pure classifier and its unit tests, preserving the queue, worker, UI, earlier slices, and unrelated dirty work. |
| Commit | `855d958 feat(storage): classify orphan image candidates` |

### Next Slice 7 boundary

Implement the durable queue and atomic approval/claim/recheck SQL contract with focused migration tests and a disposable PostgreSQL/pgTAP harness. Do not mark 7.1–7.2 complete until the Storage API deletion worker and retry/failure behavior are also proven.

## Slice 7 Work Unit 2 — durable reconciliation queue

- [x] Added an isolated SQL queue contract with durable approval/audit state, atomic `SKIP LOCKED` claim, immediate four-column product-reference and 24-hour-age recheck, failed-item retry, token-bound completion, and explicit recovery for stranded active claims.
- [ ] Tasks 7.1–7.2 remain incomplete: the Storage API worker, bounded deletion execution, and end-to-end failure outcome still belong to later work units.
- [ ] Task 7.3 remains incomplete.

### TDD Cycle Evidence

| Work unit | Test file/layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| S7-WU2 queue | `tests/unit/storage-orphan-reconciliation-migration.test.ts` / static contract + PostgreSQL runtime | Existing recovered tests 7/7 | Consolidation test failed 1/7 because manual recovery was absent from the isolated migration | Focused suite passed 7/7 after adding recovery and failed-state claim | Runtime covered orphan claim, duplicate claim denial, manual failed recovery, retry, referenced discovery, and reference-after-approval protection | Consolidated the final safe queue contract into one rollbackable migration; obsolete intermediate migrations remain unstaged |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm run test:unit -- tests/unit/storage-orphan-reconciliation-migration.test.ts` → 1 file, 7/7 passed |
| Runtime harness | Transactional `psql` harness in `asados-supabase-db` applied the migration, exercised approval/claim/duplicate denial/manual recovery/retry/two reference guards, and rolled back; exit 0 |
| Static quality | Targeted ESLint exited 0; staged diff check passed |
| Review budget | 356 authored additions across the isolated migration and focused static test; hybrid progress evidence remains outside the code commit |
| Rollback boundary | Revert this work-unit commit; no Storage object is deleted and the intermediate untracked migrations remain outside it |

## Slice 7 Work Unit 3 — Storage API deletion worker

- [x] Added an isolated worker boundary that atomically claims one reconciliation, removes only the claimed object through the `produto-imagens` Storage API, and finalizes success or retriable failure using the exact claim token.
- [ ] Tasks 7.1–7.2 remain incomplete: the existing untracked Server Action/UI wiring is deliberately outside this commit, and a full queue-to-Storage runtime harness remains pending.
- [ ] Task 7.3 remains incomplete.

### TDD Cycle Evidence

| Work unit | Test file/layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| S7-WU3 worker | `tests/unit/storage-orphan-deletion-worker.test.ts` / unit integration boundary | N/A: new isolated files | Import failed because the worker module did not exist | Focused suite passed 4/4 after minimum worker implementation | Success, secret-safe Storage failure, absent claim, token-bound finalization rejection | Extracted finalization helper; focused suite remained green |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm run test:unit -- tests/unit/storage-orphan-deletion-worker.test.ts tests/unit/storage-orphan-reconciliation-migration.test.ts` → 2 files, 11/11 passed |
| Runtime harness | Disposable local Storage API upload and first deletion succeeded with HTTP 200. A second delete returned HTTP 400, proving retry safety must come from the durable claim boundary rather than treating raw Storage DELETE as idempotent. The disposable object was removed; no production system was touched. |
| Static quality | Targeted ESLint and staged diff check passed. Full `tsc --noEmit` remains blocked only by two unrelated pre-existing errors in `playwright.config.ts` and `tests/unit/home-redirect.test.ts`. |
| Review budget | 142 authored additions across the isolated worker and focused tests, below 400 lines. |
| Rollback boundary | Revert commit `d17760e`; this removes only the reusable deletion worker and its tests while preserving the SQL queue, classifier, dirty action/UI/scanner work, and unrelated changes. |
| Commit | `d17760e feat(storage): execute orphan deletion claims` |

## Slice 7 Work Unit 4 — authorized Server Action execution

- [x] Added a narrow Server Action entry point that validates the reconciliation UUID, re-authenticates every direct invocation, permits only active `admin`/`supervisor` profiles, and delegates deletion to the existing claim-token-bound Storage worker using the authenticated server client.
- [x] Proved the disposable local queue → approval → claim → Storage API delete → token-bound completed state path.
- [ ] Tasks 7.1–7.2 remain incomplete pending complete scanner/report integration evidence and final Slice 7 acceptance reconciliation.
- [ ] Task 7.3 remains incomplete pending the recurring secret-safe consumer/key-activity gate.

### TDD Cycle Evidence

| Work unit | Test file/layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| S7-WU4 action | `tests/unit/storage-orphan-reconciliation-execution-action.test.ts` / unit integration boundary | Existing action+worker tests passed 15/15 before edits | New authorization/delegation suite failed 3/4 because execution bypassed the operator boundary and duplicated worker logic | New suite passed 4/4 after routing the action through authorization and the reusable worker | Seller denial, active admin, active supervisor, invalid UUID before client creation | Removed duplicated claim/Storage/finalization implementation from the committed action boundary; focused isolated suite remained green |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | Committed isolated action+worker source: `npm run test:unit -- tests/unit/storage-orphan-reconciliation-execution-action.test.ts tests/unit/storage-orphan-deletion-worker.test.ts` → 2 files, 8/8 passed. Broader current worktree Slice 7 suite → 4 files, 25/25 passed. |
| Runtime harness | Disposable local Supabase authenticated-admin path uploaded one temporary WebP, recorded and approved its durable queue row, claimed it, deleted it through Storage API, and verified `completed`, `attempts=1`, cleared claim token, non-null completion time, null error, and absent object. Temporary harness file/object were removed; no production system was touched. |
| Static quality | Targeted ESLint passed on action/tests; staged diff check passed. |
| Review budget | 130 authored additions across two committed files, below 400 lines. |
| Rollback boundary | Revert commit `9ee0792`; this removes only the authorized execution Server Action and its focused tests, preserving classifier, durable queue, reusable worker, unrelated scanner/list/UI work, and prior slices. |
| Commit | `9ee0792 feat(storage): authorize orphan cleanup execution` |

### Next Slice 7 boundary

Run gate 7.3: repeat the secret-safe current/replacement/legacy key activity and consumer scan without exposing values. Then reconcile all Slice 7 acceptance evidence—especially the dry-run scanner/report path—before marking 7.1–7.3 complete.

## Slice 7 Work Unit 5 — dry-run scanner, durable reports, and final gate

- [x] Added an authenticated admin/supervisor dry-run scanner limited to the `produtos/` prefix. It recursively paginates Storage, records valid objects through the durable classifier RPC, persists safe reports for unusable metadata, and never invokes object deletion.
- [x] Reconciled Slice 7 acceptance across commits `855d958`, `891cae5`, `d17760e`, `9ee0792`, and `40bd21f`: scope/grace/reference classification, durable approval and audit, atomic claim/recheck/retry, Storage API deletion, safe failure state, and the authenticated execution boundary are all covered.
- [x] Completed gate 7.3 with a secret-safe live-container consumer scan and replacement-key status probes. No legacy credential was used, printed, mutated, disabled, or rotated.

### TDD Cycle Evidence

| Work unit | Test file/layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| S7-WU5 scanner/report | `tests/unit/storage-orphan-reconciliation-scan.test.ts` and migration contract / unit + local runtime | Current recovered Slice 7 suite passed 28/28 | Scanner suite failed 6/6 against the committed action because the dry-run action did not exist | Scanner and migration suites passed 13/13 after the isolated implementation | Recursive folders, 1,001-object pagination, unauthenticated/inactive denial, invalid timestamp, and malformed metadata | Removed unrelated list/approval code and an unused select constant from the commit boundary |
| 7.3 gate | `tests/unit/credential-consumer-migration.test.ts` / unit gate + read-only runtime | Prior gate contract available | N/A: recurring validation gate, no production change | Credential-safe suite passed 6/6; both replacement status probes returned HTTP 200 | Replacement and legacy fingerprints compared across 22 running containers | Values remained process-local; evidence records only fingerprints, counts, names, and status codes |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `npm run test:unit -- tests/unit/storage-orphan-reconciliation-scan.test.ts tests/unit/storage-orphan-reconciliation-migration.test.ts` → 2 files, 13/13 passed. Pre-isolation current Slice 7 suite → 5 files, 28/28 passed. |
| Runtime harness | Disposable local Storage fixture listed two product-prefix objects. Durable RPC classification recorded one 25-hour object as `pending` and one fresh object as `protected`; `deletedByScan=false`. Transactional report RPC calls returned success twice and proved `occurrences=2`, then rolled back. Fixture objects and queue rows were removed. |
| Static quality | Targeted ESLint exited 0 and staged diff check passed. |
| Credential gate | 22 running containers scanned by in-memory truncated SHA-256 comparison: replacement publishable/privileged consumers 5/5, legacy publishable/privileged matches 0/0. Replacement Auth and REST status probes returned HTTP 200. Credential-safe unit gate passed 6/6. |
| Limitations | Live scan covers running Docker `Config.Env` consumers only; it does not establish stopped/systemd/CI/remote consumer state or remote legacy-key enablement. The accepted temporary-risk exception remains active through Slice 8 and expires at Slice 9. |
| Review budget | Commit `40bd21f` contains 285 authored additions across the scanner action, durable report migration, and focused tests; below 400 lines. |
| Rollback boundary | Revert `40bd21f` to remove only dry-run enumeration/reporting. Revert the preceding four Slice 7 commits to remove the complete orphan-reconciliation capability without affecting Slices 1–6 or unrelated dirty UI/list work. |

### Slice 7 completion

Tasks 7.1–7.3 are complete. The next autonomous SDD boundary is Slice 8 UI/accessibility/local-E2E work; production mutation, build/restart/replacement, and deployment remain prohibited through Slice 8.
