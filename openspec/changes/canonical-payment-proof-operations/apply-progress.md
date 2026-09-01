# Canonical Payment Proof Operations — Apply Progress

## Delivery and status context

- Change: `canonical-payment-proof-operations`
- Artifact store: `both` with authoritative OpenSpec files in the parent planning worktree.
- Action context: workspace planning across explicit allowed roots only: the Candidate 1a worktree's four SQL tests, this change's `tasks.md` and `apply-progress.md`, and the sanitized home-cache receipt path.
- Delivery strategy: `feature-branch-chain`.
- Current PR/work-unit boundary: Candidate 1a only, 77 changed lines (57 additions, 20 deletions), below the 400-line limit.
- Local branch and local commit are authorized for Candidate 1a. Local commit `ba08f65e93acf1dbf4dc76ce0286e201a8217fbb` (`test(payment-proof): stabilize SQL verification baseline`) was created with parent `d214928e333046993f4db2725326c58f7e1160e9`. Push, PR publication, merge, production operations, gate changes, replay, restore, purge, and maintenance remain unauthorized.
- Receipt-driven development is explicitly disabled globally. Delivery bookkeeping is `disabled/unmanaged`; no review receipt is claimed or required.
- Native `gentle-ai sdd status` was unavailable in the installed CLI, so status was produced from the installed status contract and the authoritative OpenSpec artifacts.

## Completed implementation tasks

- [x] Candidate 1a issue/reproduction/conflict/isolation/budget precheck. The matching checkbox is checked in `tasks.md`.
- [x] Candidate 1a CodeGraph-first impact map and complete Next.js 16 document-read precheck. The matching checkbox is checked in `tasks.md`.
- [x] Task 1a SQL verification baseline recovery. The matching checkbox is checked in `tasks.md`.

Candidate 1b is **not required for the observed Phase 1 diagnosis and is deferred**: executable RED evidence identified obsolete expectations and non-idempotent test bootstrap only, with no production RPC defect. Its implementation checkbox remains unchecked because the task artifact has no N/A checkbox convention and because later independent evidence could still establish a distinct production defect.

## Candidate 1a implementation

Files changed in the isolated candidate worktree:

- `supabase/tests/payment_proof_admin_alerts.sql`
- `supabase/tests/payment_proof_operational_metrics.sql`
- `supabase/tests/payment_proof_processing_queue.sql`
- `supabase/tests/security_handoff_receipts.sql`

Summary: current lease-owned RPC expectations, deterministic alert/heartbeat fixtures, kind-isolated queue assertions, and idempotent suite-local security policy setup. No production source or migration changed.

## TDD Cycle Evidence

| Cycle | Evidence | Result |
|---|---|---|
| RED | Four independent disposable self-hosted suite runs from clean local-main baseline | Metrics 42/48, alerts 16/20, queue 13/13, handoff blocked before TAP; failures classified as obsolete expectations or non-idempotent bootstrap, not production defects. |
| GREEN | Four independent suite runs after test-only corrections | 48/48 + 20/20 + 13/13 + 8/8 = 89/89. |
| TRIANGULATE | Repeated all four suites against the already-used disposable aggregate baseline | 89/89 again with zero `not ok` lines. |
| REFACTOR | Final candidate diff/checksum and independent verification evidence | Four SQL files only; 57 additions and 20 deletions; no production behavior change. |

Sanitized evidence is retained under `/home/wilkin/.cache/asados-rdd/canonical-payment-proof-operations/candidate-1a-green/`. Relevant files include `precheck-report.md` in the sibling precheck directory, `commands.md`, `patch-summary.md`, `tap-counts.tsv`, `repeated-bootstrap.md`, `checksums.sha256`, and `rollback.md`. No secret values are referenced here.

The aggregate repository command remained exit 1 only because of documented pre-existing unrelated suite setup failures (missing historical migration files and `runtime_dblink_conninfo`); all four Candidate 1a suites reported green. Candidate-bound independent verification passed 89/89 twice.

## Deviations from design

- Candidate 1b was not implemented because Candidate 1a diagnosis found no active production defect requiring a forward migration.
- RDD-specific review language in older planning artifacts is historical context only; the current user-selected delivery state is `disabled/unmanaged`, and no review was invoked.

## Remaining implementation tasks

The following implementation-owned rows remain unchecked in `tasks.md`:

