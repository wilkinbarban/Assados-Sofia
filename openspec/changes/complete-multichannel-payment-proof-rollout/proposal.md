# Complete Multichannel Payment-Proof Rollout

## Decisions and review path

This proposal completes the **operational rollout**, not a new implementation of the canonical payment-proof system. The verified production baseline is **canonical intake only**: canonical intake is open, while processing, reconciliation, cleanup, privileged replay, and WhatsApp intake remain closed. This document does not itself authorize any additional gate opening, replay, cleanup, reconciliation, or other production mutation.

The following decisions are binding for all remaining phases:

1. **Amount confirmation and reconciliation authority is supervisor/admin only.** Only an active `supervisor` or `admin` may confirm a proof amount, link eligible orders, reconcile/approve, or reject. Active `vendedor` users are denied these operations. This explicitly supersedes the historical `vendedor concilia` decision in `canonical-payment-proof-operations`; the earlier artifact remains unedited as historical record.
2. **Evolution is the only production WhatsApp payment-proof intake authority.** WhatsApp Cloud remains compatible for required verification and general-chat behavior but must never admit payment media.
3. **Protected capabilities are controlled through startup-captured declarative configuration and approved Web recreation.** Canonical intake is already open in the accepted production baseline; all other protected capabilities remain closed. Configuration changes are ineffective in an already-running process. Missing, malformed, unreadable, cache-local, database, or runtime override values fail closed.
4. **Telegram has an independent intake gate, but it is subordinate to the canonical-intake gate.** Telegram intake may open only when both the canonical gate and Telegram gate are open; closing either gate denies new Telegram proof admission.
5. **Images are immutable and database migrations are forward-only.** Rollback of a code defect uses the approved immutable image; rollback of a capability closes the relevant declarative gate and recreates Web. No historic migration rewrite or destructive rollback is allowed.
6. **A controlled final production deployment and test are authorized after implementation and pre-deployment verification are complete.** The deployment must use the isolated worktree, an immutable candidate image, pre/post health checks, circuit breaker, startup-captured gates, and immediate rollback on a stop condition. Push and opening a PR are authorized after the required evidence is accepted; merge still requires separate, final explicit permission. This authorization does not pre-authorize unrelated replay, restore, purge, cleanup, permanent gate opening, or client-data mutation.

### Required review sequence

Reviewers should approve progress only in this order:

1. Confirm the authority correction is present at database/RPC, Server Action, UI, and test boundaries: sellers are denied and only active supervisors/admins can reconcile.
2. Confirm the production-ready handoff describes all baseline evidence without PII or full identifiers and records the closed-gate posture.
3. Approve each canary phase from its sanitized evidence, health signals, stop conditions, and rollback readiness before considering the next phase.
4. Obtain a named human decision on whether permanent processing and reconciliation should remain enabled after the canaries.
5. Permit push/PR creation only after the preceding review evidence; grant merge only through a distinct final approval.

## Intent

Safely finish the remaining multichannel payment-proof rollout after the canonical implementation has been functionally verified under closed gates. The business outcome is a dependable, auditable way to receive customer payment proofs from the supported channels while keeping financially consequential confirmation and reconciliation with accountable privileged operators.

The rollout addresses the remaining gap between a verified closed-gate implementation and an operations-ready production service: operational handoff, corrected role authority, real WhatsApp/Evolution evidence, independently gated Telegram admission, lifecycle canaries, restricted replay validation, and an explicit human decision about enduring processing and reconciliation.

## Baseline and current-state gap

`canonical-payment-proof-operations` is functionally verified. In the accepted production baseline, canonical intake is open and processing, reconciliation, cleanup, privileged replay, and WhatsApp intake are closed. Its retained evidence records green focused provider/payment-proof validation, independent SQL verification, build, lint, configuration validation, immutable startup-captured gates, provider authority boundaries, privileged diagnostics/replay readiness, and rollback behavior. Its formal archival status remains intentionally blocked by a historical strict-TDD provenance gap; that governance outcome is not reopened or remedied by this rollout proposal.

