# Apply Progress: Atendimento Preview and Sofia Inbound Batching

## Applied work unit

- Change: `atendimento-preview-and-sofia-inbound-batching`
- Slice: PR 1 / Outcome A only — deterministic authenticated receipt preview
- Base: `main`
- Issue: #113 (`type:bug`, `status:approved`)
- Workload: 150 authored changed lines (100 additions, 50 deletions), below the 400-line budget.
- Runtime verification: focused local component runtime completed successfully; no production or staging environment was mutated.
- Rollback boundary: revert only the two receipt-preview components and their two focused test files.

## Completed implementation tasks

- [x] RED preview precedence, attachment fallback, no-target, no-banner-event, and failure-copy tests.
- [x] GREEN pure target resolver, one modal invocation, authenticated paths, and normalized failure copy.
- [x] TRIANGULATE distinct proof-plus-unrelated-attachment, attachment-only, no-target, and fetch/render failure paths.
- [x] REFACTOR kept shared failure copy in one exported constant and retained inline `AttachmentCard` event behavior.

The four matching PR 1 implementation rows are visibly checked in `tasks.md`. The commit row remains unchecked because the user explicitly prohibited commits.

## Files changed

- `apps/web/src/components/operator/OperatorChatConsole.tsx`
- `apps/web/src/components/comprovantes/ModalVisualizadorComprovante.tsx`
- `tests/components/operator/OperatorChatConsoleAttachmentBanner.test.tsx`
- `tests/components/comprovantes/ModalVisualizadorComprovante.test.tsx`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/tasks.md`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/apply-progress.md`

## TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| PR 1 preview routing | `tests/components/operator/OperatorChatConsoleAttachmentBanner.test.tsx` | Component runtime + pure-helper/behavior-level structural unit | Initial safety net exposed a local generated-dependency mismatch; independently repaired and rerun with React/ReactDOM 19.2.4 aligned | Failing import (`resolveReceiptPreviewTarget` absent) plus old banner contract | Full focused runtime command passed | Proof precedence, attachment-only, no-target, single modal route, and no inline event dispatch passed | Full focused 11/11 remained green; lint passed |
| PR 1 visible failures | `tests/components/comprovantes/ModalVisualizadorComprovante.test.tsx` | Component runtime + behavior-level unit | Initial safety net exposed the same local generated-dependency mismatch; independently repaired and rerun successfully | New required constant was `undefined`; source lacked normalized failure use | Full focused runtime command passed | Fetch/non-OK and render failure behavior uses visible actionable Portuguese copy | Full focused 11/11 remained green; lint passed |

The complete focused component runtime now executes successfully. React and ReactDOM are aligned at 19.2.4. The former invalid-hook-call mismatch was a resolved local generated-dependency incident, not a source defect or remaining blocker; the pure-helper and structural assertions remain useful supplemental coverage alongside the successful runtime tests.

## Verification evidence

- Baseline: `npx vitest run tests/components/operator/OperatorChatConsoleAttachmentBanner.test.tsx tests/components/comprovantes/ModalVisualizadorComprovante.test.tsx` → 2 files failed, 7/7 tests failed during the local generated-dependency mismatch incident.
- RED: same focused command after tests were authored → failed as expected because the resolver/copy exports did not exist; runtime execution was temporarily affected by that now-resolved local dependency incident.
- GREEN/TRIANGULATE/REFACTOR focused runtime: `npx vitest run tests/components/operator/OperatorChatConsoleAttachmentBanner.test.tsx tests/components/comprovantes/ModalVisualizadorComprovante.test.tsx` → 2 files passed, 11/11 tests passed.
- Runtime dependency identity: React and ReactDOM aligned at 19.2.4 after the local generated dependency tree was independently repaired.
- Lint: `npx eslint apps/web/src/components/operator/OperatorChatConsole.tsx apps/web/src/components/comprovantes/ModalVisualizadorComprovante.tsx tests/components/operator/OperatorChatConsoleAttachmentBanner.test.tsx tests/components/comprovantes/ModalVisualizadorComprovante.test.tsx` → passed with no output.
- The earlier full-unit invalid-hook-call result came from the now-resolved local generated-dependency incident and is retained only as historical RED/safety-net context, not as current failure evidence.
- Diff hygiene: `git diff --check` → passed.

## Deviations and blockers

