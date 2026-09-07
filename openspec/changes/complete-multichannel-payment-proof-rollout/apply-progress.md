# Apply Progress: Complete Multichannel Payment-Proof Rollout

## Delegated bounded infrastructure fix — self-hosted SQL harness isolation

Status: completed within the parent-assigned infrastructure work-unit slice.

### Completed work

- Updated `scripts/run-selfhost-supabase-tests.sh` so each selected SQL harness receives a uniquely named fresh disposable database restored from canonical `postgres`.
- Kept the container workspace copy outside the test loop so source fixtures are copied once.
- Scoped dblink conninfo to the current disposable database and retained URI encoding without echoing the password.
- Added per-test success cleanup plus EXIT/HUP/INT/TERM cleanup of the currently tracked database.
- Preserved selected-harness invocation, path validation, sequential fail-fast behavior, and canonical `postgres` read-only use except disposable database create/drop operations.
- Updated `tests/unit/selfhost-supabase-test-runner.test.ts` to assert per-test creation/restore/execution/drop structure and current-database signal cleanup.

No existing OpenSpec implementation checkbox exactly represents this delegated harness-infrastructure fix, so no unrelated task checkbox was changed.

### Files changed

- `scripts/run-selfhost-supabase-tests.sh`
- `tests/unit/selfhost-supabase-test-runner.test.ts`
- `openspec/changes/complete-multichannel-payment-proof-rollout/apply-progress.md` (phase evidence only; outside the delegated code edit surface, required by the SDD persistence contract)

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Per-harness disposable DB isolation and robust current-DB cleanup | `tests/unit/selfhost-supabase-test-runner.test.ts` | Unit/contract | 2/2 passing | New per-test helper/loop assertions failed because `run_test` was absent; signal assertions then failed against the shared trap | 3/3 passing | Covered unique sequential names, restore and psql binding, one-time workspace copy, per-test cleanup, and HUP/INT/TERM cleanup | Explicit cleanup helper and signal exit-status preservation; 3/3 passing |

### Verification evidence

- Baseline: `npx vitest run tests/unit/selfhost-supabase-test-runner.test.ts` — 1 file passed, 2 tests passed.
- RED 1: focused Vitest — 1 failed, 2 passed; missing `run_test()` per-test lifecycle.
- GREEN 1: focused Vitest — 1 file passed, 3 tests passed.
- RED 2: focused Vitest — 1 failed, 2 passed; signal-specific cleanup traps absent.
- Final focused Vitest: `npx vitest run tests/unit/selfhost-supabase-test-runner.test.ts` — 1 file passed, 3 tests passed.
- Shell syntax: `sh -n scripts/run-selfhost-supabase-tests.sh` — exit 0, no output.
- Diff hygiene: `git diff --check -- scripts/run-selfhost-supabase-tests.sh tests/unit/selfhost-supabase-test-runner.test.ts` — exit 0.
- Bounded diff: 2 delegated files, 63 insertions and 19 deletions at final inspection.

### Deviations

- No self-hosted SQL integration harness was run because the delegated verification explicitly requested focused Vitest, shell syntax, and diff checking; this avoids mutating or depending on a live local database service.
- No production, deployment, package installation, secrets output, commit, or push action was performed.

### Remaining implementation tasks

The current OpenSpec task artifact still contains pre-existing unchecked implementation work for Telegram gating, operational handoff, and acceptance checks. Those rows are outside this delegated infrastructure slice and remain unchanged. Parent-owned production lifecycle rows are deferred unchanged.

### Workload / PR boundary

This is a bounded infrastructure-fix slice limited to the self-hosted SQL runner and its focused unit contract. The code/test diff is below the 400-line budget. The parent provided the resolved feature-branch-chain delivery path.

### Structured status consumed/produced

- Change: `complete-multichannel-payment-proof-rollout` (resolved from the parent task and confirmed on disk).
- Artifact store: `both`; OpenSpec directory present and used as authoritative file-backed context. Engram was unavailable at `127.0.0.1:7437`, so file persistence was completed and memory mirroring could not be performed.
- Required artifacts: proposal, specs, design, and tasks were read from the current change.
- Apply state: ready for the delegated bounded work; broader change remains incomplete.
- Action context: repo-local; workspace root `/home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy`; allowed code edit roots were exactly the two delegated files. The required apply-progress evidence file was updated under the current OpenSpec change.
- Workspace/branch checks: physical root and Git toplevel matched the assigned worktree; branch was `fix/client-payment-flow-deploy`.
- Warning: the worktree already contained many parent-owned modifications; none outside the delegated surfaces and this required progress artifact were altered by this slice.

## Delegated documentation slice — current local validation evidence

Status: completed within the parent-assigned evidence-only slice. Production gates and posture remain unchanged.

### Completed work and persisted checkbox updates

- Recorded the current local validation results in this progress artifact and both payment-proof handoff documents.
- Clarified that the SQL runner now creates one fresh disposable database per harness and that harness imports are conditional when forward migrations are already applied.
- Preserved the intervention point immediately before a real Evolution PDF send.
- Made no claim that a production migration was applied, a production image was built or deployed, or a production WhatsApp/Telegram canary completed.
- Exact task checkbox changes: none. This evidence-only slice does not fully satisfy any remaining implementation-owned row, and all production lifecycle rows remain parent-owned and unchecked.

### Files changed in this slice

- `docs/payment-proof-development-continuation.md`
- `docs/payment-proof-operations.md`
- `openspec/changes/complete-multichannel-payment-proof-rollout/apply-progress.md`

`openspec/changes/complete-multichannel-payment-proof-rollout/tasks.md` was reviewed and preserved byte-for-byte because no full task became complete.

### Current local verification evidence

