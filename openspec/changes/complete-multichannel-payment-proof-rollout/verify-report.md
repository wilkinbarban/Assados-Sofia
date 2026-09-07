# Verify Report: Independent Category A Acceptance Review

## Historical status: FAIL at the time of this independent review

> **2026-09-07 audit addendum:** this report is retained as historical review evidence, not the current operational verdict. Later sanitized evidence and a fresh isolated pgTAP rerun cover restore (28/28), replay (45/45), genuine replay concurrency (4/4), reconciliation (20/20), admin workflow (2/2), and lifecycle (1/1), including supervisor replay and scheduler-aware Web completion recorded in `apply-progress.md`. The audit also corrected the false scheduler-absence claim. Current operation is nevertheless stopped because 5 processing dead letters were detected; all 8 gates are closed. See `docs/payment-proof-operations.md` for authoritative current posture.

This was a read-only acceptance review of the private evidence in `/tmp/category-a-payment-proof/`, the current OpenSpec artifacts, focused tests, production catalog state, and safe Docker health/image metadata. No production write, gate change, replay, purge, source implementation change, or secret output was performed.

## Executive summary

The delegate produced credible evidence for a narrow synthetic purge-fence exercise, one active-admin direct replay RPC, repeat-key behavior, active seller/customer denial, closed Web replay diagnostics, browser seller exclusion, exact-scope cleanup, and retained detached tombstone state. However, the mandatory Category A matrix and lifecycle proof are incomplete. Essential missing evidence includes later exact-bytes duplicate behavior with a generic/no-customer-metadata result, active-supervisor replay success, inactive/stale/unsupported-role denials, terminal/blocked/expired/leased target denials in this operational fixture, a positive Web replay-gate path, and durable before/after no-mutation assertions for every denial. Category A therefore cannot be accepted.

A material runtime discrepancy was independently confirmed: `asados-payment-proof-maintenance` exists, is healthy, and has zero restarts. The delegate statement that no standalone scheduler exists is false. The expected current Web image with sanitized ID prefix `34bf5fa7…` is present and running healthy with zero restarts.

## Category A acceptance matrix