Completed, sanitized canary baseline evidence is:

| Completed baseline | Recorded evidence | Privacy boundary |
| --- | --- | --- |
| Web payment-proof canary | Canonical admission and acknowledgement behavior were exercised through the Web path under controlled conditions, with queue/health observations captured for the handoff. | Record only time window, aggregate counts/outcomes, gate state, release/image reference, and redacted correlation aliases; do not include customer content, phone numbers, tokens, payloads, storage URLs, or full proof/order/message identifiers. |
| Telegram payment-proof canary | Telegram delivery/admission and duplicate-safe behavior were exercised under controlled conditions, with no full provider identifiers retained in rollout documentation. | Use the same redacted evidence format; retain provider update/message identity only in approved restricted operational logs where required, never in OpenSpec or PR text. |

These completed Web and Telegram observations are baseline evidence, not authorization to leave any gate open, to process production traffic permanently, or to reconcile payments. Any discrepancy between the handoff evidence and live health must stop progression and return the affected capability to closed state.

## Scope

### In scope

- Update the production handoff/runbook with sanitized Web and Telegram baseline evidence, ownership, escalation, health checks, startup-gate inventory, rollback instructions, and the split between implementation verification and production operational authorization.
- Correct reconciliation authority everywhere it is enforced or presented: active supervisor/admin only; active, inactive, or stale-session `vendedor` users are denied amount confirmation, order linking, reconciliation/approval, and rejection.
- Perform a real Evolution WhatsApp end-to-end canary after explicit operational authorization, proving authenticated delivery reaches canonical admission without a legacy `comprovantes` write or inline rendering/OCR/extraction.
- Add and validate an independent Telegram intake gate that is logically subordinate to canonical intake, including startup-only capture, closed defaults, redacted diagnostics, and a gate-combination test matrix.
- Run a bounded quarantine-to-restore canary using a deliberately authorized, non-sensitive test proof and confirm exactly one correction notice, safe audit, and no unauthorized restore path.
- Run a bounded expiry-to-purge-to-tombstone canary using a deliberately authorized, non-sensitive test proof and confirm byte/derivative deletion, retained hash/audit tombstone, and duplicate-safe behavior after purge.
- Run a privileged replay canary for one explicitly selected eligible test dead letter, with supervisor/admin authorization, idempotency key, audit, health observation, and no automatic follow-on replay.
- Require an accountable human decision, backed by the canary record, on whether processing and reconciliation become permanently enabled, remain time-bounded, or return to closed state.
- Prepare the branch for push and PR opening after evidence review, while preserving merge as a separate final authorization.

### Out of scope

- Product-code redesign beyond the narrow authority correction and Telegram gate support needed for this rollout.
- Reopening the historical strict-TDD provenance disposition or modifying prior OpenSpec artifacts.
- Replacing Evolution with WhatsApp Cloud or accepting Cloud payment media.
- Seller reconciliation, seller amount confirmation, seller rejection, seller restore/purge, seller dead-letter diagnostics, or seller replay.
- Automatic production replay, automatic gate opening, automatic restore/purge, automatic cleanup, or automatic permanent enablement.
- Mutable image deployment, cache-local gate controls, dynamic runtime overrides, database gate toggles, or backward migration edits.

## Affected areas

| Area | Required outcome |
| --- | --- |
| Payment-proof database/RPC authority and RLS | Active supervisor/admin checks are authoritative for confirmation, linking, reconciliation/approval, and rejection; sellers receive a safe denial with no state change or success audit. |
| Server Actions and Atendimento payment-proof workflow | UI and action surfaces accurately reflect supervisor/admin-only reconciliation; stale or direct seller submissions are independently denied and cannot expose raw database errors. |
| Gate parser, Compose environment, and diagnostics | Existing gates remain startup-captured and fail closed; add/validate the Telegram gate and report only redacted effective state/reason. Telegram admission requires canonical **and** Telegram gates. |
| Web, Evolution, Telegram, and Cloud adapters | Preserve canonical asynchronous admission, delivery idempotency, fast acknowledgement, Evolution-exclusive WhatsApp proof authority, and Cloud non-admission. |
| Worker, lifecycle, dead-letter, and audit operations | Support bounded canary observation for restore, purge/tombstone, and replay without weakening queue, lock, terminal-state, idempotency, or audit invariants. |
| Operations handoff and release workflow | Record sanitized evidence, ownership, decision points, health thresholds, rollback commands/procedure references, and the PR/merge authorization boundary. |