| Check | Sanitized result |
|---|---|
| Full isolated self-host SQL suite | `npm run selfhost:test:db` passed after per-harness database isolation. |
| Focused SQL runtime | Resolver 16/16; immutable provenance 26/26; WhatsApp inbound window 9/9; atomic Evolution admission 22/22. |
| Global Vitest | 205 files passed and 1 skipped; 1,264 tests passed and 1 skipped. |
| TypeScript | `npx tsc --noEmit` passed after correcting modified-test types. |
| Lint | Passed with 0 errors and 67 pre-existing warnings. |
| Diff hygiene | `git diff --check -- openspec/changes/complete-multichannel-payment-proof-rollout/tasks.md openspec/changes/complete-multichannel-payment-proof-rollout/apply-progress.md docs/payment-proof-development-continuation.md docs/payment-proof-operations.md` passed with no output. |
| Production build | Local build passed on Next.js 16.3.0 with 23 pages; no image was built or deployed. |
| Dependency tree | npm-only React 19.2.4 and ReactDOM 19.2.4; no pnpm. |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused evidence | Existing focused SQL runtime results recorded: 16/16, 26/26, 9/9, and 22/22. |
| Runtime harness | Existing full `npm run selfhost:test:db` result recorded as passing; no production runtime was invoked. |
| Rollback boundary | Revert only this documentation/evidence section and the matching local-evidence sections in the two handoff documents. |

### TDD Cycle Evidence

| Task | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Evidence-only documentation update | N/A — no production behavior changed | Recorded supplied passing local evidence without changing code | Cross-checked the same counts and non-production boundary across three artifacts | Kept the result concise and separated local checks from production authority |

### Deviations and non-actions

- No deviation from the design: capability gates and production posture remain unchanged, Telegram is not marked migrated or canary-complete by this slice, and the real Evolution send remains an explicit intervention boundary.
- No product code, migration, test, deployment configuration, secrets, production service, gate, commit, or remote branch was changed.
- The requested checks were recorded from current supplied/local evidence rather than rerun, except for bounded repository checks noted below.

### Remaining tasks

- All previously unchecked implementation-owned task rows remain unchecked, including Telegram startup-gate implementation, operational handoff completion, and acceptance checks.
- All parent-owned production migration, image, canary, lifecycle, replay, deployment, release, and merge actions remain deferred unchanged.

### Workload / PR boundary

- Mode: authorized `feature-branch-chain`; this is a concise evidence-only documentation slice.
- Boundary: the four approved documentation/OpenSpec surfaces only; no product/runtime implementation.

### Structured status consumed

- Native authoritative status: artifact store `openspec`, `applyState: ready`, 8/30 tasks complete, next recommendation `apply`.
- Action context: repo-local at `/home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy`; the user further restricted edits to four absolute file surfaces.
- Workspace identity and branch matched the delegated task. Existing unrelated worktree modifications were treated as parent-owned and left untouched.

## Delegated implementation slice — Telegram startup gate

Status: completed locally; no deployment, Web recreation, or Telegram canary was performed.

### Completed work

- Added the startup-captured, default-closed `TELEGRAM_PAYMENT_PROOF_INGEST_ENABLED` operational gate and privileged redacted diagnostics/UI state.
- Made Telegram PDF admission eligible only when canonical and Telegram gates are both effective; a closed Telegram gate returns through the legacy document path before token lookup, document download, or canonical admission.
- Preserved Web canonical intake behavior and the existing WhatsApp gate independently.
- Declared the closed default in Compose and the environment template; immutable-image rollback/automatic promotion recovery explicitly closes Telegram alongside every payment-proof gate.
- Added focused coverage for malformed/unreadable/startup-immutable gate evaluation, redacted diagnostics, and all canonical×Telegram combinations. The existing authentication, duplicate, PDF validation, and download-boundary cases remain in the focused Telegram suite.
- Updated the two sanitized handoff documents. The completed Telegram baseline remains evidence only and must not be repeated.
- Marked the completed Work Unit 3 RED/GREEN implementation rows in `tasks.md`; the final TRIANGULATE row remains unchecked because the parent did not authorize `npm run selfhost:config`, and the no-canary and broader handoff/production rows remain unchecked.

### TDD and validation evidence

- RED: the focused gate, diagnostics, and Telegram suite failed as expected before implementation (4 failures: missing Telegram gate in gate state and diagnostics, plus canonical-open/Telegram-closed admission).
- GREEN/TRIANGULATE: `npx vitest run tests/unit/payment-proof-operational-gates.test.ts tests/unit/telegram-payment-proof-intake.test.ts tests/unit/payment-proof-operational-gates-diagnostics.test.ts` passed: 3 files, 22 tests.

## Authorized Telegram-gate production deployment — sanitized close evidence

Status: completed. This records the authorized deployment only; it neither repeats nor authorizes a Telegram canary.

| Evidence | Sanitized result |
|---|---|
| Immutable Web image | `asados-web:telegram-gate-579a4d8-20260906T134909Z` |
| Image digest | `sha256:339d8924…` (sanitized prefix) |
| Gate posture | Canonical intake `true`; Telegram, WhatsApp, processing, reconciliation, replay, and cleanup `false`. |
| Production health | Web healthy, zero restarts; internal live/ready and public live/login each returned HTTP 200. |
| Queue/write observation | Processing/outbox dead letters 0/0; zero recent Telegram writes. |
| Canary boundary | Completed Evolution canary remains accepted evidence; Telegram canary was not repeated. |
| Local Telegram-gate validation | `npm run selfhost:config` passed; focused tests 22/22; global Vitest 205 passed/1 skipped files and 1,267 passed/1 skipped tests; TypeScript and build passed; lint 0 errors/67 warnings; diff check passed. |

No full sensitive identifiers, secrets, payloads, customer content, or provider identifiers are retained in this evidence. No commit or provider action occurred.

## Delegated production slice — quarantine→restore canary (Task101)