- No design behavior deviation. Focused component runtime coverage now passes in full; pure-helper and structural checks remain supplemental evidence.
- The former React mismatch is resolved locally as a generated-dependency incident and is not a remaining blocker.
- No production or staging environment was mutated and no commit was created.
- No Outcome B source, tests, migrations, webhooks, workers, gates, or deployment files were touched.

## Remaining tasks

PR 1 lifecycle task intentionally remains:

- [ ] Commit the complete causal unit, including tests, as `fix(atendimento): make receipt preview deterministic`; verify a clean ~120-line diff and independently reversible rollback. <!-- sdd-owner: implementation -->

All PR 2–PR 5 implementation rows remain unchecked and out of this assigned slice. All parent-controlled issue/review/rollout rows remain byte-for-byte unchanged and are deferred to the parent lifecycle.

## Structured status consumed

- Native status named the change selection as ambiguous, but the user explicitly selected `atendimento-preview-and-sofia-inbound-batching`; this resolved the selection before edits.
- Artifact store: `openspec`; proposal, specs, design, and tasks were read from the selected change.
- Action context: `repo-local`, workspace root `/home/wilkin/proyectos/Asados`, allowed edit root `/home/wilkin/proyectos/Asados`, no warnings.
- User-supplied allowed surfaces were treated as the stricter edit boundary and respected.
- Next lifecycle owner: parent/orchestrator; apply must not commit, review, verify receipts, deploy, or start Outcome B.


---

## Applied work unit — PR 2

- Slice: PR 2 only — inert Sofia batch storage and atomic admission.
- Branch: `feat/sofia-batch-storage-admission`.
- Workload: 233 authored SQL lines before this cumulative evidence update, below the 400-line review budget.
- Runtime effect: N/A; no producer invokes the admission RPC and no worker, runner, scheduler, or response outbox was added.
- Rollback boundary: forward-only; retain the empty additive tables/migration and do not run a down migration.

## Completed PR 2 implementation tasks

- [x] RED added focused pgTAP assertions before production SQL for authority, persistence, deduplication, membership, scheduling, post-claim separation, and concurrency.
- [x] GREEN added additive storage and service-role-only atomic admission.
- [x] TRIANGULATE added distinct-arrival and duplicate-versus-new concurrent cases.
- [x] REFACTOR retained an inert database-only boundary with bounded error tokens and fully qualified `search_path=''` authority.

The four matching PR 2 TDD rows are visibly checked in `tasks.md`. The PR 2 commit row remains unchecked because the user explicitly prohibited commits. The task wording forecasts three tables and a typed wrapper, but the assigned stricter edit surface and PR-2-only request authorized only the two required batch tables and SQL boundary; the PR 3 response outbox and application wrapper remain deferred.

## PR 2 files changed

- `supabase/migrations/20260909010000_sofia_inbound_batch_admission.sql`
- `supabase/tests/sofia_inbound_batch_admission.sql`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/tasks.md`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/apply-progress.md`

## TDD Cycle Evidence — PR 2

| Task | Test file | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| Storage and atomic admission | `supabase/tests/sofia_inbound_batch_admission.sql` | Test authored first; missing objects/RPC were the expected initial failure contract, while the repository local stack was initially unavailable. | Disposable isolated Supabase stack applied every migration; focused assertions 1–18 passed. | Independent dblink cases were added for concurrent distinct and duplicate-versus-new arrivals; disposable-stack execution reached these cases after all non-concurrency assertions passed, but local dblink connection authorization prevented their completion. | Migration remains additive and inert; no production/staging database or runtime producer was touched. |

## PR 2 verification evidence

- Isolated reset/apply: a temporary Supabase workdir applied the complete migration history through `20260909010000_sofia_inbound_batch_admission.sql` successfully.
- Focused pgTAP: assertions 1–18 passed, covering schema authority, first admission, immediate message persistence, retry deduplication, exact chronology, five-second reset, twenty-second cap, immutable membership, post-claim separation, and pending uniqueness.
- Focused pgTAP concurrency assertions 19–21 remain infrastructure-blocked: the disposable container rejects local `dblink` reconnection under its generated role/auth setup before either concurrent query executes. The SQL cases remain present for a standard local pgTAP environment.
- `npm run supabase:test` was not run because it is broader than the explicitly allowed focused-local-only test scope.
- No shared, staging, or production target was contacted or mutated.
- No commit was created.

## Remaining PR 2 task

- [ ] Commit storage, admission wrapper, and their SQL tests as one causal unit (for example, `feat(sofia): add inert inbound batch admission`); confirm base PR 1 and a clean ~360-line diff. <!-- sdd-owner: implementation -->