- Candidate 1b (not required for the current Phase 1 diagnosis; deferred unless a production defect is independently demonstrated).
- Candidates 2b, 3a, 3b, 4a, 4b, 5a, and 5b.
- Final implementation verification task 6.

Parent-owned lifecycle actions remain deferred byte-for-byte in `tasks.md`. Candidate 1a returned control to the parent lifecycle after its authorized local commit.

## Candidate 2a settlement

- Work-unit boundary: Candidate 2a only, 256 changed lines (135 additions, 121 deletions) across five files, below the 400-line limit.
- Base and parent: `ba08f65e93acf1dbf4dc76ce0286e201a8217fbb` (`test(payment-proof): stabilize SQL verification baseline`).
- Branch: `feature/canonical-payment-proof-operations-candidate-2a`, with no configured upstream.
- Delivery remains ordinary `disabled/unmanaged`; no push, PR, review, merge, production contact, gate change, replay, restore, purge, or maintenance operation was performed.
- Drift reconciliation matched the frozen correction evidence: all evidence checksums passed; current binary patch SHA-256 matched `fa07c28c75a004ab5471813e19bbc104a33c9415480e77e2f1eb27de15053d98`; `git diff --check` was clean; numstat matched the recorded five paths; and the candidate contained no untracked files or symlinks.
- Task 2a is complete and its matching implementation-owned checkbox is checked in `tasks.md`.

### Candidate 2a changed files and lines

| File | Additions | Deletions |
|---|---:|---:|
| `apps/web/src/lib/payment-proofs/canonical-intake.ts` | 2 | 91 |
| `tests/unit/evolution-payment-proof-intake.test.ts` | 2 | 2 |
| `tests/unit/payment-proof-intake.test.ts` | 81 | 1 |
| `tests/unit/payment-proof-operational-failures.test.ts` | 39 | 27 |
| `tests/unit/payment-proof-processing-worker.test.ts` | 11 | 0 |
| **Total** | **135** | **121** |

### Candidate 2a TDD Cycle Evidence

| Cycle | Evidence | Result |
|---|---|---|
| Safety net / RED | Directly impacted intake/operational tests before the correction | 1 file failed and 1 passed; 2 tests failed and 24 passed, establishing the queue-boundary regression. |
| GREEN | Directly impacted two-file command after the correction | 2 files passed; 26 tests passed. |
| TRIANGULATE | Six-file bounded matrix plus a focused worker pass | Initial matrix 55/55, worker 9/9, and final matrix 57/57. |
| REFACTOR | Frozen five-file patch, static diff checks, and final compatibility inventory | `processCanonicalPaymentProof` remains a compatibility entry point that delegates to canonical ingestion without inline rendering, extraction, classification, advisory persistence, or processing-failure recording. |

The exact focused commands and sanitized outputs remain under `/home/wilkin/.cache/asados-rdd/canonical-payment-proof-operations/candidate-2a-green-correction/`. Expensive tests were not rerun during settlement; the final independent 57/57 matrix was consumed as verified authority.

### Candidate 2a compatibility and deviations

- The supported admission outcomes remain `accepted`, `duplicate`, `retryable`, `rejected`, and the existing disabled-gate behavior.
- No route source, adapter source, migration, package configuration, gate, or production state changed.
- The task wording references HTTP status mapping and adapter acceptance behavior, but those transitions intentionally remain outside this bounded implementation slice. Candidate 2b is next and owns adapter transition, HTTP status mapping, and Evolution legacy fallback removal.
- Operational-failure projection and durable alert-delivery failure recording remain Phase 4a responsibilities, not Candidate 2a acceptance requirements. The disputed failure-recording finding was therefore non-authoritative against OpenSpec and lease-owned completion.

### Candidate 2a local commit

Only the five verified candidate files were staged and committed locally as `5ced3fe2c28f75e24322858edeaa494a81624e88` with parent `ba08f65e93acf1dbf4dc76ce0286e201a8217fbb` and message `refactor(payment-proof): move processing behind queue`. The committed stat is 5 files changed, 135 insertions, and 121 deletions. The candidate branch is clean and has no configured upstream. Parent planning artifacts remain in the parent planning worktree and were excluded from the candidate commit.

## Remaining implementation tasks after Candidate 2a

- Candidate 1b remains deferred/not required unless a production defect is independently demonstrated.
- Candidate 2b is next; do not start it as part of Candidate 2a settlement.
- Candidates 3a, 3b, 4a, 4b, 5a, and 5b remain unchecked.
- Final implementation verification task 6 remains unchecked.