## Phased rollout and exit criteria

### Phase A — Operational handoff and authority correction

**Outcome:** The production handoff accurately describes the verified closed baseline, and reconciliation authority matches the corrected business decision.

**Work:** Update the handoff with the sanitized Web/Telegram baseline, gate inventory, release/image provenance, dashboards, escalation owner, circuit-breaker/health checks, explicit non-actions, and rollback procedure. Change and test the authority boundary so only active supervisors/admins may confirm amounts, associate orders, reconcile/approve, or reject; sellers must be denied at the authoritative database/RPC boundary and in Server Actions/UI.

**Exit evidence:**

- Handoff contains no PII, secrets, payloads, storage URLs, or full identifiers.
- Tests prove active supervisor/admin success where otherwise valid; seller, inactive user, and unsupported role denial leaves proof/order/payment/linkage unchanged.
- Committed success audit captures actor and role-at-action-time without treating a mutable current profile as historical fact; denied exceptions leave no protected or success-audit mutation and are proven by negative tests plus sanitized operational telemetry.
- All protected gates remain closed after deployment/verification of the correction.

**Rollback:** Close the affected reconciliation gate, recreate Web only under approved operations, and roll back a code defect to the previously approved immutable image. Preserve audit evidence and do not restore seller authority as an emergency workaround.

### Phase B — Real Evolution WhatsApp E2E canary

**Outcome:** A real authenticated Evolution delivery demonstrates production WhatsApp proof intake through the canonical path.

**Entry conditions:** Phase A is accepted; the canonical and WhatsApp intake gates are separately authorized to open; worker, queue, database, provider authentication, observability, health checks, and circuit breaker are healthy; rollback image and gate-close procedure are ready.

**Canary:** Submit one approved non-sensitive proof through Evolution. Verify canonical admission/enqueue, expected acknowledgement, worker progression, deduplication behavior if a safe retry is performed, and no legacy `comprovantes` insert. Verify Cloud payment media remains non-admitting.

**Stop conditions:** Authentication anomalies, admission failure above the approved threshold, queue backlog growth, duplicate creation, legacy persistence, inline processing latency, unhealthy worker/circuit breaker, or Cloud admission attempt.

**Rollback:** Close the WhatsApp and/or canonical intake gate as needed, perform the approved Web recreation, and use immutable-image rollback for a code defect. Do not add a legacy fallback.

### Phase C — Independent Telegram intake gate verification

**Outcome:** Telegram can be controlled independently without bypassing canonical safety.

**Work:** Introduce or validate `TELEGRAM_PAYMENT_PROOF_INGEST_ENABLED` as a startup-captured declarative gate. Its effective admission predicate is:

```text
canonical intake open AND telegram intake open
```

Both gates must default `false`; malformed, missing, unreadable, cache-local, database, and runtime overrides remain closed. The diagnostic surface reports redacted effective state/reason only.

**Verification:** Automated tests must prove all four gate combinations, including that canonical open plus Telegram closed is non-admitting and that only both-open is eligible for normal admission. Process-start tests must prove an environment change is inert until Web recreation. The already completed Telegram production canary supplies the channel E2E baseline and must not be repeated for this gate change. Any future live Telegram exercise requires separate operational authorization outside this plan.

**Exit evidence:** The four-state gate matrix is recorded: both closed; canonical open/Telegram closed; canonical closed/Telegram open; both open. Only the final state may admit Telegram proofs.