All PR 3–PR 5 implementation rows remain unchecked and out of scope. Parent-controlled issue, review, and rollout actions remain deferred to the parent lifecycle.

## PR 2 independent-verifier remediation

- Replaced admission-order ordinals with immutable `(message_created_at, message_id)` membership keys copied from persisted `mensagens(data_criacao,id)`, so out-of-order and concurrent provider arrivals have deterministic future prompt order.
- Separated trusted database admission time (`clock_timestamp()`) from provider `p_received_at`: database time alone now drives the five-second silence and twenty-second maximum schedule, while finite provider time remains message chronology only.
- Strengthened state checks to reject half leases and cross-state completion, cancellation, failure, and error metadata.
- Changed conversation-owned batch and membership foreign keys to cascading deletion, matching the existing `conversas` → `mensagens` ownership cascade; the immutability trigger permits referential cascades while still rejecting direct updates/deletes.
- Replaced checked-in `dblink_connect_u`/database-only connection construction with the credential-safe `:'runtime_dblink_conninfo'` runner variable.
- Added direct-write denial, non-finite timestamp rejection, state-negative, cascade, out-of-order, and concurrent chronology assertions.
- Authored SQL workload: **246 lines total** (`155` migration + `91` focused pgTAP), below the 400-line budget.

### TDD Cycle Evidence — verifier remediation

| Task | Test file | Layer | Safety Net / RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| Stable chronology, trusted timing, state integrity, cascade ownership, and credential-safe concurrency | `supabase/tests/sofia_inbound_batch_admission.sql` | Isolated PostgreSQL integration / pgTAP | The revised 30-assertion test failed against the prior migration at missing `message_created_at`; subsequent RED runs exposed timing assumptions, transaction visibility, dblink draining, and cascade-trigger interaction. | `scripts/run-selfhost-supabase-tests.sh supabase/tests/sofia_inbound_batch_admission.sql` completed with `1..27`, all 27 assertions `ok`. | Distinct out-of-order sequential arrivals and independently concurrent arrivals both prove `(data_criacao,id)` ordering; duplicate-versus-new concurrency proves exact membership. | Final focused rerun remained 27/27 green; `git diff --check` passed and no runtime producer reference exists. |

### Verification evidence — verifier remediation

- Focused isolated full pgTAP: `scripts/run-selfhost-supabase-tests.sh supabase/tests/sofia_inbound_batch_admission.sql` → plan `1..27`, **27/27 passed**, including both dblink concurrency rounds through the repository runner's runtime-only authenticated conninfo.
- Diff hygiene: `git diff --check` → passed.
- Inertness check: no `apps/**` reference to `enqueue_sofia_inbound_message` exists.
- Shared, staging, and production databases were not contacted or mutated; the runner created and destroyed an isolated self-hosted test database.
- No commit was created. The PR 2 commit task remains intentionally unchecked.

---

## Applied work unit — PR 3

- Slice: PR 3 only — fenced due-batch processing and durable one-attempt response intent.
- Branch: `feat/sofia-batch-fenced-processing`; base includes PR 2 merge `9b6b443`.
- Workload: 183 authored SQL lines before this evidence update, below the 400-line budget.
- Runtime effect: N/A — no TypeScript worker, route, scheduler, producer, or active runtime was added.
- Rollback boundary: forward-only; retain migration and rows. With no runner, all processing remains inert.

## Completed PR 3 implementation tasks

- [x] RED authored focused pgTAP first; it failed because the processing migration and RPCs did not exist.
- [x] GREEN added service-role-only fenced claim/cancel/fail/complete and response-delivery RPCs.
- [x] TRIANGULATE proved distinct `SKIP LOCKED` claims, stale-token rejection, both lease-expiry paths, completion replay/conflict, ordered frozen members, locator redaction, and one attempt transition.
- [x] REFACTOR retained `SECURITY DEFINER search_path=''`, fully qualified references, bounded tokens, no direct table access, and an inert SQL-only boundary.

The four matching PR 3 TDD rows are visibly checked in `tasks.md`. The commit row remains unchecked because commits were explicitly prohibited. The task's TypeScript formatter/validator wording was superseded for this assigned SQL-only PR 3 surface: safe ordered claim output and validation are implemented and tested in the RPC contract, with no application runtime added.

## PR 3 files changed

- `supabase/migrations/20260909020000_sofia_inbound_batch_processing.sql`
- `supabase/tests/sofia_inbound_batch_processing.sql`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/tasks.md`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/apply-progress.md`