| Criterion | Result | Durable evidence and review finding |
|---|---|---|
| New isolated synthetic manifest created before writes | PASS | Private directory mode is `700`; all five JSON evidence files are mode `600`. Manifest schema identifies three generated Auth actors, two customers, one conversation, two orders, three proof aliases, five exact storage objects, and exclusions. No secret values were printed. |
| Exact-scope object cleanup | PASS | Manifest contains exactly five object paths. Read-only production query found zero manifested storage rows after cleanup. Evidence reports count `5 → 3` during the successful two-object purge step and final zero across all five manifested paths. |
| Original and derivative deletion | PASS | A1 evidence contains distinct original and preview fields in the claimed purge work item; the storage count decreased by two before fenced completion. Final manifest-scoped catalog query found no remaining object. This supports deletion of the manifested original and derivative, not a broad purge. |
| Purge completion uses token/attempt fence | PASS | A1 evidence records a claimed purge item with attempt and lease-token fields, successful retryable-failure completion, successful exact completion, and rejection of stale completion. The production RPC contract requires matching status, token, and attempt. |
| Restore denied while purge fence is active | PASS | A1 evidence records stable denial `PAYMENT_PROOF_NOT_RESTORABLE` while the race fixture was under purge ownership. |
| Tombstone retained and detached from deleted proof/customer | PASS | Final read-only query found one detached manifested hash tombstone and no attached manifested tombstone; all manifested proof/customer rows were absent. The ledger has no authenticated table grant by migration contract. |
| Later exact bytes return generic duplicate with no customer metadata | FAIL | No later intake/admission result exists in A1, A2, browser, runtime, or manifest evidence. Only original/derivative hashes and final detached tombstone state are present. There is no durable response proving generic duplicate semantics, no-customer metadata, non-resurrection, or cross-customer opacity for a later exact-byte submission. This is an essential lifecycle criterion. |
| Active admin replay succeeds | PASS | A2 durable RPC-shaped response records `replayed` for the first request. The manifest includes a generated admin Auth actor, and browser evidence confirms a genuine admin login for diagnostics. |
| Active supervisor replay succeeds | FAIL | No supervisor actor exists in the Category A manifest and no operational supervisor success result is present. Existing pgTAP coverage is not a substitute for the required Category A operational matrix. |
| Active seller replay denied | PASS | A2 records SQLSTATE `42501` and stable `PAYMENT_PROOF_REPLAY_FORBIDDEN`; browser evidence shows the seller cannot remain on the admin route and receives no admin panel. |
| Inactive seller replay denied | FAIL | No inactive-seller invocation or before/after invariant evidence exists. Final actor deletion is not an inactive-authority test. |
| Stale/expired actor or expired lease denied | FAIL | No stale-session actor invocation is recorded. A stale purge completion is covered, but that does not prove stale replay actor or expired replay lease denial. |
| Unsupported role denied | FAIL | The manifest contains only admin, seller, and customer actors. Customer denial is useful but does not establish the full unsupported-role matrix requested by the execution plan. |
| Terminal, blocked, expired, or otherwise ineligible target denied | PARTIAL | A2 records one `ineligible` result, but does not preserve the target-state classification or before/after protected-state snapshot. Terminal, blocked, expired, and leased/locked cases are not individually proven by this operational evidence. |
| Denials cause no protected mutation or success audit | PARTIAL | Seller/customer responses and eventual exact-scope cleanup are present, but the private evidence lacks per-denial before/after counts for proof, order, payment, linkage, queue, lock, and success audit. The generic `queue: null` field is insufficient for the full no-mutation matrix. |
| Same replay key has no extra effect | PARTIAL | First and repeat return `replayed`; conflict-key reuse is recorded, and no fixture replay ledger/event rows remain after cleanup. The evidence does not retain a durable pre-cleanup effect-count snapshot proving exactly one queue transition/work item. Existing SQL tests assert one key/effect, but the live fixture claim is under-evidenced. |
| Genuine replay concurrency | PARTIAL | Source test `payment_proof_dead_letter_replay_concurrency.sql` uses two asynchronous dblink sessions and asserts one owner/effect. This is genuine database concurrency test design. The independent rerun was blocked before execution because the authorized repository environment symlink was intentionally absent; no new green pgTAP result was obtained in this review. |
| No automatic follow-on replay | PARTIAL | SQL test source confirms no replay trigger. The live A2 evidence does not include a bounded post-observation snapshot proving no subsequent replay, and the actual maintenance scheduler exists. |
| Admin read-only diagnostics and seller exclusion | PASS | Real-browser evidence reports admin diagnostics, sanitized replay-closed disclosure, stable closed-action denial, seller route rejection, and zero seller admin panels. Focused diagnostics/restore-gate Vitest rerun passed 19/19. |
| Web replay gate closed | PASS | Browser evidence confirms the deployed Web action denied replay while privileged replay was disclosed closed. |
| Positive Web replay gate path where required | FAIL | The successful replay bypassed the Web action gate and used the database RPC directly while the Web privileged-replay gate remained closed. This validates DB authority but does not satisfy the parent canary row requiring a separately authorized replay-gate window and positive Web-boundary operation. |
| Genuine Auth customer | PARTIAL | The manifest contains a generated customer Auth credential pair and A2 records an authenticated customer authority denial. No customer browser/API visibility check or exact-byte duplicate response was captured, so customer-side opacity and metadata non-disclosure remain unproven. |
| Final generated actor disposition | PASS with deviation | Final read-only query found zero manifested profile rows and zero manifested Auth rows. Deleting generated Auth actors was within the user's explicit synthetic-fixture purge permission, but it deviates from the plan's default preference to preserve audit/tombstone and leave actors inactive. The detached tombstone remains; actor deletion reduced later auditability and makes stale/inactive replay retesting impossible without new actors. |
| Services, image, and gates safely closed | PARTIAL | Web and maintenance scheduler are healthy with zero restarts; current immutable Web image matches sanitized prefix `34bf5fa7…`. Closed Web replay was observed. A full allowlisted gate-state and circuit-breaker snapshot was not independently rerun in this review. |