Status: **blocked after the authorized restore transition; safely closed**. The real browser restore completed and the repeat attempt was safely rejected, but the natural Web outbox delivery reached a dead-letter stop condition, so the canary is not accepted as complete.

### Completed work and persisted checkbox updates

- Created a new private `chmod 600` manifest before provisioning, containing fresh generated fixture and temporary actor references; no credentials, PII, storage keys, or full identifiers are reproduced here.
- Provisioned one synthetic Web customer, conversation, pending order, valid PDF Storage object/hash proof, active temporary admin, and active temporary seller. No operational events or jobs were forged during fixture setup.
- Authenticated through real Supabase sessions. The admin acquired a real lease and rejected the fixture through `manage_payment_proof_review`; the seller restore RPC was denied without a restore event or correction intent.
- Verified the quarantine deadline was within the expected ten-day window, with one role-snapshotted rejection event and one rejection outbox intent.
- Recreated Web only from immutable image digest alias `sha256:a22cc0dd…`, temporarily opening restore while canonical remained open and Telegram, WhatsApp, processing, reconciliation, replay, and cleanup remained closed.
- Drove the actual login and admin UI restore through Playwright selectors. The proof transitioned to review, retention fields cleared, one admin role-snapshotted restore event and one unique correction outbox intent existed, and a repeated browser request could not produce a second restore event or correction intent.
- Exact task checkbox changes: none. Task101 corresponds to a parent-owned operational lifecycle row, which this executor preserved byte-for-byte; the dead-letter stop condition also prevents completion.

### Files changed

- `scripts/payment-proof-restore-canary.mjs`
- `tests/unit/payment-proof-restore-canary.test.ts`
- `openspec/changes/complete-multichannel-payment-proof-rollout/apply-progress.md` (mandatory cumulative phase evidence)

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Select the quarantine queue and await the exact fixture card before restoring | `tests/unit/payment-proof-restore-canary.test.ts` | Unit/browser contract | 5/5 passing | Added selector/wait assertions; each failed before implementation | 5/5 passing | Generalized the queue count matcher and awaited the target card to cover asynchronous list loading | No broader refactor; focused suite remained 5/5 |

### Verification evidence

- Focused Vitest baseline: 1 file, 5 tests passed.
- RED queue-selection assertion: 1 failed, 4 passed.
- RED asynchronous-card assertion: 1 failed, 4 passed.
- Final focused Vitest: 1 file, 5 tests passed.
- Real browser admin restore: completed against `localhost:3020` through login, quarantine queue, restore dialog, and review-state navigation.
- Database invariants after restore: review state with retention cleared; exactly one restore event; exactly one restore correction intent; rejection event/intent retained; seller restore denied; repeated UI attempt produced no duplicate event/intent.
- Stop condition: natural scheduler delivery failed for the synthetic Web destination; the rejection intent reached `dead_letter` and the correction intent remained retryable/pending. No global maintenance invocation was performed.
- Final safety: Web healthy with zero restarts on the immutable expected image; maintenance scheduler healthy with zero restarts; restore closed; all other protected gates closed; canonical remained open; both generated staff actors inactive; temporary environment symlinks removed.
- Private manifest/log directory remains under `/tmp/asados-restore-*` with directory mode `700` and sensitive artifacts mode `600`, at durable stage `blocked-deadletter-closed-inactive`.

### Deviations and stop handling

- The canary could not verify exactly-once original-Web rejection and correction delivery because the fixture's natural Web outbox dispatch failed. Per the explicit stop rule, execution stopped rather than invoking the global scheduler, forging notifications, replaying, purging, or processing.
- The synthetic fixture and required audit/outbox evidence were retained for exact-scope diagnosis; no historical fixture was used and no external notification was sent.

### Remaining tasks

- All five previously unchecked implementation-owned task rows remain unchecked.
- The parent-owned quarantine→restore canary row remains unchecked and deferred because notification delivery did not complete.
- Exact operational remediation needed: diagnose why service-role Web outbox upsert returns `delivery_failed` for this isolated conversation, then retry only under a separately authorized bounded restore-canary continuation without deleting the existing dead-letter/audit evidence.

### Workload / PR boundary

- Authorized `feature-branch-chain`; this slice changed only the bounded canary runner and focused unit test, below the 400-line budget.
- No commit, push, image build, migration edit, historical fixture use, cleanup, replay, or unrelated deployment occurred.

### Structured status consumed

- Native authoritative OpenSpec status: `applyState: ready`, 14/30 total rows complete, `nextRecommended: apply`, no blocked reasons.
- Ownership-resolved implementation progress: 14/19 complete and 5 unchecked; parent lifecycle: 0/11 complete and 11 unchecked; no malformed ownership markers.
- Action context: repo-local at the assigned isolated worktree. User edit roots covered the runner, focused test, temporary symlinks, and private `/tmp` artifacts; this cumulative apply-progress update is required by the SDD persistence contract.
- Runtime attempt acquired for `task101-restore-production-canary`; the stop condition is settled as failed with gates closed and generated actors inactive.

## Delegated defect repair — Web payment-proof outbox schema mismatch

Status: completed locally in one bounded repair unit; no deployment, production mutation, dead-letter replay, lifecycle gate, or auth change was performed.

### Completed work and persisted checkbox updates

- Added forward migration `20260906190000_payment_proof_web_message_idempotency.sql`: nullable `text` `public.mensagens.external_id` plus one normal/non-partial unique index, preserving historical NULL rows and existing table privileges.
- Changed Web outbox dispatch to PostgREST conflict-ignore semantics (`onConflict: external_id`, `ignoreDuplicates: true`), so a retry or key collision cannot rewrite the already-delivered row's conversation, content, or attachment fields.
- Added a dedicated pgTAP harness, focused dispatcher/bootstrap tests, and an isolated disposable PostgREST script that exercises the real `on_conflict=external_id` endpoint with `resolution=ignore-duplicates`.
- Added and checked three implementation-owned defect-repair rows in `tasks.md`; parent-owned production/deployment/replay rows remain byte-for-byte deferred.