## TDD Cycle Evidence — PR 3

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Fenced processing and response intent | `supabase/tests/sofia_inbound_batch_processing.sql` | Isolated PostgreSQL integration / pgTAP | PR 2 admission pgTAP passed 27/27 before edits. | New test failed at missing `20260909020000_sofia_inbound_batch_processing.sql`. | Focused processing plan passed 27/27. | Concurrent claims, rotated expiry fence, intent-backed terminal recovery, immutable completion replay/conflict, and one external-attempt transition passed. | Admission plus processing plans passed 54/54; `git diff --check` passed. |

## PR 3 verification evidence

- RED: `scripts/run-selfhost-supabase-tests.sh supabase/tests/sofia_inbound_batch_processing.sql` → failed because the forward migration did not exist.
- GREEN/TRIANGULATE: the same command → plan `1..27`, 27/27 passed.
- REFACTOR safety net: `scripts/run-selfhost-supabase-tests.sh supabase/tests/sofia_inbound_batch_admission.sql supabase/tests/sofia_inbound_batch_processing.sql` → 27/27 + 27/27, 54/54 passed.
- Diff hygiene: `git diff --check` → passed.
- Runtime/lint/Vitest: N/A — the authorized slice contains SQL only and introduces no application formatter, worker, route, producer, scheduler, or runtime boundary.
- Shared, staging, and production databases were not contacted; tests used disposable self-hosted databases.
- No commit was created.

## Remaining PR 3 task

- [ ] Commit fenced database contract, formatter, and tests as one causal unit (for example, `feat(sofia): fence batch response intents`); confirm base PR 2 and a clean ~390-line diff. <!-- sdd-owner: implementation -->

All PR 4–PR 5 implementation rows remain unchecked and out of scope. Parent-controlled issue, review, and rollout actions remain deferred to the parent lifecycle.

## Structured status consumed — PR 3

- The user explicitly selected `atendimento-preview-and-sofia-inbound-batching`, resolving native change ambiguity.
- Artifact store: `openspec`; proposal, specs, design, tasks, prior cumulative progress, and strict-TDD configuration were read.
- Action context: repo-local at `/home/wilkin/proyectos/Asados`; the user-supplied four allowed surfaces were authoritative and respected.
- Workload decision: the selected stacked PR 3 path was explicitly supplied, forecast medium, and measured below 400 authored lines; no size exception was inferred.
- Next lifecycle owner: parent/orchestrator; apply did not commit, review, create receipts, deploy, or begin PR 4.

### PR 3 verifier remediation

- Completion now validates processing state, exact lease ownership, and unexpired lease before reading or replaying an existing response intent. Stale pre-recovery, wrong-token, post-completion, ownership-rotated, and expired attempts return no completion; only the active exact fence may idempotently replay an immutable intent.
- Claim eligibility is channel-correct and conservative. Database-owned pause/handoff, automation permission, WhatsApp opt-out/sleep, and channel-specific global configuration produce `db_eligible`; Telegram has null WhatsApp-only fields and cannot be blocked by WhatsApp sleep state.
- Business-hours evaluation remains application-owned (`verificarHorarioAtendimento`), including its schedule lookup and runtime behavior. Claims therefore always return `requires_runtime_policy_check=true` and `eligible=false`, preventing DB inputs from being represented as final eligibility.
- Every processing RPC now has explicit pgTAP privilege coverage for service-role execute and authenticated denial.
- RED: the expanded processing plan failed 9 assertions against the earlier contract: six eligibility/channel assertions and three existing-intent fence assertions. A temporary plan mismatch also honestly reported 51 executed versus 48 planned while the cases were being added.
- GREEN/TRIANGULATE: `scripts/run-selfhost-supabase-tests.sh supabase/tests/sofia_inbound_batch_processing.sql` → plan `1..52`, **52/52 passed**.
- REFACTOR safety net: `scripts/run-selfhost-supabase-tests.sh supabase/tests/sofia_inbound_batch_admission.sql supabase/tests/sofia_inbound_batch_processing.sql` → **27/27 + 52/52, 79/79 passed**.
- Diff hygiene: `git diff --check` → passed. Authored SQL workload is **226 lines** (`120` migration + `106` test), below 400.
- Runtime remains N/A and inert; no shared environment, worker, route, scheduler, producer, deployment, or commit was created.

---

## PR 4 apply attempt — blocked before RED