## Exact RPC versus setup distinction

- Synthetic fixture provisioning necessarily used direct database/storage setup; that is acceptable for isolated test data but does not itself prove application behavior.
- The A2 success/denial artifacts have the standard Supabase/PostgREST RPC response shape and stable database outcomes. They support direct authenticated calls to `replay_payment_proof_dead_letter` for admin, seller, customer, repeat, conflict, and one ineligible case.
- The successful replay was **not** a positive Web Server Action replay: browser evidence proves the Web replay gate was closed and its action denied. Thus the evidence validates database RPC authority while failing the Web-gated operational replay criterion.
- Purge evidence supports use of claim/completion RPC fencing after exact storage deletion. It does not show that a scheduler performed deletion; the storage objects were removed in the bounded fixture procedure and completion was then fenced.

## Unsupported or contradicted claims

1. **“No standalone scheduler exists” is contradicted.** Safe Docker inspection found healthy container `asados-payment-proof-maintenance`, image `alpine:3.20`, zero restarts, running the payment-proof maintenance scheduler script.
2. **“Category A completed” is unsupported.** Multiple mandatory replay roles/target states and the later exact-byte duplicate/no-metadata scenario are absent.
3. **“No automatic follow-on replay occurred” is only partially supported.** No replay trigger exists in SQL test coverage, but no bounded live post-observation snapshot was retained and a scheduler is present.
4. **“Same key produced one effect” is under-evidenced operationally.** Outcomes repeat safely, but fixture-level effect counts before cleanup were not retained.
5. **“No cross-customer disclosure” is unsupported for later exact bytes.** The needed second-customer exact-byte admission and generic result were not executed or preserved.

## Test and validation commands

| Command | Result |
|---|---|
| `git -C /home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy rev-parse --show-toplevel` | PASS; exact exclusive worktree confirmed. |
| Safe `stat`/`jq` schema-only inspection of `/tmp/category-a-payment-proof/*.json` | PASS; private modes and evidence shapes confirmed without printing secrets or identifiers. |
| Manifest-scoped read-only production SQL through `docker exec asados-supabase-db psql -X -qAt -U supabase_admin -d postgres` | PASS; zero fixture proof/customer/conversation/order/profile/Auth/storage rows, one detached manifested tombstone, and no attached tombstone/replay/event rows. |
| `docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}'` with safe service filtering | PASS; Web and actual maintenance scheduler found healthy. |
| Safe `docker image inspect sha256:34bf5fa7…` | PASS; expected immutable image exists. |
| `npx vitest run tests/unit/payment-proof-diagnostics-replay.test.ts tests/unit/payment-proof-operational-gates-diagnostics.test.ts tests/unit/payment-proof-restore-gate.test.ts` | PASS; 3 files, 19 tests. |
| `npm run selfhost:test:db -- supabase/tests/payment_proof_processing_queue.sql supabase/tests/payment_proof_dead_letter_replay.sql supabase/tests/payment_proof_dead_letter_replay_concurrency.sql` | NOT RUN / environment-blocked; exited 1 because `ops/supabase/.env` was absent. No symlink was created because this review was read-only. |

No full test suite or build was rerun: this was an independent Category A operational acceptance review, and the missing essential scenarios already prevent acceptance.

## Strict TDD compliance

Strict TDD is active. `apply-progress.md` contains multiple `TDD Cycle Evidence` tables, and the referenced focused files exist. The focused 19-test diagnostics/gate suite remained green. The relevant SQL concurrency file genuinely uses asynchronous dblink sessions and nontrivial outcome/effect assertions. No tautology, ghost-loop, type-only-only, smoke-only, or CSS implementation-detail assertion was found in the focused files scanned for this review.

**Compliance result: PARTIAL.** Operational Category A authored no new product code, but its acceptance evidence is incomplete. The SQL green claims could not be independently rerun because the private environment symlink was absent, and operational assertions do not cover the mandatory exact-byte/customer-opacity and full replay matrix.

Coverage analysis was skipped; no coverage run was required for this operations-only acceptance review.

## Task completion and archive status