### Files changed in this repair boundary

- `supabase/migrations/20260906190000_payment_proof_web_message_idempotency.sql`
- `supabase/tests/payment_proof_web_message_idempotency.sql`
- `apps/web/src/lib/payment-proofs/outbox-dispatch.ts`
- `tests/unit/payment-proof-outbox-dispatch.test.ts`
- `tests/unit/payment-proof-harness-bootstrap.test.ts`
- `scripts/test-payment-proof-web-message-idempotency.mjs`
- `openspec/changes/complete-multichannel-payment-proof-rollout/{tasks.md,apply-progress.md}` (mandatory cumulative SDD persistence)

### TDD Cycle Evidence

| Task | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| Prevent Web delivery-key collisions from mutating delivered messages | Vitest dispatcher | 2 focused assertions failed because `ignoreDuplicates` was absent | Dispatcher requested conflict-ignore and 6/6 focused tests passed | Exact options/payload assertions cover changed destination/content replay | No broader dispatch refactor was necessary |
| Provide the missing PostgREST arbiter while retaining historical rows | pgTAP / PostgREST | Existing schema inspection established the absent column and the dispatcher failure; the new harness could not bootstrap before its forward migration existed | Disposable pgTAP passed 10/10 | Disposable PostgREST v14.12 performed first insert and collision-ignore; database retained exactly one original row | Kept migration forward-only and limited to the column, index, and comment |

### Verification evidence

- Focused Vitest RED: 2 expected failures in the dispatcher suite before production change.
- Focused Vitest GREEN: 2 files, 32 tests passed.
- Disposable self-hosted pgTAP: 10/10 assertions passed, including nullable text catalog shape, non-partial unique arbiter, NULL coexistence, immutable collision result, and service-role privileges.
- Isolated real PostgREST v14.12: first insert succeeded; same-key changed destination/content was ignored; exactly one original message remained.
- `npm run build --workspace @asados/web`: passed, including TypeScript.
- Scoped ESLint: 0 errors; the isolated `.mjs` script is ignored by repository lint configuration and `node --check` passed.
- `git diff --check`: passed.
- Temporary `ops/supabase/.env` symlink was removed after each disposable validation; temporary PostgREST container and database were removed.

### Deviations and remaining tasks

- No deviation from the approved repair design. The optional real PostgREST validation was implemented and run rather than omitted.
- Existing dead-lettered intents were not replayed or mutated. Deployment, production migration, and exact-scope replay remain parent lifecycle responsibilities.
- Exact unchecked implementation-owned rows outside this delegated repair remain unchanged in `tasks.md`; all parent-owned rows remain deferred.

### Workload / PR boundary

- Authorized `feature-branch-chain`; this repair is a separate bounded causal unit (approximately 157 authored additions/deletions across implementation, tests, migration, and isolated validator), below the 400-line budget.
- No commit, push, deployment, production mutation, replay, gate change, or auth change occurred.

### Structured status consumed

- Native authoritative OpenSpec status supplied/previously resolved for change `complete-multichannel-payment-proof-rollout`: `applyState: ready`, `nextRecommended: apply`, with authorized feature-branch-chain delivery.
- Action context was restricted to `/home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy` and the delegated repair surfaces; all implementation and disposable validation stayed within those roots.

## Delegated collision-semantics correction — Web outbox binding confirmation

Status: completed locally in the existing bounded repair unit; no production operation or migration application was performed.

### Completed work and persisted checkbox updates

- Added the required post-upsert read by `external_id`, selecting `conversa_id`, `remetente`, `conteudo`, and `url_anexo` before Web delivery acknowledgement.
- Exact persisted bindings return success; divergent bindings return permanent `delivery_conflict`; missing rows and PostgREST read errors remain retryable `delivery_failed` outcomes.
- Reworked focused tests to distinguish exact duplicate acknowledgement, divergent collision rejection, and failed/missing binding reads.
- Upgraded the disposable PostgREST script to load and execute the real dispatcher, proving first insert and exact duplicate success while rejecting a divergent collision and retaining one original row.
- Re-read and refined the two already-checked implementation rows in `tasks.md` so their persisted wording explicitly captures binding confirmation and dispatcher-level PostgREST semantics. They remain visibly `[x]`.

### Files changed in this correction

- `apps/web/src/lib/payment-proofs/outbox-dispatch.ts`
- `tests/unit/payment-proof-outbox-dispatch.test.ts`
- `scripts/test-payment-proof-web-message-idempotency.mjs`
- `openspec/changes/complete-multichannel-payment-proof-rollout/{tasks.md,apply-progress.md}`

The unapplied migration and pgTAP harness were verified without requiring further edits.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Bind Web delivery acknowledgement to persisted message fields | `tests/unit/payment-proof-outbox-dispatch.test.ts` | Unit | 6/6 passed | 3 new tests failed because no binding read occurred, divergence returned success, and read failures returned success | 7/7 passed after the minimal post-upsert read/compare | Exact duplicate, divergent destination/content, missing row, and read-error paths covered | Shared `expected` binding keeps write/read comparison aligned; 7/7 retained |
| Exercise dispatcher semantics over disposable PostgREST | `scripts/test-payment-proof-web-message-idempotency.mjs` | Integration | Prior storage-only script passed but did not call dispatcher | First dispatcher execution exposed missing Vite alias, then a Supabase client base-path mismatch | Vite alias and bounded PostgREST adapter allowed the real dispatcher to pass | First insert, exact duplicate, divergent collision, one-row count, and four-field original binding verified | Kept the adapter local to the disposable test; no production architecture added |