- Slice: PR 4 only — disabled Sofia batch worker and internal maintenance capability.
- Branch: `feat/sofia-batch-disabled-worker`; base contains the PR 2/3 SQL contracts.
- Strict TDD: active. Existing focused safety net passed: `npx vitest run tests/unit/notification-outbox-maintenance-route.test.ts tests/unit/whatsapp/sofia-inbound.test.ts` → 2 files, 12/12 tests passed.
- Next.js 16 route-handler documentation was read before route work: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `01-app/01-getting-started/15-route-handlers.md`.
- CodeGraph inspection confirmed that `processarRagPipeline` is the only exported Sofia generation path and always persists and/or sends its generated response. Calling it from the worker would bypass the PR 3 durable response-intent boundary.
- CodeGraph inspection also confirmed Telegram supports `salvarNoBanco:false`, while the active WhatsApp provider payload has no such field and Evolution always inserts a second `mensagens` row after provider delivery.
- The required safe implementation therefore needs edits outside the authoritative allowed surfaces: at minimum `apps/web/src/lib/ai/openrouter.ts` to expose generation without persistence/send, plus `apps/web/src/lib/whatsapp/provider.ts`, `apps/web/src/lib/whatsapp/send.ts`, and `apps/web/src/lib/whatsapp/evolution.ts` to support provider dispatch without duplicate persistence.
- No tests or production code were authored because strict TDD cannot begin a truthful RED cycle for a runtime contract that cannot be made GREEN inside the allowed edit boundary.
- Workload remains zero authored implementation lines for PR 4; the 400-line limit was not approached. No scheduler, webhook producer, environment mutation, secret, PII log, or commit was created.

### TDD Cycle Evidence — PR 4 blocked attempt

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Disabled worker and maintenance capability | Planned focused PR 4 unit tests | Unit | 12/12 related existing tests passed | Not started: required production seams are outside allowed surfaces | Blocked | Blocked | Blocked |

### Remaining PR 4 tasks

All five PR 4 implementation rows remain unchecked in `tasks.md`; no completion checkbox was changed. Parent-controlled issue, review, and rollout rows remain deferred byte-for-byte.

### Structured status consumed — PR 4 blocked attempt

- The user explicitly selected `atendimento-preview-and-sofia-inbound-batching`, resolving the native ambiguous change selection.
- Artifact store: `openspec`; proposal, all delta specs, design, tasks, prior cumulative progress, and strict-TDD configuration were read.
- Action context: repo-local at `/home/wilkin/proyectos/Asados`; the user-supplied allowed surfaces are the stricter authoritative edit boundary.
- Delivery path: explicitly assigned PR 4 stacked slice, medium forecast, hard stop at 400 authored lines; no size exception was requested or inferred.
- Blocking decision needed: authorize the four additional source surfaces named above, or explicitly approve a design change that replaces the existing Sofia/provider paths while preserving generation safety and no duplicate persistence.

---

## Applied work unit — PR 4

- Slice: PR 4 only — default-closed Sofia batch worker and internal maintenance capability.
- Branch: `feat/sofia-batch-disabled-worker`; parent authorized the derived generation/provider surfaces after the initial boundary stop.
- Workload: 241 authored implementation/test lines before this evidence update, below the 400-line budget.
- Runtime effect: closed. `SOFIA_INBOUND_BATCH_PROCESSING_ENABLED` accepts only exact `true`; no scheduler or webhook producer was added.
- Rollback boundary: remove the worker, gate, route, and focused tests; revert the generation-only/no-persistence optional seams. Existing PR 2/3 queue rows and SQL remain inert.

## Completed PR 4 implementation tasks

- [x] RED added failing worker, strict-gate, route authorization/closed-gate, provider no-persistence, fence, and channel-selection tests.
- [x] GREEN added ordered safe context assembly, claim-time policy checks, one generation/completion, response dispatch with pre-provider attempted marking, maintenance capability, and behavior-preserving optional generation/provider seams.
- [x] TRIANGULATE covered missing/malformed gates, IA inactive, handoff/pause, opt-out, global disabled, outside hours, WhatsApp sleep/cooldown, generation/completion fence failures, provider failure without retry, and Telegram/Evolution selection.
- [x] REFACTOR centralized provider persistence defaulting and kept existing direct RAG and provider behavior unchanged by default.

The four matching PR 4 TDD rows are visibly checked in `tasks.md`. The commit row remains unchecked because commits were prohibited. Scheduler validation wording is not applicable to this user-assigned slice because scheduler creation/installation was explicitly prohibited.

## PR 4 files changed

