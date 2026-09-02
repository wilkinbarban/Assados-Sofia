# Payment-proof development continuation

> **Resume from here:** work only in
> `/home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy`.
> The next action is to finish the authorized local cohesive commits and verify
> them without pushing, opening a PR, deploying, applying migrations, or changing a gate.

## Current production baseline

| Item | Verified state |
| --- | --- |
| Production image | `sha256:9e8b19ad2084bcedb592f61ed9f8451a8215dd001619fb04307a4b1c364daa3c` |
| Rollback image | `sha256:bb9e517e42ccc8058757e29c8b63cf0458e2338e2d23f2b4bac54a0611141ae8` |
| `PAYMENT_PROOF_CANONICAL_INGEST_ENABLED` | `true` |
| `PAYMENT_PROOF_PROCESSING_ENABLED` | `false` |
| `PAYMENT_PROOF_SELLER_RECONCILIATION_ENABLED` | `false` |
| `PAYMENT_PROOF_CLEANUP_ENABLED` | `false` |
| `PAYMENT_PROOF_PRIVILEGED_REPLAY_ENABLED` | `false` |
| `WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED` | `false` |
| Outbox | 4 abandoned: 3 `historical_destination_unresolvable`; 1 `historical_delivery_permanently_blocked` |
| Dead-letter / unresolved | 0 / 0 |
| Abandoned-row completion and leases | `completed_at = null`; all unleased |
| Historical audit | 1 `destination_repaired`; 3 `abandoned_unresolvable`; 1 `abandoned_permanent_delivery` |
| Processing queue | 1 pending with 0 attempts and no lease; 1 completed with 1 attempt |
| Applied migrations | `20260902130000`, `20260902140000`, and `20260902150000`, each once |
| Audit immutability | trigger present |
| Services | web, maintenance, and Evolution healthy; 0 restarts |
| Post-deploy logs | relevant error-token counts 0 |
| Temporary environment links | worktree `.env` and `ops/supabase/.env` absent |
| Delivery | no commit and no pull request for this deployed state |

This baseline is evidence, not permission to mutate production. Keep the exact six
gate values above until the corresponding human gate is reached.

## Naming decision required before a gate change

`docs/payment-proof-operations.md` labels WhatsApp intake as Stage 2 and
processing as Stage 3. The operational conversation called processing Stage 2.
Do not silently choose either convention. Refer to the capability by the exact
gate name `PAYMENT_PROOF_PROCESSING_ENABLED` until a human records the stage
terminology. A stage number never constitutes authorization.

## Controlling sequence

### Strategy 1 — Consolidate and version the deployed state

**Outcome:** Git represents the behavior already deployed, in cohesive review
units, before processing is enabled.

1. Map every tracked and untracked change to one behavior and dependency.
2. Keep the forward-only migrations intact; never edit an applied migration.
3. Preserve the migration runner contract:
   - default database user is `postgres`;
   - an explicit `ASADOS_MIGRATION_DB_USER` is validated as a strict identifier;
   - production ledger snapshots that require it run as `supabase_admin`.
4. Keep deployment pinned to Docker Compose project `asados` in both promotion
   and rollback paths. `--project-directory` alone is insufficient.
5. Decide whether the four historical `*-temporary.mjs` runners are deleted or
   converted into supported, generic, documented tools. The recommendation is
   deletion because their one-off targets are already durably audited.
6. Run focused checks for each work unit and prepare the exact commit plan.
7. **Stop for human authorization before creating commits or a pull request.**

Rollback boundary: this strategy changes repository state only. It must not
change the production image, database, queue, or gate values.

### Strategy 2 — Verify reproducibility

**Outcome:** a clean candidate built from the consolidated state is functionally
equivalent to the verified production image.

1. Run all focused suites associated with each work unit.
2. Run the relevant aggregate unit suite, TypeScript, ESLint, and
   `git diff --check`.
3. Verify forward-only migration ordering, local/production migration parity,
   required functions, grants, constraints, and the immutable audit trigger.
4. Build an immutable Docker candidate from the isolated worktree using the
   required public Supabase build arguments.
5. Compare candidate configuration and behavior with the production baseline:
   readiness contract, maintenance contract, gate defaults, destination
   propagation, permanent/retryable delivery classification, and authenticated
   metrics shape.
6. Do not deploy the candidate merely to prove build reproducibility. A new
   production promotion requires separate authorization.