Parent-owned lifecycle rows remain deferred and unchanged. Candidate 2a settlement returns `parent-lifecycle` after the authorized local commit.

## Candidate 2b settlement

- Work-unit boundary: Candidate 2b only, 137 changed lines (93 additions, 44 deletions) across six files, below the 400-line limit.
- Base: `5ced3fe2c28f75e24322858edeaa494a81624e88` (`refactor(payment-proof): move processing behind queue`).
- Branch: `feature/canonical-payment-proof-operations-candidate-2b`, with no configured upstream before settlement.
- Delivery remains ordinary `disabled/unmanaged`; no push, PR, review, merge, production contact, gate change, replay, restore, purge, or maintenance operation was performed.
- Live candidate reconciliation exactly matched frozen evidence: binary patch SHA-256 `b0bbe85251fb3b5d3ecd32d20e5fa54ea198f6e99e7d7b33c528486534f6778a`; byte-for-byte `candidate.patch` match; exact `numstat.tsv` match; checksum manifest passed; `git diff --check` was clean; and the candidate contained no untracked files or patch symlinks.
- Task 2b is complete and its matching implementation-owned checkbox is checked in `tasks.md`.

### Candidate 2b changed files and mappings

| File | Additions | Deletions | Contract mapping |
|---|---:|---:|---|
| `apps/web/src/app/api/webhooks/evolution/route.ts` | 6 | 23 | Removes the direct legacy `comprovantes` fallback and maps accepted/duplicate/retryable/rejected to 202/200/503/422 with safe static bodies. |
| `apps/web/src/app/api/webhooks/telegram/route.ts` | 14 | 5 | Maps canonical accepted/duplicate/retryable/rejected outcomes to 202/200/503/422, including replay and metadata/download rejection paths. |
| `apps/web/src/app/api/webhooks/whatsapp/route.ts` | 5 | 0 | Authenticates first, then acknowledges Cloud payment media as `ignored_payment_media` with 200 before persistence or media work. |
| `tests/unit/evolution-payment-proof-intake.test.ts` | 20 | 8 | Proves Evolution status mapping, safe responses, no legacy proof write, retries, and no later expensive work on rejection/failure. |
| `tests/unit/telegram-payment-proof-intake.test.ts` | 18 | 6 | Proves Telegram typed outcomes, replay duplicate acknowledgement, safe invalid-media handling, and canonical queue delegation. |
| `tests/unit/webhook-global-gates.test.ts` | 30 | 2 | Proves valid Cloud payment-media non-admission and preserves invalid authentication and general-chat behavior. |
| **Total** | **93** | **44** | **137 changed lines.** |

### Candidate 2b TDD Cycle Evidence

| Cycle | Exact evidence | Result |
|---|---|---|
| Safety net | Five-file bounded command recorded in `safety-net.log` | 5 files passed; 60 tests passed. |
| RED | Two-file provider authority command recorded in `red.log` | 2 files failed; 4 tests failed and 32 passed, exposing Evolution 202/legacy-write defects and Cloud payment-media non-admission defect. |
| Initial GREEN | Two-file command recorded in `green.log` | 1 test remained stale after the production correction; 35 passed. |
| Initial TRIANGULATE | Five-file bounded command recorded in `triangulation.log` | 5 files passed; 63 tests passed. |
| Correction RED | Evolution and Telegram mapping command recorded in `correction-red.log` | 2 files failed; 12 tests failed and 25 passed, establishing all final 202/200/503/422 mapping expectations. |
| Correction GREEN | Same two-file command recorded in `correction-green.log` | 2 files passed; 37 tests passed. |
| Final TRIANGULATE | Six-file final provider matrix recorded in `correction-triangulation.log` | 6 files passed; 77 tests passed. |
| REFACTOR / freeze | Frozen patch, numstat, searches, behavior matrix, no-write proofs, and independent final matrix | Exact six-file candidate; no direct Evolution `comprovantes` write; Cloud payment media is non-admitting; no inline render/OCR/extraction was introduced. |

Sanitized evidence remains under `/home/wilkin/.cache/asados-rdd/canonical-payment-proof-operations/candidate-2b-red-green/`, including the exact patch and numstat, RED/GREEN/triangulation logs, authoritative HTTP behavior matrix, classification notes, Cloud non-admission proof, legacy-write negative proof, and rollback statement.