- `apps/web/src/lib/sofia/inbound-batch-worker.ts`
- `apps/web/src/lib/sofia/inbound-batch-gates.ts`
- `apps/web/src/app/api/internal/sofia/inbound-batches/maintenance/route.ts`
- `apps/web/src/lib/ai/openrouter.ts`
- `apps/web/src/lib/whatsapp/provider.ts`
- `apps/web/src/lib/whatsapp/send.ts`
- `apps/web/src/lib/whatsapp/evolution.ts`
- `tests/unit/sofia-inbound-batch-worker.test.ts`
- `tests/unit/sofia-inbound-batch-maintenance-route.test.ts`
- `tests/unit/whatsapp/sofia-batch-no-persistence.test.ts`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/tasks.md`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/apply-progress.md`

## TDD Cycle Evidence — PR 4

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Worker/gate | `tests/unit/sofia-inbound-batch-worker.test.ts` | Unit | Related maintenance/WhatsApp tests 12/12 | Missing modules failed import | Focused tests passed | 14 worker/gate branches passed | Focused suite remained green |
| Maintenance route | `tests/unit/sofia-inbound-batch-maintenance-route.test.ts` | Route unit | Existing maintenance route passed | Missing route failed import | Authorization, closed zero-work, bounded 20 passed | Wrong secret and enabled route paths passed | No-store aggregate-only response retained |
| Provider persistence seam | `tests/unit/whatsapp/sofia-batch-no-persistence.test.ts` | Pure unit | Existing integration fail-closed tests passed | Missing payload option failed type contract | Default true and explicit false passed | Evolution direct sends retain two retries while durable intents use zero provider retries | Shared `shouldPersistOutbound` removed duplication |

## PR 4 verification evidence

- RED: `npx vitest run tests/unit/sofia-inbound-batch-worker.test.ts tests/unit/sofia-inbound-batch-maintenance-route.test.ts tests/unit/whatsapp/sofia-batch-no-persistence.test.ts` → worker and route suites failed missing imports; provider type test passed only after its production type seam existed.
- GREEN: same focused command → 3 files, 15/15 passed after one formatter expectation exposed and corrected attachment-only punctuation.
- TRIANGULATE/REFACTOR: focused PR 4 tests plus `tests/unit/integration-fail-closed.test.ts` → 4 files, 22/22 passed.
- Lint: focused changed source/tests via `npx eslint ...` → passed with no output.
- TypeScript: `npx tsc --noEmit -p apps/web/tsconfig.json` → passed.
- Diff hygiene: `git diff --check` → passed.
- Runtime harness: N/A — processing is default-closed, no scheduler/producers exist, and no environment mutation was authorized.
- `.env.example` was not updated because the harness safety policy blocks writes to environment templates; the runtime gate nevertheless defaults false when absent. `docker-compose.yml` was intentionally unchanged to avoid installing/wiring capability.
- No shared environment was contacted and no commit was created.

## Remaining PR 4 task

- [ ] Commit gate module, worker, route/script capability, and their tests as one causal unit (for example, `feat(sofia): add disabled batch maintenance worker`); confirm base PR 3 and a clean ~395-line diff. <!-- sdd-owner: implementation -->

PR 5 remains entirely unchecked and out of scope. Parent-controlled review and rollout actions remain deferred byte-for-byte.

---

## Verifier high correction — PR 4

- Strict RED reproduced three failures: resolved Telegram failure was not recorded, resolved WhatsApp failure was not recorded, and a 20-item processing pass could claim 20 additional deliveries.
- GREEN now recognizes bounded provider result contracts (`success: false` and `sucesso: false`) and records only `provider_rejected`; thrown provider errors record only `provider_unavailable`. Provider detail, exception text, PII, and secrets are never persisted by this path.
- The supplied maintenance limit now caps combined batch and delivery claims. A pass that claims 12 batches can claim at most 8 delivery intents when its overall limit is 20.
- Route coverage clarifies that the route invokes exactly one maintenance pass with one overall limit of 20.
- Focused verification: `npx vitest run tests/unit/sofia-inbound-batch-worker.test.ts tests/unit/sofia-inbound-batch-maintenance-route.test.ts tests/unit/whatsapp/sofia-batch-no-persistence.test.ts tests/unit/integration-fail-closed.test.ts` → 4 files, 25/25 passed.
- Focused ESLint, `npx tsc --noEmit -p apps/web/tsconfig.json`, and `git diff --check` passed.
- Current PR 4 implementation/test additions are 222 lines, below the 400-line limit. No commit was created and the processing gate remains fail-closed.