Pass criteria: every check succeeds, the candidate is immutable, migration and
runtime contracts match, no secret or PII appears in evidence, and no unexplained
diff from production remains.

Stop criteria: any failing test, build failure, migration mismatch, missing build
argument, functional drift, or scope expansion.

### Strategy 3 — Prepare and run the processing canary

**Outcome:** only `PAYMENT_PROOF_PROCESSING_ENABLED` is exercised in a bounded
canary while every other closed gate remains closed.

Preparation is automatic and read-only:

1. Inspect the single pending processing row without exposing identifiers,
   payloads, storage keys, or sender data.
2. Establish that its source object exists, is a valid processable PDF, respects
   MIME and size limits, is not a fixture or residue, and has no unexpected
   external side effects.
3. Confirm attempts `0`, no lease, expected proof transition, fresh maintenance,
   `dead_letter=0`, healthy services, and no relevant log degradation.
4. Record the exact observation window, expected transitions, and rollback
   command before changing the gate.
5. **Stop for independent human authorization to set only
   `PAYMENT_PROOF_PROCESSING_ENABLED=true`.**

If authorized:

1. Re-read the baseline immediately before mutation.
2. Enable only `PAYMENT_PROOF_PROCESSING_ENABLED`; keep seller reconciliation,
   cleanup, privileged replay, and WhatsApp intake disabled.
3. Observe at least 2–3 maintenance cycles.
4. Verify preview/state transitions, leases, attempts, metrics, logs, health,
   restarts, and `dead_letter=0` after every cycle.
5. Close the canary according to the approved change record.

Rollback immediately if a dead letter appears, a lease is lost or stale, a proof
enters an invalid transition, readiness returns 503, a service restarts, metrics
or alerts degrade, or the target differs from the preflight evidence.

## Checkpoint status

| Checkpoint | Status | Next action |
| --- | --- | --- |
| Change-to-work-unit mapping | Complete | Keep file lists synchronized with the final diff |
| Durable cold-resume handoff | Complete | Update after every completed or blocked task |
| Canonical Compose project pin | Complete locally | Included in focused verification; not committed |
| Migration database-user contract | Complete locally | Re-run focused migration-runner tests |
| Temporary-runner disposition | Complete | Human authorized removal; four untracked one-off runners were deleted locally |
| Local versioning | Authorized, in progress | Create cohesive local commits only; do not push or open a PR |
| Reproducibility verification | Complete locally | 127 focused tests, TypeScript, build, isolated worker, lint (0 errors), shell syntax, and diff checks passed |
| Historical processing disposition | Complete locally, not applied | Forward-only migration `20260902160000` and 37-test compatibility slice pass; production application requires separate authorization |
| Processing canary preparation | HOLD | Read-only snapshot found the sole pending proof quarantined and its original absent from `storage.objects`; do not enable processing |
| Processing gate change | Human authorization pending | Never infer from preparation or stage number |

## Reviewable work units

Keep behavior, tests, and operational documentation together. Recalculate line
counts before proposing commits; split any unit above roughly 400 changed lines.

1. **Client order visibility and proof locks**
   - authenticated order listing;
   - retry and terminal-state lock projection;
   - client/chat controls and regression tests;
   - migration `20260901220000`.
2. **Operational metrics and maintenance compatibility**
   - numeric JSON normalization and extended metrics;
   - internal metrics/maintenance contracts and tests;
   - migrations `20260901203000` and `20260901210000`.
3. **Authoritative intake destination contract**
   - canonical intake, Evolution and Telegram propagation;
   - preflight before Storage plus server-side revalidation;
   - destination-contract tests;
   - migration `20260902130000`.
4. **Historical resolution and permanent delivery semantics**
   - immutable resolution ledger and disposition RPCs;
   - typed WhatsApp closed-window error;
   - `success | retryable | permanent` dispatch semantics;
   - migrations `20260902140000` and `20260902150000` with focused tests.
5. **Historical processing disposition**
   - bounded abandonment of only pristine pending work for a quarantined proof
     whose recorded original is absent;
   - immutable private audit, idempotency, locks, and terminal delivery-state
     semantics;
   - migration `20260902160000` with focused tests; not applied in production.
5. **Reproducible operations**
   - validated `ASADOS_MIGRATION_DB_USER` support and tests;
   - canonical Compose project pin and rollback regression test;
   - updated operational and continuation documentation.