### Candidate 2b full-suite classification and verification

- The final independent candidate matrix is authoritative and green at 77/77 across six files.
- The full unit command was run during candidate verification and remained unrelated-red: 3 files failed, 190 passed, and 1 skipped; 4 tests failed, 1079 passed, and 1 skipped.
- Unrelated failures were `tests/unit/client-phone-auth-scripts.test.ts` (`supabaseKey is required`), three `tests/unit/credential-consumer-migration.test.ts` workspace-preflight expectations caused by unavailable/private temporary workspace setup, and `tests/unit/payment-proof-processing-worker.test.ts` isolated production-like rendering failure. None of those failing files is in Candidate 2b or maps to the provider-adapter changes.
- Settlement did not rerun tests; it consumed the frozen independent 77/77 authority exactly as instructed.

### Candidate 2b deviations and rollback

- HTTP 422 is used for typed canonical rejection and invalid payment-proof media because the specification requires a safe non-2xx and reserves 401 for webhook authentication failure.
- The concrete Telegram route and `webhook-global-gates` route test were used as discovery-authorized adapter/test targets. No separate Evolution compatibility test or Web canonical integration file changed because existing focused route coverage proved the required provider boundary within the six-file budget.
- Cloud GET challenge and authenticated non-payment general chat remain compatibility behavior; the candidate adds only authenticated payment-media non-admission before persistence/client creation.
- Rollback is one authority unit: revert exactly the six candidate files. No data rollback is required, and rollback must not reintroduce the Evolution legacy write.

### Candidate 2b commit plan and next boundary

- Exactly the six verified files listed above were staged and committed locally as `c25d70dc2f2a3c74c3e5b32d6bfc78c21327588e` with parent `5ced3fe2c28f75e24322858edeaa494a81624e88` and message `fix(payment-proof): canonicalize provider adapters`.
- The committed stat is 6 files changed, 93 insertions, and 44 deletions. The candidate branch is clean and has no configured upstream.
- Sanitized commit evidence was written to `/home/wilkin/.cache/asados-rdd/canonical-payment-proof-operations/candidate-2b-red-green/local-commit-receipt.txt`.
- Parent planning artifacts remain in the parent planning worktree and were excluded from the candidate commit.
- Candidate 3a is next after settlement and remains unchecked. Do not start Candidate 3a as part of Candidate 2b bookkeeping.

## Remaining implementation tasks after Candidate 2b

- Candidate 1b remains deferred/not required unless a production defect is independently demonstrated.
- Candidate 3a is next; Candidates 3a, 3b, 4a, 4b, 5a, and 5b remain unchecked.
- Final implementation verification task 6 remains unchecked.

Parent-owned lifecycle rows remain deferred and unchanged. Candidate 2b settlement returns `parent-lifecycle` after the authorized local commit.

## Candidate 3a split authorization and lease-authority settlement

- The complete Candidate 3a forecast was corrected from approximately 380 to 445–555 changed lines after inspecting the active SQL contracts. Work stopped before edits, and the maintainer explicitly authorized two chained bounded slices.
- This first slice, `candidate-3a-lease-authority`, is 233 changed lines (223 additions, 10 deletions) across one forward migration and four focused tests. Task 3a intentionally remains unchecked until the second exact-reconciliation matrix slice is green.
- The migration adds proof-scoped opaque operator leases, stores only SHA-256 token digests, enables RLS and revokes direct access, and exposes narrowly granted `SECURITY DEFINER` RPCs with an empty search path.
- Active `vendedor`, `supervisor`, and `admin` capability is rechecked from `perfis` under `FOR UPDATE` at each mutation. The same locked, non-null role is carried explicitly into reconciliation and rejection audit writes, with lock order profile → lease/proof → sorted orders.
- Reconciliation and rejection require the current holder, matching opaque token, and unexpired lease. Active leases cannot be stolen; only the holder can release; expiry permits takeover.
- Independent validation found and drove corrections for an authorization/audit TOCTOU race and an accidental regression of current order-intent semantics. The final implementation preserves required early-order inclusion, the transaction-local reconciliation marker, and `operator_reconciliation` intent insertion.
- Restore remains an exceptional supervisor/admin-only operation outside this reconcile/reject lease slice; the migration does not alter or weaken its existing authorization. The second slice owns the complete exceptional-operation denial/no-change matrix.
- Final independent verification passed reconciliation pgTAP 12/12, order-lock pgTAP 22/22, and focused Vitest 10/10, with zero `not ok`. Temporary environment and dependency symlinks were removed, no disposable database remained, and no production or gate operation occurred.
- The five verified files were committed locally as `e91d85411368208f66d19aa5a0766534de107240` with parent `c25d70dc2f2a3c74c3e5b32d6bfc78c21327588e` and message `feat(payment-proof): add operator reconciliation leases`. The branch is clean and has no upstream.
- Next boundary: `candidate-3a-exact-reconciliation-matrix`, chained from `e91d85411368208f66d19aa5a0766534de107240`. It owns conflicting-retry fingerprints, the complete foreign/ineligible/consumed/mismatch/invalid-state no-change matrix, historic-role triangulation, and exceptional-operation restriction evidence. Do not mark task 3a complete before that slice settles.