### Verification evidence

- Focused Vitest safety net: 1 file, 6 tests passed.
- RED: 1 file, 3 failed and 4 passed for absent binding confirmation behavior.
- Final focused Vitest: 1 file, 7 tests passed.
- Disposable pgTAP: 10/10 assertions passed.
- Disposable PostgREST v14.12 dispatcher run: first insert and exact duplicate acknowledged; divergent collision returned permanent conflict; one original binding remained.
- `npx eslint apps/web/src/lib/payment-proofs/outbox-dispatch.ts tests/unit/payment-proof-outbox-dispatch.test.ts`: passed with no output.
- `node --check scripts/test-payment-proof-web-message-idempotency.mjs`: passed.
- Scoped `git diff --check`: passed.
- `npx tsc --noEmit`: blocked by a pre-existing, out-of-scope error in `tests/unit/payment-proof-restore-canary.test.ts:51` (`TS2358`); no error identified in the delegated files before TypeScript stopped.
- Temporary `ops/supabase/.env` symlink and disposable PostgREST/database resources were removed.

### TOCTOU assessment and deviations

- The read-after-write check closes false acknowledgement for stable rows under the current delivery contract. A theoretical TOCTOU remains if a privileged concurrent writer mutates the same row after the confirmation read; the non-partial uniqueness constraint alone does not prevent field updates.
- No extra trigger/RPC/immutability architecture was added because the requested minimal correction is a binding confirmation, and ordinary dispatcher retries use conflict-ignore rather than updates.
- No production migration, deployment, replay, gate change, commit, push, or production service action occurred.

### Remaining tasks and lifecycle boundary

- Unchecked implementation-owned documentation/handoff and acceptance rows remain outside this correction.
- Parent-owned production migration, replay, canary, deployment, release, and merge actions remain deferred byte-for-byte.
- Next route after broader implementation completion remains `parent-lifecycle`; this executor did not start verification or receipt actors.

### Workload / PR boundary and status

- Authorized `feature-branch-chain`; this correction remains inside the existing bounded Web idempotency repair PR unit and below the 400-line budget.
- Authoritative store: OpenSpec (`both` configuration with an on-disk `openspec/` directory). Change selection was explicit and confirmed at `openspec/changes/complete-multichannel-payment-proof-rollout`.
- Apply state remains `ready` for the broader change because unrelated implementation-owned tasks are unchecked. Action context was repo-local with only the user-listed surfaces edited.

## User-authorized production repair lifecycle — pre-deployment fail-closed result

Status: **blocked before migration, image build, deployment, replay, or Auth mutation** because the mandatory global Vitest gate was red.

### Executed preflight and verification

- Confirmed the physical working directory and Git toplevel both exactly matched `/home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy`; branch remained `fix/client-payment-flow-deploy`.
- Consumed authoritative native OpenSpec status for `complete-multichannel-payment-proof-rollout`: `applyState: ready`, 17/33 rows complete, `nextRecommended: apply`; verification/archive remain blocked by an invalid prior verify-result envelope.
- Confirmed the authorized `feature-branch-chain` delivery path and bounded production-repair slice despite the high 400-line workload forecast.
- Read the proposal, all applicable delta specs, design, tasks, cumulative apply progress, prior diagnosis, strict-TDD guidance, deploy/migration scripts, and private fixture-manifest shape without exposing values.
- `git diff --check` passed.
- `npx tsc --noEmit` passed, confirming the parent-provided test typing correction.
- Mandatory global `npm test -- --run` failed: 206 files passed, 1 skipped, and 1 failed; 1,280 tests passed, 1 skipped, and 1 failed. The sole failing test was the migration-runner current-inventory contract in `tests/unit/supabase-migrate-script.test.ts`.
- A focused rerun of that exact test failed again, proving the global failure was reproducible rather than transient.
- Confirmed the current Web and maintenance scheduler were healthy with zero restarts and that the retained previous immutable Web image still existed at the expected private digest.
- Confirmed effective production gate posture remained canonical open with Telegram, WhatsApp, processing, reconciliation, privileged replay, cleanup, and restore closed.
- Confirmed both temporary environment symlink paths were absent after the stopped attempt.

### Fail-closed actions and persisted task state

- Per the explicit mandatory pre-deployment gate, stopped before building an image, inspecting or applying the production migration ledger, applying migration `20260906190000`, invoking `scripts/deploy-web.sh`, changing any actor/Auth record, opening any replay or maintenance gate, replaying either intent, or running scheduler delivery.
- No product source file, migration, deployment script, private fixture, service, database row, or task checkbox was changed.
- Exact persisted task checkbox changes: none. The defect-repair implementation rows remain visibly `[x]`; the parent-owned production deployment/recovery rows remain byte-for-byte unchecked and deferred.
- The private two-intent fixture remains retained at its existing blocked/dead-letter/closed/inactive stage; no identifiers, credentials, content, payload, or full correlation values were copied into this artifact.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Production deployment and exact two-intent recovery | Global Vitest and TypeScript gates | Release preflight | TypeScript and diff hygiene passed | Global Vitest reproducibly failed in the migration inventory contract | Not reached; production execution is prohibited while red | Focused rerun reproduced the same single failure | Not applicable; no implementation edits were authorized |

### Remaining exact operational work

- Resolve the red migration-runner inventory contract without weakening migration validation, then rerun global Vitest, TypeScript, and diff hygiene.
- Only after all mandatory gates are green: build the immutable candidate with safely parsed public build arguments, verify only migration `20260906190000` is pending, apply it as `supabase_admin`, deploy Web with canonical as the sole open gate, and verify health/smoke/zero restarts with rollback readiness.
- Only after successful deployment and read-only aggregate preflight: perform the authorized exact two-intent authenticated replay and natural scheduler delivery, verify one persisted message per key and exact original binding, close temporary authority, and optionally establish a new temporary customer Auth binding for real client visibility if schema-safe.