**Rollback:** Close the Telegram gate and recreate Web; close canonical too if a shared intake risk is observed. Immutable image rollback remains available.

### Phase D — Lifecycle canaries: quarantine restore and expiry purge tombstone

**Outcome:** Exceptional lifecycle paths preserve evidence and prevent resurrection of duplicate bytes.

**Quarantine → restore canary:** An active supervisor/admin restores one explicitly authorized, quarantined non-sensitive test proof before expiry. Verify valid state transition, exactly one correction notice on the original channel, audit completeness, enqueue behavior, and seller denial of restore. A repeated request must be idempotent or safely rejected without a second correction notice.

**Expiry → purge → tombstone canary:** Use one explicitly authorized non-sensitive test proof that reaches expiry. Verify purge removes original bytes and derivatives as designed, retains hash/audit tombstone, records health/outcome, and rejects or generically handles a later exact-byte duplicate without leaking matching metadata.

**Stop conditions:** Loss of required audit/tombstone, duplicate resurrection, cross-customer disclosure, more than one correction notice, failed purge retries beyond approved bound, or storage/worker/circuit-breaker health degradation.

**Rollback:** Close cleanup/lifecycle capability as applicable and recreate Web; use immutable image rollback for code defects. Do not delete tombstones or rewrite migration history.

### Phase E — Privileged replay canary

**Outcome:** One selected eligible dead letter can be replayed explicitly and safely without making replay automatic.

**Entry conditions:** Privileged replay gate is explicitly authorized open after Web recreation; diagnostics identify one eligible non-sensitive test target; no active lock or terminal-state exclusion applies; named active supervisor/admin, idempotency key, audit correlation alias, and observation window are recorded.

**Canary:** Request one replay through the privileged path. Verify authorization, eligibility, a single work item/transition, idempotency on repeat, audit outcome, worker health, and lack of automatic replay for other targets. Sellers must be denied diagnostics and replay.

**Stop conditions:** Duplicate work, replay of a terminal/locked/ineligible target, replay without audit, cross-target effect, secret/error leakage, alert recursion, queue instability, or circuit-breaker trip.

**Rollback:** Close the privileged replay gate and recreate Web. Do not attempt compensating replay loops or delete the replay/audit evidence.

### Phase F — Human permanence decision and release handoff

**Outcome:** Operations and product explicitly choose the steady-state posture rather than silently converting a canary into permanent behavior.

The accountable decision-maker must select and record one outcome for each independently gated capability:

- keep closed;
- enable only for a named, time-bounded operational window; or
- enable as an ongoing production capability with named owner, health thresholds, on-call/escalation path, and next review date.

The permanent-processing/reconciliation decision specifically requires reviewed evidence for canonical admission, worker health, dead-letter age/count, reconciliation denials and outcomes, audit integrity, gate diagnostics, circuit-breaker behavior, and every canary above. A decision to keep processing or reconciliation closed is valid and requires no further justification.

Once implementation and pre-deployment verification are complete, deploy the immutable candidate to production for the bounded final test authorized by the owner, collect sanitized evidence, and return every temporary gate to the decided steady-state posture. Once that evidence and the permanence decision are accepted, pushing the branch and opening a PR are authorized. PR reviewers must see the decision record, redacted evidence index, test/status summary, scope boundaries, and rollback path. **Merge remains prohibited until a final explicit permission names the PR/commit and authorizes merge.**

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Historical seller authority is accidentally retained in one layer. | Treat supervisor/admin-only authority as a cross-layer contract; require DB/RPC denial tests plus Server Action and UI negative tests for sellers and inactive accounts. |
| A canary becomes permanent by omission. | Every phase has named entry/stop/rollback conditions; Phase F requires an explicit human choice for permanence. |
| Telegram independently bypasses canonical control. | Require logical AND of startup-captured canonical and Telegram gates; prove all four combinations. |
| Evolution E2E exposes latency, queue, or provider failure. | Canary one non-sensitive proof, monitor acknowledgement/admission/queue/worker health, use circuit breakers, and close gates quickly on stop conditions. |
| Restore, purge, or replay damages evidence or duplicates work. | Limit each to an authorized test target, privileged actor, idempotency/audit contract, and predeclared observation window; never automate recovery. |
| Configuration drift changes a live process unexpectedly. | Startup-only environment capture, allowlisted literals, redacted diagnostics, controlled Web recreation, and immutable images. |
| Handoff leaks customer or provider data. | Store only aggregate metrics, time windows, aliases, and release/gate references in proposal/PR documentation; retain operationally necessary restricted identifiers outside OpenSpec. |