Unchecked implementation tasks remain; therefore verification cannot be a clean pass and archive is not ready. Exact unchecked implementation lines:

```markdown
- [ ] Update `docs/payment-proof-operations.md` and current-change-only evidence/runbook material with completed **Web and Telegram** sanitized baseline evidence, production baseline with canonical intake open and processing, reconciliation, cleanup, privileged replay, and WhatsApp intake closed, release/image and forward-migration aliases, dashboards/health/circuit-breaker checks, escalation owner references, environment symlink ownership/mode/path-alias preflight, declarative gate/Web-recreation sequence, immutable-image rollback, explicit non-actions, and no-repeat instruction for completed Web/Telegram canaries. <!-- sdd-owner: implementation -->
- [ ] Add an evidence template under `openspec/changes/complete-multichannel-payment-proof-rollout/` that permits only approved window, role/owner reference, aggregate count/outcome, gate states, image/migration aliases, health/circuit-breaker result, rollback readiness, and redacted correlation aliases; explicitly exclude all PII/secrets/full identifiers. <!-- sdd-owner: implementation -->
- [ ] Verify documentation references against the actual startup, Compose, health, migration, test, and rollback discovery targets; run `npm test`, `npm run build`, `npm run selfhost:config`, and the applicable migration verification command, recording sanitized status only. <!-- sdd-owner: implementation -->
- [ ] Confirm every implemented authority boundary permits only active supervisor/admin reconciliation operations and proves seller/inactive/stale/unsupported denials without protected mutation or success audit. <!-- sdd-owner: implementation -->
- [ ] Confirm the handoff/evidence material is sanitized, uses current-change documentation only, describes closed-gate posture and rollback/health windows, and contains no prohibited PII or secrets. <!-- sdd-owner: implementation -->
```

Parent-owned Category A lifecycle/replay rows also remain unchecked, correctly preventing parent acceptance from being inferred from delegate completion text.

## Structured status and action context

- Change selection: explicit `complete-multichannel-payment-proof-rollout`, confirmed on disk.
- Artifact store: authoritative OpenSpec in the assigned worktree; Engram was unavailable during initial lookup.
- Required specs, tasks, and apply-progress: present and read.
- Apply state: ready/incomplete because five implementation-owned rows remain unchecked.
- Action context: repo-local, workspace root `/home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy`; implementation ownership is proven inside this worktree.
- This review was read-only with respect to production and implementation. Only this mandatory verify artifact was updated.

## Review workload and boundary

The tasks require `feature-branch-chain` and bounded causal units. The current tracked diff spans 50 files with 1,092 additions and 597 deletions, so it is not a single ≤400-line review slice. No `size:exception` was found. This Category A operation introduced no source diff, but the accumulated branch still requires the planned chained review boundaries.

## Exact blockers

1. No later exact-byte intake proves generic duplicate behavior without customer metadata, resurrection, or cross-customer disclosure.
2. No active-supervisor operational replay success exists.
3. No inactive-seller, stale actor/session, unsupported-role, or complete terminal/blocked/expired/leased target matrix exists with protected-state no-op snapshots.
4. Successful replay occurred by direct authenticated SQL RPC while the Web privileged replay gate remained closed; no positive Web-gated replay was proven.
5. Operational repeat-key evidence lacks a retained exact effect-count snapshot.
6. The delegate's scheduler-absence claim is false; bounded no-follow-on observation must account for the existing scheduler.
7. Five implementation-owned task rows remain unchecked, independently blocking clean verification/archive.

## Minimal next action

Do not accept Category A. Under a new explicit bounded authorization, create a fresh isolated synthetic fixture and execute only the missing acceptance table: active supervisor success; inactive seller, stale actor/session, unsupported role, and each terminal/blocked/expired/leased denial with before/after protected-state counts; one authorized positive Web replay-gate request followed by closure/recreation and bounded scheduler-aware observation; and a second-customer later exact-byte submission proving a generic duplicate response with no customer metadata and no resurrection. Preserve sanitized aggregate evidence and leave generated actors inactive until independent review; delete Auth actors only after that review if explicitly authorized.