### Deviations, workload boundary, and action context

- No design deviation occurred; stopping before production mutation is the required behavior for a red global suite.
- PR/work-unit boundary: production repair lifecycle only; no source implementation changes and no commit, push, merge, broad maintenance, unrelated service recreation, external notification, or fixture purge.
- Action context was repo-local. The user-authorized mutable surfaces were private `/tmp/asados-restore-*` artifacts, temporary environment symlinks, and this change's `tasks.md`/`apply-progress.md`; only this cumulative progress artifact changed.
- Engram mirroring could not be performed because the injected memory provider was unavailable at `127.0.0.1:7437`; authoritative OpenSpec persistence succeeded.

## User-authorized production repair lifecycle — build and deploy completion

Status: **completed for this call's build/deploy scope**. Exact two-intent replay was intentionally not started and remains reserved for the next authorized call.

### Validation and execution evidence

- Reused the completed post-wrapper-fix global Vitest run from the private manifest directory: 207 files passed and 1 skipped; 1,281 tests passed and 1 skipped. The private log was complete and timestamped before this deployment continuation.
- Re-ran `git diff --check` and `npx tsc --noEmit`; both passed with no output.
- Confirmed no Docker build/deploy, Vitest, or migration process was active before resuming.
- Built immutable image `asados-web:payment-fix-579a4d8ffa58-20260906T202153Z` with both required public build arguments. The resulting image ID is `sha256:34bf5fa7…` (sanitized prefix); the full local identity remains in the private manifest directory.
- Read the production migration ledger and confirmed the only local pending migration was `20260906190000_payment_proof_web_message_idempotency.sql`.
- Applied the forward migration through `ops/supabase/migrate.sh` with `ASADOS_MIGRATION_DB_USER=supabase_admin`; the production ledger now visibly contains version `20260906190000`.
- Deployed through `scripts/deploy-web.sh` without bypassing its preflight, immutable-image, rollback-retention, health, or smoke checks.
- Preserved canonical intake as the sole open payment-proof gate. Telegram, WhatsApp, processing, seller reconciliation, privileged replay, cleanup, and restore remained closed.
- Post-deploy Web state: healthy, zero restarts, expected immutable image. Internal live/ready/login and public live/ready/login smoke checks passed; protected infrastructure paths remained non-public.
- Removed both temporary environment symlinks created for this lifecycle continuation. No secrets or values were recorded in this artifact.

### Persisted task state and lifecycle boundary

- Exact task checkbox changes: none. This build/deploy action belongs to a parent-owned production lifecycle row and was preserved byte-for-byte; that broader row also includes the later bounded scenarios and therefore is not complete in this call.
- All five unchecked implementation-owned documentation/acceptance rows remain unchanged.
- No replay, scheduler delivery, actor/Auth mutation, fixture cleanup, external notification, source edit, documentation edit, commit, or push occurred.
- Private logs and full image/migration evidence remain under `/tmp/asados-restore-1788717020/` with private permissions.

### Workload / PR boundary and structured status

- Delivery path remained the authorized `feature-branch-chain`; this call was restricted to production validation, immutable build, the single pending forward migration, deployment, and read-only smoke verification.
- Authoritative store: OpenSpec (`both` with an on-disk `openspec/` directory). Change selection was explicit; required proposal, delta specs, design, tasks, and cumulative progress were read. Engram was unavailable, so the mandatory OpenSpec artifact was persisted without claiming a memory mirror.
- Apply state remains `ready` because five implementation-owned rows are still unchecked. Parent lifecycle actions remain deferred to the parent; the next specifically authorized operation is the exact two-intent replay in a separate call.

## User-authorized exact two-intent production recovery — completed

Status: **completed with exact fixture scope**. The repaired immutable deployment and forward migration were used without source/image changes, direct status writes, manual completion writes, global maintenance invocation, or external provider processing.

### Executed recovery and durable evidence

- Confirmed the assigned worktree/branch/change, authoritative OpenSpec artifacts, authorized feature-branch-chain delivery path, deployed expected immutable image alias, applied migration `20260906190000`, healthy Web/scheduler with zero restarts, canonical as the sole open protected gate, two exact fixture outbox rows at `dead_letter` attempt 5, no leases/fences, and zero pre-existing fixture chat projections.
- Confirmed the retained temporary manifest admin was inactive, reactivated only that admin, established a genuine Supabase Auth session, and invoked `replay_payment_proof_dead_letter` exactly twice for the two explicit fixture outbox targets with two fresh UUID idempotency keys. Both RPC outcomes were `replayed`.
- Did not open the Web privileged-replay startup gate: that gate protects the Server Action/UI boundary, while the authenticated SQL RPC independently enforces active supervisor/admin authority. No Web action was required for this bounded SQL-RPC replay.
- Allowed the ordinary scheduler to dispatch naturally; no maintenance endpoint, global maintenance command, direct completed write, status update SQL, dead-letter deletion, compensating message, or unrelated job was invoked.
- Bounded polling converged to fixture scope `2 completed / 0 dead-letter / 0 pending-or-claimed` without a new unexpected error.
- Verified exactly two `mensagens` projections, one per original outbox delivery key, with distinct `external_id`, the original conversation destination, exact resolved symbolic content, `remetente=operador`, and null `url_anexo`. There were no duplicate delivery keys or extra fixture messages.
- Verified exactly two durable replay-request rows with distinct idempotency keys and distinct request fingerprints. The fingerprints matched the RPC's canonical PostgreSQL `jsonb_build_object(... )::text` SHA-256 expression, both outcomes were `replayed`, and exactly two `dead_letter_replay` events exist.
- Preserved the pre-existing fixture evidence: one `operator_reviewed` event and one `restored` event remain; the proof remains in review. No fixture/audit/outbox row was purged.
- Deactivated both generated staff actors at the end. Final fixture actor posture is 0 active of 2. Temporary `.env` and `ops/supabase/.env` symlinks are absent.
- Final runtime posture: expected immutable image, Web healthy/restarts 0, scheduler healthy/restarts 0, canonical true; Telegram, WhatsApp, processing, reconciliation, privileged replay, cleanup, and restore false. Global outbox dead letters were 0 at final inspection.
- Full identifiers, credentials, content, idempotency keys, fingerprints, and row-level comparisons remain only in `/tmp/asados-restore-1788717020/`, directory mode 700 and files mode 600. No sensitive value is copied into OpenSpec.