## Candidate 3a exact-reconciliation matrix settlement

- The second authorized 3a slice adds a canonical SHA-256 request fingerprint over proof identity and sorted unique order UUIDs. Identical key and canonical request replays return the original reconciliation without side effects; changed proof or order sets raise `PAYMENT_PROOF_RECONCILIATION_CONFLICT` before mutation.
- A forward migration backfills legacy reconciliations from their persisted order links and makes the fingerprint required. It replaces the active 34000 internal function body without regressing proof/profile/lease/order locks, exact amount and customer checks, order intents, payment transition authority, or immutable actor-role audit.
- Disposable migration execution exposed a real owner mismatch. The final migration uses `RESET ROLE` before replacement so the session migration owner replaces its own function without privilege escalation; runtime catalog evidence confirms migration-owner control and no authenticated execution of the internal boundary.
- Matrix evidence covers canonical permutation replay, changed-order and changed-proof conflicts, unchanged reconciliations/links/intents/events/order payment state after conflict, exact legacy backfill without other mutation, and active-seller denial of non-reject exceptional review operations. Existing lease and order-lock suites retain inactive/unauthorized, two-actor contention/expiry, actor-role, customer, amount, early-intent, and competing-route coverage.
- Final independent gates passed reconciliation pgTAP 17/17, order-lock pgTAP 22/22, and focused Vitest 12/12, with zero `not ok`. The candidate is 86 changed lines by runtime budget accounting and 86 committed churn lines, below 400.
- The three verified files were committed locally as `e96d150` with parent `e91d85411368208f66d19aa5a0766534de107240` and message `fix(payment-proof): enforce exact reconciliation retries`. The branch is clean and has no upstream.
- Candidate 3a is complete only as the two-commit chain `e91d854 → e96d150`. Task 3a is now checked. Candidate 3b is the next implementation boundary; no production, push, PR, merge, or gate operation occurred.

## Candidate 3b prerequisite: leased amount confirmation

- Candidate 3b prechecks found a real DB-contract gap: the leased review RPC accepted only rejection, while exact reconciliation required an already admitted proof with confirmed cents. The maintainer selected the recommended bounded SQL split rather than weakening seller scope or inventing a Server Action workaround.
- Forward migration `20260828360000_payment_proof_leased_amount_confirmation.sql` adds an authenticated, `SECURITY DEFINER`, empty-search-path RPC for active `vendedor`, `supervisor`, or `admin` operators holding the proof's valid opaque lease.
- The transaction locks the active profile, lease, then proof. Only `review` may transition to `admitted`; all pre-review and terminal states reject without mutation. Same admitted amount is an event-free no-op; a conflicting amount raises a typed conflict.
- Positive integer amount and customer binding are mandatory. The immutable event records actor identity, locked role-at-action, previous/result status, and confirmed cents. Internal execution remains revoked and no restore, purge, dead-letter, or replay authority was added.
- Independent verification passed the focused pgTAP suite 34/34, reconciliation regression 17/17, order-lock regression 22/22, and structural Vitest 4/4, with zero `not ok`. The split is 193 lines across exactly three files.
- The verified split was committed locally as `920b484` with parent `e96d150871ed8880e94c35369615f76affe7059d` and message `feat(payment-proof): add leased amount confirmation`. Branch is clean with no upstream; no push, PR, production migration, or gate operation occurred.
- Task 3b remains unchecked. Its Server Action and Atendimento workflow must now chain from `920b484` and consume this RPC without exposing the lease token or exceptional operations.

