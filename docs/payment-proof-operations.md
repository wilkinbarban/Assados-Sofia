# Payment proof operations

Canonical Web and Telegram intake is enabled with `PAYMENT_PROOF_CANONICAL_INGEST_ENABLED=true`. WhatsApp remains independently disabled until its provider compatibility gate passes. Disable the canonical flag to roll consumers back without deleting the ledger. The private bucket is accessed only through row-authorized routes or service workers.

## Verified production state

The Telegram production smoke is complete. The verification used one canonical intake and established all of the following without recording any token, chat identifier, storage key, phone number, or delivery identifier in this runbook:

- the original object was retained in private storage;
- a private PNG preview was present;
- the durable processing queue entry completed;
- `intake_received`, `preview_rendered`, and `advisory_extracted` occurred exactly once each;
- the proof finished in `review` status;
- neither `approved` nor `payment_confirmed` occurred, so there was no automatic approval;
- no resend was performed;
- Telegram reported `pending_update_count=0` and no recent webhook error;
- the sensitive-log scan returned zero matches;
- live and ready probes returned HTTP 200; and
- the web and maintenance services were healthy.

This evidence verifies the Telegram path only. It must not be generalized to the pending Evolution/WhatsApp path described below.

## Intake, processing, and replay

Canonical intake performs durable admission: the intake ledger, exact-hash decision, and processing-queue admission are committed together after the private original has been uploaded. The webhook can therefore acknowledge accepted work without performing PDF rendering or advisory extraction inline. Workers claim queue entries with bounded leases and attempt identity, then render, persist the private preview, perform advisory extraction, and complete the claim.

PDF page-one rendering runs in an isolated worker thread through the deterministic production entry point `/app/payment-proof-render-worker.mjs`. The image build copies that non-transformed ESM runner to the fixed path so runtime package resolution and worker startup do not depend on a webpack-generated filename. Rendering is bounded by input size, output dimensions, and a timeout; failures are represented by a stage rather than by logging document content.

Queue claims retry with bounded backoff. After the fifth unsuccessful attempt, work becomes `dead_letter` and a proof still in an intermediate processing state is returned to `review` for manual-safe handling; it is never auto-approved. Lease-token and attempt checks prevent stale workers from completing newer claims. Replays use the channel delivery key and exact-hash controls: a completed delivery is treated as complete, active queued work remains queued, and a fully persisted intake missing its queue row can be repaired atomically. Preview persistence and advisory attempt keys make repeated processing idempotent rather than creating duplicate render or extraction events.

## Rollout readiness

This is **readiness only**: commands and steps are not executed automatically, and this candidate performs no production operation. Production remains unchanged and `PAYMENT_PROOF_PROCESSING_ENABLED=false`.

| Stage | Entry evidence and observation | Stop condition |
|---|---|---|
| Stage 0 — closed baseline | Verify all six gates report closed with a redacted reason; retain the privileged diagnostic record. | Any gate is unexpectedly effective, malformed, or unreadable. |
| 1 — canonical intake | Authorize canonical intake only; observe one bounded canonical admission and its aggregate queue state. | Duplicate admission, unsafe state, or unexpected processing. |
| 2 — WhatsApp intake | After separate explicit authorization and compatibility evidence, authorize WhatsApp intake; canonical and WhatsApp are observed separately and explicitly. | Missing provenance, compatibility failure, or channel cross-over. |
| Stage 3 — `PAYMENT_PROOF_PROCESSING_ENABLED` processing | Prior operational conversation called this Stage 2; use this exact capability/gate name with either reference. Canary preparation is HOLD: the sole pending row is quarantined and its original is absent, so MIME, size, and PDF magic cannot be established. | Do not enable the gate. Dead-letter growth, stale lease, render/classifier failure, or automatic approval also stops any later authorized canary. |
| 4 — seller reconciliation | Authorize seller reconciliation only after processing evidence is accepted; observe one human-confirmed reconciliation. | Amount/order mismatch, authorization failure, or unexpected state transition. |
| 5 — recovery readiness | Keep replay and cleanup closed absent separate authorization; verify their redacted closed diagnostics and recovery evidence. | Either recovery gate becomes effective without its separate authorization. |

The forward-only local migration `20260902160000` is designed and tested but not
applied. It has an operator-safe boundary: only the narrowly defined pristine,
unleased pending class with a quarantined proof and absent recorded original may
be marked abandoned; the proof and Storage remain untouched, `completed_at`
remains null, and an immutable audit decision is recorded. Applying it requires
explicit independent authorization.