---

## PR 5 apply attempt — blocked before RED

- Slice: PR 5 only — default-closed Telegram and Evolution producers.
- Branch: `feat/sofia-batch-default-closed-producers`; user explicitly selected this change and slice.
- Strict TDD: active. Existing focused safety net passed: `npx vitest run tests/unit/webhook-global-gates.test.ts tests/unit/telegram-payment-proof-intake.test.ts tests/unit/evolution-payment-proof-intake.test.ts` → 3 files, 89/89 tests passed.
- Next.js 16 route-handler documentation was read before route work: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
- CodeGraph and source inspection confirmed both routes currently persist ordinary inbound messages before their final direct-RAG dispatch.
- The existing `enqueue_sofia_inbound_message` RPC does not accept an existing `message_id`. It creates a new `mensagens` row keyed by `external_id = 'sofia-inbound:' || channel || delivery_key`; when that external row already exists without membership, it fails with `SOFIA_BATCH_DELIVERY_CONFLICT` rather than attaching it.
- Therefore calling the RPC only after the routes' canonical message persistence, as explicitly required for this slice, would create a second canonical inbound message. Replacing route persistence with the RPC would avoid duplication but would violate the explicit post-persistence ordering requirement. The allowed surfaces exclude the PR 2 migration/RPC contract, so no safe GREEN implementation is possible within scope.
- The requested per-channel operational gates also differ from the design's single shared enqueue gate, but this is implementable within the allowed gate module once the admission contract is resolved.
- No RED tests or production code were authored because strict TDD cannot begin a truthful cycle whose GREEN requires an unauthorized RPC contract change. PR 5 implementation workload remains zero lines, below the 400-line limit.
- No timer, scheduler, Meta producer, deployment/config activation, environment mutation, sensitive logging, or commit was created.

### TDD Cycle Evidence — PR 5 blocked attempt

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Telegram and Evolution post-persistence producers | Planned focused PR 5 route tests | Route unit | 89/89 related tests passed | Not started: the existing RPC cannot attach an already-persisted canonical message | Blocked | Blocked | Blocked |

### Remaining PR 5 tasks

All five PR 5 implementation rows remain unchecked in `tasks.md`; no completion checkbox was changed. Parent-controlled issue, review, and rollout rows remain deferred byte-for-byte.

### Structured status consumed — PR 5 blocked attempt

- The user explicitly selected `atendimento-preview-and-sofia-inbound-batching`, resolving the native ambiguous change selection.
- Artifact store: `openspec`; proposal, all delta specs, design, tasks, prior cumulative progress, and strict-TDD configuration were read.
- Action context: repo-local at `/home/wilkin/proyectos/Asados`; the user-supplied allowed surfaces are the stricter authoritative edit boundary.
- Delivery path: explicitly assigned PR 5 stacked slice on `feat/sofia-batch-default-closed-producers`, medium forecast, hard stop at 400 authored lines; measured implementation work is zero and no size exception was inferred.
- Blocking decision needed: either authorize a narrow forward migration/RPC change that attaches an already-persisted `message_id` idempotently, or explicitly approve replacing eligible ordinary route persistence with the transactional admission RPC and treat successful RPC completion as the canonical persistence boundary.

---

## Applied work unit — PR 5

- Slice: PR 5 only — independent default-closed Telegram and Evolution producers.
- Branch: `feat/sofia-batch-default-closed-producers`; the user resolved the prior blocker by authorizing a forward attach RPC and its pgTAP test.
- Workload: 221 implementation/test changed lines, below the 400-line budget.
- Runtime effect: closed. Only exact `true` independently enables each producer; no gate was configured or activated.
- Rollback boundary: retain the forward SQL contract and audit rows, keep both enqueue gates false, and revert only the two webhook integrations/helpers/tests.

## Completed PR 5 implementation tasks

- [x] RED added focused route tests after the 89/89 safety net; four gate-on cases failed because neither producer existed.
- [x] GREEN added the service-role-only persisted-message attach RPC, typed wrapper, exact-string channel gates, and post-persistence Telegram/Evolution calls.
- [x] TRIANGULATE covered malformed/missing/false gates, duplicate deliveries, stored chronology, scheduling, claimed-batch separation, identity rejection, and existing payment-proof/global-gate regressions.
- [x] REFACTOR retained direct RAG while closed, safe constant failure tokens, no Meta producer, and no deployment/scheduler/environment activation.