## Candidate 3b: seller reconciliation workflow

- Candidate 3b chained from leased amount-confirmation commit `920b484` and exposes the approved seller workflow through `payment-proof-admin.ts`, `PaymentProofAdminPanel.tsx`, and the actual `/atendimento` route.
- Every exported Server Action authenticates the current user, reauthorizes an active database profile, validates hostile UUID/token/amount/order input, invokes the exact leased RPC signature, and returns only bounded serializable outcomes. Canonical positive cents and bounded unique UUID arrays are enforced before database calls; raw database errors are not returned.
- Lease tokens remain in local component state/ref only. The UI supports acquisition, replacement/release, amount confirmation, exact reconciliation, and ordinary rejection; successful terminal operations attempt release, while expiry remains the authoritative fallback. Tokens are not rendered, logged, placed in URLs, or included in proof-list responses.
- Active sellers may handle eligible proofs for arbitrary customers and ordinarily reject under lease, as required. Restore remains admin-only in UI, Server Action, and DB; purge, dead-letter, and replay are not exposed.
- Independent final verification passed five focused Vitest suites (34/34), `git diff --check`, and candidate-path inspection. ESLint has zero errors and only the pre-existing raw-image warning. Repository-wide TypeScript still reports unrelated unchanged-test errors; no diagnostic referenced the five candidate paths.
- Final diff is exactly five authorized files, 192 additions plus 162 deletions (354 lines), below the 400-line cap. Strict TDD provenance is not claimed because the first executable test run was unavailable before implementation; final behavior was independently validated.
- Candidate 3b was committed locally as `b1b9c74` (`feat(payment-proof): expose seller reconciliation workflow`) with parent `920b484`. Branch is clean with no upstream; no push, PR, production migration, gate activation, or exceptional operation occurred.

## Candidate 4a settlement

- Candidate 4a completed as two bounded chained slices and its matching implementation-owned checkbox is checked in `tasks.md`.
- Candidate 4a-i, covering privileged diagnostics and durable observability evidence, was committed locally as `3191019`. The candidate changed 174 lines. Focused diagnostics validation passed Vitest 14/14 and pgTAP 15/15, 20/20, and 51/51.
- Candidate 4a-ii, covering the forward replay-contract slice, was committed locally as `784822b`. RED established the missing migration before implementation; focused replay validation passed pgTAP 35/35, 15/15, and 51/51. The candidate changed 184 lines.
- Both slices preserve the closed operational posture: no production operation, gate activation, automated replay, push, PR, or merge was performed.

## Candidate 4b settlement

- Candidate 4b was committed locally as `af72c77` and its matching implementation-owned checkbox is checked in `tasks.md`.
- The bounded 120-line candidate adds the approved privileged, read-only diagnostics and explicit replay action surfaces, with manual UI/action verification recorded.
- Focused validation passed Vitest 28/28 and pgTAP 121/121. ESLint reported zero errors and one existing raw-image warning.
- Delivery remains `disabled/unmanaged`; no review receipt, push, PR, merge, production operation, gate activation, or replay execution is claimed.

## Remaining implementation tasks after Candidate 4b

- Candidate 1b remains deferred/not required unless a production defect is independently demonstrated.
- Candidate 5a was the next incomplete implementation candidate and was subsequently completed as the bounded 5a-i and 5a-ii chain recorded below.
- Candidate 5b and final implementation verification task 6 remain unchecked.
- Parent-owned lifecycle rows remain deferred and unchanged.

## Candidate 5a settlement