6. **Retired temporary historical runners**
   - `scripts/smoke-client-payment-proof-temporary.mjs`;
   - `scripts/replay-payment-proof-dead-letters-temporary.mjs`;
   - `scripts/resolve-payment-proof-outbox-history-temporary.mjs`;
   - `scripts/dispose-payment-proof-permanent-history-temporary.mjs`.

The human selected removal from the candidate. All four untracked one-off runners
were deleted locally and must not be recreated or included in versioning. Their
database audit records, not the scripts, are the durable evidence.

## Automatic progression and stop contract

Proceed automatically through:

- non-destructive edits already within the approved consolidation scope;
- read-only repository and production inspection;
- focused and aggregate tests, static checks, and local immutable builds;
- updates to this handoff and test evidence.

Stop and ask the human before:

- any further destructive cleanup (the four temporary runners were removed under explicit authorization);
- creating commits, pushing, or opening a pull request;
- applying a new production migration or deploying a new image;
- changing any feature gate;
- replaying, disposing, completing, or otherwise mutating a production row;
- expanding scope, selecting stage terminology, or proceeding after a failed
  verification.

## Safe resume protocol

1. Start memory/session context, then read this document and
   `docs/payment-proof-operations.md`.
2. Run:

   ```bash
   cd /home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy
   test "$(git rev-parse --show-toplevel)" = "/home/wilkin/proyectos/Asados-worktrees/client-payment-fix-deploy"
   git status --short --branch
   git rev-parse HEAD
   ```

3. Confirm branch `fix/client-payment-flow-deploy` and expected base
   `fbe309c517d9faad4e56f8c33efec486fd989d4a`. Do not deploy, reset, clean,
   restore, rebase, or overwrite the dirty/diverged main checkout.
4. Treat the untracked root `node_modules` entry as an external symlink used by
   the worktree, not as source to stage. Inspect it read-only if needed; do not
   include it in any commit.
5. Confirm temporary `.env` links remain absent. Never print credentials.
6. Read the task list and latest project memory; mark exactly one task in
   progress.
7. Re-check the current checkpoint table and continue the first pending action
   whose prerequisites are complete.
8. After each task, record commands, bounded results, changed files, remaining
   risk, and the next stopping gate here and in session memory.

## Latest verification evidence

- Focused payment-proof and operations suite: 16 files, 127 tests passed.
- `npx tsc --noEmit`: passed after narrowing test mock/helper types.
- ESLint: 0 errors; 69 repository warnings remain, including pre-existing areas.
- `sh -n ops/supabase/migrate.sh scripts/deploy-web.sh`: passed.
- `git diff --check`: passed.
- The production-like render-worker test identified that DOM polyfills must load
  before importing `pdf-parse`; the source order is corrected locally.
- A fresh standalone build passed after installing worktree-local dependencies
  and temporarily linking the approved environment source. The temporary link
  was removed after the build. The isolated real PDF worker then passed 9/9.
- Read-only canary preflight confirmed one pending, attempts-0, unleased queue
  row, but its proof status is `quarantined` and its original key has no matching
  `storage.objects` row. MIME, size, and PDF magic therefore cannot be proven.
  `PAYMENT_PROOF_PROCESSING_ENABLED` must remain `false`.
- A forward-only historical disposition was designed locally in migration
  `20260902160000`. It can mark only that exact class of pristine, unleased,
  missing-original work as `abandoned`, keeps `completed_at = null`, leaves the
  proof and Storage untouched, and records an immutable audit decision. Focused
  compatibility verification passed 37 tests; TypeScript, lint (0 errors, 67
  warnings), shell syntax, and `git diff --check` also passed. The migration has
  not been applied.

## Acceptance and rollback boundaries

Consolidation is accepted when every changed file belongs to one review unit,
focused checks pass, temporary artifacts have an explicit disposition, and the
exact commit plan is ready for human authorization.

Reproducibility is accepted when the consolidated source passes all checks and
produces an immutable candidate whose contracts match production without a
production mutation.

The canary is accepted only after explicit authorization and 2–3 clean cycles
with the intended transition, valid leases, healthy services, stable metrics and
logs, and zero dead letters.

For a production regression, stop progression and use the retained rollback
image only under the approved rollback procedure:
`sha256:bb9e517e42ccc8058757e29c8b63cf0458e2338e2d23f2b4bac54a0611141ae8`.
After rollback, verify the six gate values, health, restarts, metrics, logs,
queue state, and audit state before any further action. Rollback does not
authorize replay, cleanup, or historical-row mutation.