### Optional acceptance not executed

- Customer-session visibility was not broadened. The synthetic customer has no established Auth attachment in the retained manifest, and changing that mapping solely for optional visibility would add a new identity/FK lifecycle beyond the necessary recovery. The database/API delivery proof is complete; no browser UI claim is made.
- No external Telegram/WhatsApp processing, cleanup, reconciliation, restore, or purge was performed.

### Persisted tasks and lifecycle ownership

- Exact implementation checkbox changes: none. This operational recovery does not fully satisfy any unchecked implementation-owned documentation/acceptance row.
- Parent-owned production lifecycle rows were preserved byte-for-byte and remain deferred to the parent lifecycle. The replay-canary row describes a separate one-target acceptance canary; this user-authorized two-target defect recovery was not substituted for or checked as that lifecycle row.

### Verification commands/evidence

- Read-only production SQL preflight and final invariant queries through the production database container — exact two outbox rows, two messages, two replay audits, two replay events, one restored event, one review event, migration present, actors inactive.
- Genuine authenticated Supabase JS RPC runner from the private manifest — 2/2 `replayed`.
- Natural scheduler bounded poll — converged to 2/2 completed within the observation bound.
- Internal live/ready/login smoke requests — HTTP 200 for all three.
- Docker runtime inspection — expected image, healthy Web/scheduler, zero restarts, final protected-gate posture closed except canonical.

### TDD Cycle Evidence

Strict TDD remained active for code work, but this slice changed no product behavior or source code. Existing RED/GREEN/TRIANGULATE evidence for the deployed idempotency repair remains above; this authorized apply continuation supplied production operational evidence only.

### Deviations and warnings

- The first local fingerprint preview used ordinary JavaScript JSON serialization and did not byte-match PostgreSQL `jsonb::text`; no production decision relied on it. The durable ledger was subsequently checked with the exact SQL expression used by the RPC and matched 2/2.
- During one runtime-inspection command, two maintenance secret values were unintentionally emitted to the executor transcript before the private capture was replaced with an allowlisted gate-only file. They were not written to OpenSpec or the final private gate file. Credential rotation is a remaining parent-owned security action because rotation/recreation was outside this exact-replay authorization.

### Workload / PR boundary and structured status

- Authorized `feature-branch-chain`; this was an operations-only exact recovery slice with no code, image, migration, commit, push, or PR change.
- Authoritative artifact store: OpenSpec (`both` configuration with on-disk `openspec/`). Active change was explicit. Apply state remains `ready` because five unrelated implementation-owned rows remain unchecked; 17/22 implementation-owned rows are checked and 0/11 parent-owned rows are checked.
- Action context: repo-local at `/home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy`; edits were limited to private `/tmp` artifacts, temporary symlinks removed finally, and this cumulative apply-progress artifact. Engram was initially unavailable, then recovered; the apply-progress topic was saved and the task topic was reconciled without claiming a project name different from the active memory session.

## Category A — synthetic expiry/purge and replay authority validation

Status: **completed for the authorized Category A operational slice**. No product source, migration, image, deployment, external notification, commit, push, merge, or historical fixture was changed.

### Private fixture and safety boundary

- Reconfirmed the exclusive worktree and branch before every critical operation. Existing unrelated worktree changes remained untouched.
- Created a mode-0600 exact manifest before any fixture write under a new mode-0700 private directory. The manifest contains three temporary Auth actors (customer, admin, vendedor), two synthetic customers, one conversation, two orders, three proof aliases, five exact storage objects, and fresh replay aliases.
- Explicitly excluded every pre-existing object and historical Telegram/Evolution/restore fixture, including `/tmp/asados-restore-1788717020`.
- Preflight found zero unrelated expired quarantines, active/stale purges, processing dead letters, and outbox dead letters. All protected gates other than canonical intake were closed.

### A1 lifecycle evidence

- Generated a synthetic PDF original and PNG page-one derivative, persisted exact original→preview lineage in the proof row plus immutable render event/attempt metadata, and created quarantine deadlines already beyond retention.
- Claimed only manifested quarantine rows. A restore attempt while one proof held an active purge fence was denied; a fenced retryable completion returned it to quarantine with a bounded delayed retry.
- Deleted exactly the manifested original and derivative for the successful purge candidate and completed with the matching lease token and attempt. Repeating completion with the stale fence returned false and produced no second effect.
- Preserved the hash identities as detached tombstones during fixture row cleanup. Authenticated customer/vendedor table access did not expose the private tombstone ledger; replay/dedupe outcomes remained opaque.
- Removed all five manifested objects by exact path at cleanup. No broad age-, prefix-, or inference-based storage deletion ran.

### A2 replay and real-browser evidence

- Created one isolated processing dead letter. An active admin replay returned `replayed`; the same idempotency key repeated the durable `replayed` outcome; reusing that key for a different target returned `idempotency_conflict`; a non-dead-letter target returned `ineligible`.
- Active vendedor and customer RPC calls were denied by database authority. No external delivery or automatic follow-on replay occurred.
- Real Chromium against the deployed Web authenticated the temporary admin and vendedor. The admin diagnostics disclosed only aggregate counts and sanitized gate states, showed privileged replay closed, and a confirmed Server Action submission returned the stable localized denial. The vendedor could not remain on the admin route and received no payment-proof admin panel.
- The first browser locator attempt failed because the temporary test used the wrong placeholder; the second reached the action and revealed the localized denial text; the corrected third run passed. No production code was changed.