- Candidate 5a was split before implementation because the corrected startup-parser plus runtime-enforcement forecast exceeded 400 changed lines. The maintainer authorized two chained work units: 5a-i for startup-captured gate authority and 5a-ii for enforcement at the protected server boundaries.
- Candidate 5a-i was committed locally as `6396a133cb0a19404ef7feb509a4737a355c3065` (`feat(payment-proof): capture operational gates at startup`) with parent `af72c77`. It changed 173 lines across six files.
- The 5a-i parser allowlists exactly six payment-proof gates, accepts only exact `true` and `false`, fails closed for missing, malformed, unreadable, or incomplete input, emits only redacted `{ effective, reason }` state, freezes the captured state, and ignores environment mutation until a fresh module/process. Compose declares all six gates closed by default. Evolution compatibility retains provider, release, fixture, and attestation checks.
- Candidate 5a-i verification passed three focused Vitest files with 24/24 tests, scoped ESLint, `npm run selfhost:config`, and `git diff --check`. An independent read-only audit found no blocking defect. `.env.example` was intentionally unchanged because safety controls blocked access; Compose declarations are the authoritative bounded declaration surface for this slice.
- Candidate 5a-ii was committed locally as `92f3234b373cdc13ffacd2d7b91629c6747345c3` (`feat(payment-proof): enforce operational rollout gates`) with parent `6396a13`. It changed 194 lines across twelve files.
- Candidate 5a-ii enforces immutable startup state at canonical and WhatsApp admission, Telegram admission, processing, cleanup, seller amount-confirmation/reconciliation, and privileged replay boundaries. Canonical/WhatsApp admission no longer accepts database configuration as gate authority. Provider and attestation configuration remains authoritative for compatibility checks.
- Closed processing and cleanup gates remove those kinds from claim requests and defensively skip any mismatched forbidden row returned by the database without worker execution, completion, attempt consumption, or lease transition. The seller-reconciliation gate blocks amount confirmation and reconciliation while intentionally preserving lease acquisition/release and ordinary leased rejection. Replay is denied before its RPC while privileged read-only diagnostics remain available.
- Executable 5a-ii RED produced 8 failures in an 81-test focused matrix, exposing stale post-import environment mutation assumptions, a mismatched maintenance claim, the Telegram disabled fixture, and obsolete structural assertions. GREEN/TRIANGULATE passed eight focused files with 98/98 tests. Scoped ESLint and `git diff --check` passed, and an independent security/correctness audit returned PASS.
- Task 5a is complete only as the chained commits `6396a13 → 92f3234`; its matching implementation-owned checkbox is checked in `tasks.md`. Both work units remained below 400 changed lines.
- All six gates remained closed. No push, PR, merge, production deployment, Web recreation, maintenance, processing, replay, restore, purge, client-data mutation, or rollout operation occurred. Delivery remains `disabled/unmanaged` and no native review receipt is claimed.

## Remaining implementation tasks after Candidate 5a

- Candidate 1b remains deferred/not required unless independently executable evidence establishes a production RPC defect.
- Candidate 5b was the next implementation candidate and was subsequently completed in the bounded settlement recorded below.
- Final closed-gate implementation verification task 6 remains unchecked.
- Parent-owned lifecycle rows remain deferred and unchanged.

## Candidate 5b settlement

- Candidate 5b was committed locally as `e77e91c89bee03d6c2245c02c6986c2832d59cd5` (`feat(payment-proof): expose rollout readiness`) with parent `92f3234b373cdc13ffacd2d7b91629c6747345c3`. The candidate changed 109 lines across six files, below the 400-line limit.
- The new Server Action authenticates and reauthorizes an active `admin` or `supervisor`, then copies exactly six startup-captured logical gate states as redacted `{ effective, reason }` values. Sellers, unsupported/inactive roles, and unauthenticated callers receive a fixed denial. The action performs no gate-related database read, RPC, replay, processing, cleanup, maintenance, or mutation.
- The operator panel requests and renders the redacted state only for privileged roles; sellers neither request nor see it. No raw environment key/value, process detail, secret, provider payload, or mutable gate object is exposed.
- The operations guide now defines readiness-only sequential stages from a closed baseline through separately authorized canonical intake, WhatsApp intake, processing, seller reconciliation, and recovery readiness. Every stage includes observation and stop conditions; replay and cleanup remain closed absent separate authorization; rollback is declarative closure followed only by separately approved Web recreation and bounded verification.
- RED established the absent diagnostics action/UI/readiness section. GREEN passed the initial four focused files with 31/31 tests. Final TRIANGULATE passed six focused files with 46/46 tests, including privileged/seller/unauthenticated authorization, exact DTO redaction, no-RPC behavior, seller-hidden UI, startup gate regressions, replay separation, and order-column workflow coverage.
- Scoped ESLint passed with zero errors and one pre-existing raw-image warning. `npm run selfhost:config` and `git diff --check` passed; Compose emitted only expected warnings for unrelated unset disposable configuration values. Independent final security/correctness audit returned PASS.
- The parent OpenSpec artifacts are intentionally absent from committed candidate ancestry and remained separate in the parent planning worktree; no duplicate SDD artifact was invented in the code branch.
- Task 5b is complete and its matching implementation-owned checkbox is checked in `tasks.md`. All six gates remained closed. No push, PR, merge, production deployment, Web recreation, intake, processing, maintenance, replay, restore, purge, cleanup, client-data mutation, or rollout operation occurred. Delivery remains `disabled/unmanaged`.