After separately authorized application, run a fresh read-only preflight. It
must show no eligible pending work before separately asking whether to enable
Stage 3 `PAYMENT_PROOF_PROCESSING_ENABLED`. This does not mean the gate is ready
now, and neither migration application nor preflight authorizes a gate change.

Close declaratively by recording the stage, evidence, observer, and stop-condition result. If a stop condition occurs, return all gates to the closed baseline; Web recreation occurs only under approved change control, followed by verification rollback against bounded diagnostics. Do not replay, clean up, or otherwise operate production automatically.

## Database rollout and backups

The following production backups were completed before or during the rollout:

- `20260829T151617Z`
- `20260829T202432Z`

Production migration history verified that each of these migrations was applied exactly once:

- `20260828300000_payment_proof_operational_metrics.sql`
- `20260828310000_payment_proof_admin_alerts.sql`
- `20260828320000_payment_proof_processing_queue.sql`

The production pgTAP run for operational metrics and alerts passed 68/68 assertions. The processing-queue pgTAP run passed 13/13 assertions in a disposable database clone, **not in production**. Keep that distinction in rollout records and incident reports.

## Metrics, alerts, and scheduler health

Operational metrics expose bounded aggregate counts by lifecycle, queue/outbox status, attempt bucket, dead-letter state, quarantine state, failure stage, and maintenance health. Never log or export proof payloads, sender references, storage paths, tokens, chat identifiers, phone numbers, delivery identifiers, or extracted document text.

Production verification established:

- authenticated metrics returned HTTP 200;
- unauthenticated metrics returned HTTP 401;
- metrics responses used `Cache-Control: no-store`;
- alerts with an incorrect bearer returned HTTP 401; and
- after deployment, alert state contained zero active alerts and zero `pending`, `claimed`, `dead_letter`, or `sent` notifications.

Do **not** perform an authenticated alerts smoke merely to test connectivity: that operation can reconcile state and send real Telegram notifications. Validate alert delivery through the scheduled operational path and aggregate state, using approved incident procedures when a real notification test is necessary.

The scheduler invokes maintenance and alerts independently on every interval and records a separate last-success marker for each call. Its healthcheck requires both markers to exist, contain valid timestamps, and remain fresh. A successful maintenance call does not mask a failing alerts call, and a successful alerts call does not mask failing maintenance. Alert on dead-letter growth, expired quarantines, repeated render/classifier failures, and either stale health marker.

Secret-safe checks should pass credentials only through the deployed secret mechanism, suppress response bodies unless aggregate output is required, and record only status codes and bounded counts. Never paste bearer values into commands, shell history, tickets, or this document. Do not probe private objects by constructing storage URLs; use the authorized application or service-worker boundary.

## Evolution/WhatsApp: pending action

Evolution API remains pinned to the expected `2.3.7` compatibility line, and payment-proof ingestion remains disabled and fail-closed with `WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED=false`. Compatibility code and tests exist, but no Evolution payment-proof production smoke has been completed. Meta intake is outside this rollout's scope.

Do not enable the flag based on Telegram evidence or unit tests. Enabling requires valid, fresh Evolution provenance and operational attestation that match the pinned release/profile/fixture contract, followed by an explicitly approved production smoke. Missing, malformed, mismatched, stale, or future attestation must leave ingestion closed. Until those prerequisites and the Evolution smoke are complete, this is the only pending channel action; Telegram verification remains complete.

## Workspace quota recovery

Use the workspace preflight before local test or Web build work when `/tmp` is quota-backed. The standard commands already run through it:

```bash
npm test
npm run build
```

To diagnose a target or run another write-heavy command with home-backed temporary and npm cache directories:

```bash
scripts/workspace-preflight.sh check
scripts/workspace-preflight.sh check /var/lib/asados/deploy
scripts/workspace-preflight.sh run -- <command>
```

The wrapper creates a mode-0700 workspace under `$HOME/.cache/asados/workspace` by default, verifies free bytes and inodes, and performs a write-plus-fsync probe. It exports `TMPDIR`, `TMP`, `TEMP`, and `npm_config_cache` only to the wrapped command. If it reports `EDQUOT` or quota exhaustion, note the target and mount from its diagnostic, free or raise the applicable quota, and rerun with a home-backed workspace. Do not put credentials in paths, command arguments, or incident notes.

Web deployment checks `ASADOS_DEPLOY_STATE_ROOT` before creating its lock or release state. Its default remains `/var/lib/asados/deploy`; set that variable only to an approved, quota-provisioned state location.

## Delivery governance

Receipt-driven development delivery state for this rollout is `disabled/unmanaged`. Operational evidence above is production verification, not a fabricated review approval or receipt.