### Verification and final posture

- Focused Vitest: 3 files passed, 31 tests passed.
- TypeScript `npx tsc --noEmit`: passed. `git diff --check`: passed.
- Existing scoped SQL baseline had already passed earlier in this Category A attempt: processing queue, replay, and replay concurrency harnesses.
- Real-browser Playwright: 1 production-Chromium test passed.
- Cleanup deleted temporary Auth users after first marking all profiles inactive; synthetic customers, orders, conversation, proof rows, queue/replay rows, and events are absent; detached tombstones remain.
- Historical close posture for this bounded slice: zero expired quarantine, zero purging, zero processing dead letter, and zero outbox dead letter; Web was healthy and live/ready/login returned 200.
- **2026-09-07 audit correction:** a standalone `asados-payment-proof-maintenance` scheduler does exist and is healthy with zero restarts. The earlier scheduler-absence sentence was false and must not be used as evidence. Current runtime also has 5 processing dead letters; all 8 gates were therefore closed under the strict-stop policy. Current posture is recorded in the operations and continuation handoffs.
- Final startup gates: processing, cleanup, privileged replay, restore, reconciliation, Telegram, and WhatsApp are closed. Temporary `.env` and `ops/supabase/.env` symlinks are absent.

### Persisted tasks, TDD, and boundary

- Exact implementation checkbox changes: none. Category A corresponds to parent-owned lifecycle rows, which remain byte-for-byte unchecked and deferred to the parent lifecycle; this executor does not mark parent-owned rows.
- Strict TDD remained active for code work, but this slice authored no product code. Operational triangulation used pre-existing passing SQL/Vitest coverage plus isolated live synthetic and browser evidence.
- Authorized delivery strategy remained `feature-branch-chain`; this was an evidence-only operations slice and did not create a PR boundary or commit.
- Structured status consumed: authoritative OpenSpec change `complete-multichannel-payment-proof-rollout`, apply state `ready`, explicit repo-local action context, and the user-provided Category A edit/operation boundaries.

## Final bounded Category A positive Web-gated replay and safe closure

Status: **PASS** for the delegated positive Web-only replay acceptance. This operation did not repeat the prior exact-byte, supervisor/repeat, or denial matrices and did not change product source, migrations, image, commits, or parent-owned task rows.

### Positive browser operation and evidence

- Wrote a private mode-0600 manifest before fixture writes under the existing mode-0700 Category A directory. It names one new synthetic Web outbox dead-letter target against the retained synthetic Web proof and conversation; no external channel was used.
- Activated only the manifested supervisor, recreated only Web from immutable image alias `34bf5fa7` with canonical intake and privileged replay open, and kept WhatsApp, Telegram, processing, reconciliation, cleanup, and restore closed.
- Real Chromium authenticated through the operator login, reached `/atendimento/admin?tab=comprovantes`, observed redacted diagnostics with exactly one outbox dead letter, and confirmed the displayed startup gates matched the authorized window.
- Entered the manifested outbox target through the `ID alvo da carta morta` field, checked the explicit confirmation, opened `Confirmar reprocessamento`, and clicked its confirm action exactly once. Sanitized UI outcome was `Reprocessado.`
- Target evidence changed from one `dead_letter` row at attempt 5 to `pending` at attempt 0; the target-specific replay ledger changed 0→1; successful replay audit count for the retained proof changed 2→3. No repeat-key submission was performed in this delegation.
- During the later bounded natural scheduler observation, ordinary outbox dispatch completed the target and created exactly one Web message projection with the manifested delivery key, intended conversation, operator sender, null attachment, and no duplicate projection. No processing gate, maintenance endpoint, manual completion, or manual message write was used.

### Safe closure and retained posture

- Finally recreated only Web with canonical intake true and every other protected gate false: WhatsApp, Telegram, processing, reconciliation, privileged replay, cleanup, and restore.
- Final Web state is healthy, restart count 0, expected immutable image, and ready endpoint HTTP 200.
- All five manifest profiles, including the customer profile, are inactive. Auth users were retained and no auth deletion occurred.
- Temporary root and `ops/supabase` environment symlinks are absent. No raw secret, customer content, phone, or full operational identifier is included here; exact evidence remains private under `/tmp/asados-category-a-acceptance-1788731518/`.

### Persisted tasks, TDD, workload, and status

- Exact implementation checkbox changes: none. The replay acceptance is parent-owned lifecycle work, so parent rows remain byte-for-byte unchanged and deferred to the parent lifecycle.
- Persisted tasks were re-read: 17/22 implementation-owned rows are checked, five exact implementation rows remain unchecked, 0/11 parent rows are checked, and no malformed ownership marker exists.
- Strict TDD is active, but this operations-only slice changed no product code. Browser execution and production invariant queries supplied acceptance evidence; no new RED/GREEN cycle was applicable.
- Delivery path remains the authorized `feature-branch-chain`; this was an evidence-only operations boundary with no commit or PR action.
- Structured status consumed/produced: explicit authoritative OpenSpec change `complete-multichannel-payment-proof-rollout`; proposal, delta specs, design, tasks, and prior cumulative progress present; apply remains `ready` because five implementation-owned rows are unchecked. Action context was repo-local with edits restricted to the user-allowed private runner/manifest files, temporary symlinks removed finally, and this cumulative progress artifact.
- Engram apply-progress was persisted as observation `2054`. The tasks observation was not changed because no implementation checkbox completed; the on-disk authoritative tasks artifact was re-read and remained reconciled.