## Final closed-gate verification settlement

- Task 6 completed from clean chain tip `0ceebc270288d12d2878963c2a2325a86b84364a`, which extends Candidate 5b through bounded local corrections `91db41e` (verification harness only, 72 changed lines) and `0ceebc2` (diagnostics type narrowing, 9 changed lines). Both commits are local; no push, PR, merge, deployment, or production operation occurred.
- Verification RED first reproduced ten stale payment-proof harness assertions. The separately authorized harness candidate aligned exact suite-local forward-migration imports, startup-captured gate fixtures, and the current leased/DB-authoritative projection contract; focused GREEN passed 27/27 tests. Production build RED then exposed TypeScript's inability to narrow keyed `unknown` diagnostics values; the predicate-based correction retained runtime validation and passed 26/26 focused tests plus ESLint.
- The home-backed Next.js 16 production webpack build passed. Turbopack was not used because it rejects the temporary external `node_modules` symlink as outside the worktree filesystem root; this was a tooling-path failure, not a product fallback. Build output then enabled the standalone production-like render-worker verification, which passed 9/9.
- The complete focused payment-proof/provider matrix passed 33 files and 236/236 tests. Seventeen payment-proof SQL suites each ran in an independent disposable self-hosted database because some suites intentionally import migrations 34–38; all command statuses were zero, every TAP plan completed, and 217/217 numbered assertions were `ok` with no `not ok` output.
- Repository lint passed with zero errors and 74 pre-existing warnings. `npm run selfhost:config` passed. The repository-wide unit baseline completed 1,142 passing and one skipped test but remained non-green due to three unrelated credential-runner assertions and one credential-required module import; no failure referenced payment-proof code, and the independent final audit confirmed zero impact on this change's acceptance.
- Clean-chain checks passed: Candidate 5b is an ancestor, final worktree status is empty, temporary dependency/credential symlinks were removed, `git diff --check` passed, and all six Compose gates remain declared `false` by default.
- Independent final read-only audit returned PASS with no critical, high, medium, or low finding across asynchronous canonical intake, Evolution-exclusive WhatsApp authority, Cloud non-admission, seller leases/reconciliation, diagnostics/replay, immutable fail-closed gates, redacted readiness, and no automatic operations.
- Evidence is retained under `/home/wilkin/.cache/asados-rdd/canonical-payment-proof-operations/final-verification/` (`phase-b-webpack`, `phase-c`, `phase-d`, and `phase-f-sql-individual`). Task 6 is checked in `tasks.md`. Delivery remains `disabled/unmanaged`; no receipt is claimed.

## Remaining actions after Task 6

- Candidate 1b remains deferred/not required unless independently executable evidence establishes a production RPC defect.
- Parent-owned sync/archive, push/PR, deployment, Web recreation, rollout, gate opening, replay, restore, purge, cleanup, maintenance, processing, and client-data mutation remain deferred and require separate authorization.

## Maintainer disposition — Option A

The maintainer selected **Option A**: freeze `canonical-payment-proof-operations` as functionally verified but formally non-archivable. Candidate 3b lacks authentic historical strict-TDD RED-before-implementation provenance, and that provenance is irreconstructible after implementation. No remediation attempt will be made for that historical gap unless a real functional defect, new requirement, or supported governance mechanism appears.

Functional verification remains green at 21/21 requirements, 28/28 scenarios, and 18/18 implementation tasks, supported by retained focused test, SQL, unit-baseline, build, lint, and configuration evidence. Preserve the valid formal FAIL evidence revision `sha256:d7a79e2a0087df558c8d202497010796c310d1015558f54edd5dce6be07df4fb` and controlled reset revision `sha256:85c586c40da4d7437637e0e8112642217efe610308594cea0eed4e90589690d0`.

Archive remains intentionally blocked. This note does not authorize push, PR, merge, deploy, gate opening, replay, restore, purge, maintenance, processing, rollout, or client-data mutation. It does not authorize acquiring, resetting, or settling an SDD runtime attempt; it is a maintainer disposition note, not remediation.

Future functional evolution must use a new bounded change with authentic strict-TDD provenance from inception.