## Rollback and operational safety

Rollback is capability-specific and must be exercised through approved operations:

1. Set the relevant declarative Compose/environment gate to closed.
2. Perform the approved controlled Web recreation so startup-captured state changes.
3. Confirm redacted diagnostics report closed and health/circuit-breaker signals stabilize.
4. If the defect is in code or image behavior, roll back to the approved immutable image rather than editing a running container.
5. Preserve canonical records, hashes/tombstones, audit events, and forward migration history; do not introduce legacy intake, delete evidence, or use destructive schema rollback.

All canaries are production-only-intake exercises: test inputs must use approved non-sensitive operational data, but production intake semantics, authentication, storage, queues, workers, and health signals are the evidence authority. Local fixtures do not substitute for a real provider E2E canary.

## Success criteria

1. The operations handoff contains the completed Web and Telegram canary baseline in a sanitized format and clearly distinguishes closed-gate verification from production authorization.
2. Only active supervisors/admins can confirm amounts, link eligible orders, reconcile/approve, or reject; `vendedor` is denied at database/RPC, action, and UI boundaries with no state mutation.
3. One real Evolution WhatsApp canary demonstrates canonical asynchronous admission, fast acknowledgement, queue progression, and no legacy proof write; Cloud payment media remains non-admitting.
4. Telegram has an independently controllable, startup-only gate subordinate to canonical intake, and the full two-gate truth table is evidenced.
5. The authorized quarantine→restore and expiry→purge→tombstone canaries preserve lifecycle, notification, audit, hash/tombstone, duplicate-safety, and privilege invariants.
6. The authorized privileged replay canary creates at most one eligible replay effect per idempotency key, preserves audit, and never broadens seller authority or triggers automatic replay.
7. All gates fail closed by default, are changed only through declarative configuration plus controlled Web recreation, and retain immutable-image rollback, health monitoring, and circuit-breaker protection.
8. A named human decision records whether processing and reconciliation are permanently enabled, time-bounded, or remain closed before any push/PR; merge occurs only after a distinct final explicit permission.

## Delivery strategy

Use a chained-PR delivery. Each cohesive authored slice targets at most approximately 400 changed lines, with tests and user/operator documentation kept with the behavior they verify. The preferred chain is: authority database contract → authority actions/UI → Telegram startup gate → operational handoff and sanitized evidence. Production canary evidence may follow as bounded documentation-only commits. Do not compress code, tests, or documentation to meet the budget; split at the causal boundary instead.

## Proposal question round

This delegated documentation task was completed without an interactive question round. Before operational execution, the product/operations owner should confirm these assumptions or request a second round:

1. Which named role or individual owns the final permanence decision for processing and reconciliation, and what business signal would justify keeping either closed?
2. What maximum customer-facing delay, queue backlog, dead-letter age, or reconciliation denial rate should stop a canary and trigger closure?
3. Are there regulated, high-value, or unusual customer/order cases that must be excluded from the canary population even when their data is non-sensitive?
4. Does the business require seller visibility of proof status while sellers are denied all confirmation, reconciliation, and rejection actions, or should their payment-proof view be restricted further?

## Proposal basis

This proposal uses the active `canonical-payment-proof-operations` change as the technical and verification baseline and the archived multichannel payment-proof admission specification for lifecycle and reconciliation invariants. It deliberately supersedes only the historical seller-reconciliation authority decision; no prior OpenSpec artifact is modified.