The four matching PR 5 TDD rows are visibly checked in `tasks.md`. The commit row remains unchecked because commits were explicitly prohibited.

## PR 5 files changed

- `supabase/migrations/20260909030000_sofia_inbound_batch_attach_message.sql`
- `supabase/tests/sofia_inbound_batch_attach_message.sql`
- `apps/web/src/lib/sofia/inbound-batch-producer.ts`
- `apps/web/src/lib/sofia/inbound-batch-gates.ts`
- `apps/web/src/app/api/webhooks/telegram/route.ts`
- `apps/web/src/app/api/webhooks/evolution/route.ts`
- `tests/unit/telegram-sofia-inbound-batching.test.ts`
- `tests/unit/evolution-sofia-inbound-batching.test.ts`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/tasks.md`
- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/apply-progress.md`

## TDD Cycle Evidence — PR 5

| Task | Test file | Safety Net / RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| Persisted-message database attachment | `supabase/tests/sofia_inbound_batch_attach_message.sql` | Initial run failed because the authorized forward migration did not exist. | Focused plan passed 15/15. | Proved idempotence, no message insertion, stored chronology, DB-time scheduling/cap, post-claim pending separation, authority, and identity/channel rejection. | Prior admission and processing plans plus attach passed 27/27 + 52/52 + 15/15. |
| Telegram/Evolution producers | `tests/unit/*-sofia-inbound-batching.test.ts` | New focused run produced 4 expected failures: no attach calls and direct RAG still ran under exact-true gates. | Both suites passed 14/14. | Combined focused producer, payment-proof, and global-gate suite passed 103/103. | Full unit suite passed 1394 tests with one pre-existing skipped test; lint, TypeScript, and diff hygiene passed. |

## PR 5 verification evidence

- SQL: `scripts/run-selfhost-supabase-tests.sh supabase/tests/sofia_inbound_batch_admission.sql supabase/tests/sofia_inbound_batch_processing.sql supabase/tests/sofia_inbound_batch_attach_message.sql` → 27/27 + 52/52 + 15/15 passed.
- Focused webhooks: `npx vitest run tests/unit/telegram-sofia-inbound-batching.test.ts tests/unit/evolution-sofia-inbound-batching.test.ts tests/unit/webhook-global-gates.test.ts tests/unit/telegram-payment-proof-intake.test.ts tests/unit/evolution-payment-proof-intake.test.ts` → 5 files, 103/103 passed.
- Full unit: `npm run test:unit` → 228 files passed, 1 skipped; 1394 tests passed, 1 skipped. Expected preflight-negative test diagnostics and jsdom print/focus notices were emitted, but the command exited successfully.
- ESLint on changed source/tests → passed with no output.
- `npx tsc --noEmit -p apps/web/tsconfig.json` → passed.
- `git diff --check` → passed.
- Runtime harness: N/A; no environment, scheduler, deployment, or gate activation was authorized.

## Deviations and remaining tasks

- Authorized design refinement: the forward `attach_sofia_inbound_message` RPC attaches an already-persisted canonical message rather than inserting one, satisfying the selected post-canonical admission contract without duplication.
- Independent Telegram and Evolution gates replace the earlier shared enqueue-gate concept for this slice, as explicitly requested.
- No `.env.example` or Compose change was needed because missing variables are intentionally the default-closed configuration.
- Meta WhatsApp Cloud remains untouched and has no producer.
- Remaining implementation-owned PR 5 row: `- [ ] Commit both gated producers and their tests as one causal unit (for example, `feat(sofia): add default-closed batch producers`); confirm base PR 4 and a clean ~380-line diff. <!-- sdd-owner: implementation -->`
- Earlier PR 1–PR 4 commit rows also remain unchecked because the user prohibited commits. Parent-controlled review and rollout rows remain deferred unchanged.

## Structured status consumed — PR 5

- The user explicitly selected `atendimento-preview-and-sofia-inbound-batching`, resolving the native ambiguous selection.
- Artifact store: `openspec`; proposal, specs, design, tasks, prior cumulative progress, and strict-TDD config were consumed.
- Action context: repo-local at `/home/wilkin/proyectos/Asados`; all edits stayed within the user-authorized roots, including the two newly authorized SQL files.
- Delivery path: assigned stacked PR 5 slice, measured at 221 changed implementation/test lines, below 400; no size exception was inferred.
- Next lifecycle owner: parent/orchestrator. Apply created no commit, receipt, review, deployment, scheduler, or environment activation.
