# Canonical Payment Proof Operations

## Intent

Establish one auditable, asynchronous, and fail-closed payment-proof operation for Web, Evolution WhatsApp, and Telegram. The change first recovers the SQL test baseline, then removes non-canonical intake, authorizes active sellers to reconcile safely, strengthens dead-letter operations, and introduces durable deployment-controlled gates for a reversible rollout.

This proposal implements the confirmed operating model documented in [exploration.md](./exploration.md): Evolution API is the only authoritative production WhatsApp provider; WhatsApp Cloud is not a payment-proof intake route; every active `vendedor` may reconcile proofs for any customer; and exceptional recovery operations remain restricted to supervisors and administrators.

## Problem

Payment-proof handling currently has inconsistent admission paths and incomplete operational protections:

- Existing SQL evidence is not trustworthy because 11 pgTAP assertions fail and the security handoff suite is blocked before assertions run.
- Evolution can bypass the canonical ledger, deduplication, outbox, and lifecycle controls by inserting proof media into legacy `public.comprovantes`.
- Channel response paths may perform work that belongs in asynchronous processing, increasing webhook latency and making ingestion behavior inconsistent.
- The intended `vendedor concilia` business authority is not aligned across database policy, server actions, and Atendimento controls.
- Dead-letter alerting and recovery need durable visibility and explicit, restricted operational procedures.
- Production gates must not rely on cache-local overrides and must remain safely closed until a controlled deployment action recreates the relevant Web workload.

## Goals

1. Restore a fully green SQL baseline by diagnosing and correcting the actual causes of all known pgTAP failures and the blocked handoff test setup.
2. Make canonical admission plus queue enqueueing the only payment-proof intake mechanism for Web, Evolution WhatsApp, and Telegram.
3. Keep Evolution API authoritative for production WhatsApp proof intake and prevent WhatsApp Cloud from becoming a parallel proof route while retaining required webhook verification and general-chat behavior.
4. Allow every active `vendedor` to confirm an amount, associate eligible customer orders, reconcile/approve, and reject a proof, subject to immutable invariants, active-role checks, locking, and audit.
5. Provide observable, durable dead-letter operations with restricted inspection and controlled replay capabilities.
6. Make operational gates declarative through Compose/environment configuration, fail closed on absent or invalid configuration, and support a progressive, reversible rollout only after prerequisites are ready.

## Non-goals

- Replacing Evolution API with WhatsApp Cloud, or operating both as payment-proof providers.
- Changing required WhatsApp Cloud webhook handshakes or unrelated general-chat behavior.
- Restricting active sellers to assigned customers; seller reconciliation is intentionally customer-wide.
- Giving sellers restore, purge, dead-letter inspection/replay mutation, or other exceptional operational privileges.
- Automatically replaying production dead letters or opening production gates as part of code delivery.
- Introducing cache-local files as a production control plane, dynamic runtime gate overrides, or an alternative remote gate service.
- Broad redesign of payment extraction, OCR quality, order management, or unrelated Atendimento workflows.

## User and business impact

| Audience | Outcome |
| --- | --- |
| Customers | Proofs submitted through supported channels are admitted consistently and are less likely to be lost or delayed by webhook processing work. |
| Active sellers (`vendedor`) | Can resolve a customer’s eligible payment proof without assignment barriers, with clear lock and authorization feedback. |
| Supervisors and administrators | Retain authority over recovery and destructive operations, with auditable evidence and safer dead-letter handling. |
| Support and operations | Gain persistent signals for unresolved dead letters and a controlled path to inspect or explicitly authorize replay. |
| Engineering | Starts from a green SQL suite and a single canonical intake contract, reducing regression ambiguity and duplicate-provider risk. |

## Scope and affected areas

| Area | Proposed change |
| --- | --- |
| SQL baseline and test harness | Diagnose the six operational-metrics failures, four admin-alert failures, queue-budget failure, and policy reapplication handoff block identified in [exploration.md](./exploration.md). Correct production RPC logic only where diagnosis establishes a real defect; otherwise correct obsolete or non-idempotent test setup and expectations. |
| Canonical proof intake | Remove Evolution’s direct legacy `comprovantes` fallback. Require Web, Evolution, and Telegram to use `admit_and_enqueue_payment_proof`, acknowledge admission quickly, and defer rendering, OCR, and advisory extraction to the worker queue. |
| WhatsApp authority boundary | Preserve required Cloud GET/POST webhook handshake and general-chat contracts, but explicitly reject, disable, or otherwise make payment-media intake non-admitting. No Cloud path may create canonical payment proofs or a legacy proof record. |
| Reconciliation authorization | Align database/RPC permissions, server actions, and `PaymentProofAdminPanel` so every active seller can confirm amounts, link eligible orders, reconcile/approve, and reject. Enforce active-role checks, customer/order/amount invariants, state-transition checks, proof locks, and negative controls. |
| Audit | Record immutable actor identity, actor role at action time, action, timestamp, proof, customer, order linkage, and relevant transition outcome. Audit records must not derive historic actor role from a mutable current profile. |
| Observability and recovery | Add persistent unresolved-dead-letter visibility, alert-delivery failure recording, supervisor/admin-only read-only diagnostics, and an idempotent controlled replay mechanism. Replay invocation in production remains an explicitly authorized operations action. |
| Durable gates and rollout | Read gates solely from declarative Compose/environment configuration, default closed on missing/malformed configuration, and require controlled Web recreation for a configuration change to take effect. No cache-local override may supersede the deployment configuration. |

## Delivery sequence and rollback boundaries

The implementation is intentionally ordered by causal dependency. A later phase must not be enabled or operationalized before the prior phase’s success criteria are evidenced.

### Phase 1 — Recover a green SQL baseline

**Outcome.** Establish a completely green SQL suite and unblock the handoff suite without masking domain regressions.

**Work.** Diagnose the obsolete maintenance RPC signature, terminal-state/timestamp and error-sanitization assertions, alert lease/retry/dead-letter behavior, independent maintenance-budget claims, and duplicate-policy test setup. Preserve or correct domain behavior based on evidence; do not simply weaken assertions to obtain green output.

**Rollback boundary.** Revert only the isolated test-harness and RPC corrections if needed. Intake, seller permissions, gates, and production recovery operations remain unchanged.

**Exit evidence.** All previously failing pgTAP assertions pass; `security_handoff_receipts.sql` executes its TAP assertions rather than failing during migration inclusion; failures are documented as fixture/test obsolescence or production defects with their corrective rationale.

### Phase 2 — Canonical async intake and provider authority

**Outcome.** All supported intake channels follow fast canonical admission and asynchronous processing, with Evolution as the sole production WhatsApp proof authority.

**Work.** Eliminate the Evolution direct insert into legacy `public.comprovantes`; route Web, Evolution, and Telegram through canonical admission and queue enqueueing; ensure response handling does not synchronously render or extract proof content. Make Cloud payment media non-admitting while retaining required handshake and general-chat semantics.

**Rollback boundary.** Roll back the affected channel route/adapter changes as a single intake-authority unit. Database records already admitted stay canonical and require no schema rollback. A legacy bypass must not be reintroduced as an emergency rollback path; rollback returns only to the prior deployed route behavior under controlled operational decision-making.

**Exit evidence.** Route and integration tests prove each supported channel reaches canonical admission, deduplication/outbox contracts are exercised, Cloud payment media produces no proof admission, and webhook responses meet the fast-acknowledgement contract.

### Phase 3 — Seller reconciliation authority, Atendimento UX, locks, and audit

**Outcome.** Every active seller can perform the approved reconciliation workflow safely for every customer, while exceptional operations remain privileged.

**Work.** Authorize only active `vendedor` users for amount confirmation, eligible-order linking, reconciliation/approval, and rejection; retain supervisor/admin authority for restore, purge, dead-letter inspection/replay mutation, and exceptions. Add concurrency-safe lock acquisition/ownership/expiry behavior, explicit invalid-transition and lock-conflict feedback, and immutable actor/role audit fields. Enforce exact customer, order eligibility, and amount invariants in the authoritative database/RPC layer, with UI and server-action negative controls as defense in depth.

**Rollback boundary.** Revert seller-facing action/UI exposure and authorization changes together. Existing proof histories and immutable audit events remain preserved; privileged operators can continue operations under the previous authority boundary.

**Exit evidence.** Tests cover active vs inactive sellers, all-customer scope, unauthorized roles, invalid amount/order/customer combinations, lock contention and expiry, invalid transitions, and immutable audit role capture. Atendimento makes permitted and prohibited actions understandable before the user submits an operation.

### Phase 4 — Observability, persistent dead-letter alerts, and safe recovery

**Outcome.** Operations can identify unresolved failures and prepare a safe recovery action without broadening seller authority or silently mutating production queues.

**Work.** Add cumulative unresolved-dead-letter observability in addition to time-window signals; persist failures of alert delivery; provide supervisor/admin-only read-only inspection diagnostics; and define idempotent replay controls with audit and explicit eligibility checks. A replay must protect against duplicate processing, respect locks/terminal states, and record the initiating privileged actor.

**Rollback boundary.** Disable the additional alert policy and recovery interfaces independently from admission and reconciliation. Do not remove existing evidence or automatically alter dead-letter state during rollback.

**Exit evidence.** Tests demonstrate persistent alert conditions, alert-delivery failure recording, role restrictions, read-only inspection behavior, replay idempotency, prohibited replay states, and audit records. Production replay is not performed merely because this phase is deployed.

### Phase 5 — Durable gates and progressive reversible rollout

**Outcome.** Gates are deployment-controlled, fail closed, and activated only after the preceding operational baseline is ready.

**Work.** Define declarative Compose/environment gate names, defaults, validation, and startup interpretation. Remove or ignore cache-local override precedence. Require a controlled Web recreation to apply a gate change and expose the effective gate state through operational diagnostics. Stage the rollout from closed gates through SQL baseline, canonical enforcement, seller authority, and observability/replay readiness.

**Rollback boundary.** Set the relevant declarative gate closed and recreate the Web workload through the approved operational procedure. Missing, malformed, or unreadable configuration must evaluate closed. Gate opening is excluded from implementation automation and requires explicit later operational authorization.

**Exit evidence.** Configuration tests prove missing/invalid values fail closed, cache-local values cannot open a gate, controlled recreation is required to adopt changed environment values, and every rollout stage has a documented entry check, stop condition, and rollback instruction.

## Dependencies and constraints

- Phase 1’s green SQL baseline is a prerequisite to trusting downstream database/RPC verification.
- Phase 2 requires a reliable processing worker, outbox/queue contract, and canonical storage/deduplication availability before a channel acknowledges admission.
- Phase 3 depends on authoritative database enforcement; application UI or server-action role arrays alone are insufficient.
- Phase 4 depends on stable dead-letter and audit state models from the earlier phases.
- Phase 5 must be deployed with Compose/environment configuration under controlled operations; it must not depend on developer-machine caches or local override files.
- Production gate opening, production dead-letter replay, restore, purge, and any exceptional mutation require separate explicit operational authorization after implementation and verification evidence is reviewed.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Green tests are achieved by weakening assertions rather than repairing a regression. | Require root-cause classification for every known failure and retain invariant-focused assertions. |
| Removing legacy intake exposes queue-worker delay or failure. | Verify fast admission, durable enqueueing, worker recovery, and persistent dead-letter signaling before rollout. |
| Cloud webhook changes break verification or general chat. | Separate payment-media non-intake behavior from handshake/general-chat paths and cover both with route tests. |
| Seller authority creates conflicting concurrent actions. | Use authoritative proof locks, transition checks, lock conflict feedback, and immutable audit records. |
| Seller access is over-broadened into recovery/destructive actions. | Enforce explicit capability boundaries in database/RPCs, server actions, and UI controls; test negative paths. |
| A configuration error opens an unsafe path. | Parse allowlisted declarative values only and fail closed for absent, malformed, or unavailable configuration. |
| Replay duplicates work or damages evidence. | Make replay restricted, eligible-state-only, idempotent, audited, and manually authorized in production. |

## Migration and rollout posture

1. Keep all gates closed while Phase 1 establishes and records the green SQL baseline.
2. Deploy and verify canonical-path enforcement with the related intake gate still closed where applicable; do not redirect traffic solely on code deployment.
3. Verify seller authority, locks, role boundaries, and audit evidence before enabling seller reconciliation for production users.
4. Verify persistent dead-letter observability and privileged inspection/replay readiness before any recovery procedure is considered.
5. Obtain explicit operational authorization before opening each declarative gate. Apply the configuration through the approved Compose/environment change and controlled Web recreation.
6. Progress one reversible capability at a time, observing admission, queue latency, duplicate suppression, reconciliation outcomes, lock conflicts, unresolved dead letters, and alert delivery. Close the applicable gate and recreate Web on a stop condition.

No implementation task may automatically replay a production dead letter, restore/purge production proof data, or open a production gate. Those actions are operational decisions outside this proposal’s code-delivery scope.

## Success criteria and metrics

| Category | Measure |
| --- | --- |
| SQL baseline | Zero known failures across the affected pgTAP suite, including an executable `security_handoff_receipts.sql` handoff suite. |
| Canonical intake | 100% of accepted Web, Evolution, and Telegram payment proofs create canonical admission/queue evidence; 0 accepted Cloud payment-media proofs. |
| Fast acknowledgement | Supported channel handlers complete admission acknowledgement without synchronous PDF rendering, OCR, or advisory extraction in the request lifecycle. |
| Authorization | Active sellers can complete only the approved reconciliation actions for any customer; inactive sellers and non-authorized roles are denied; exceptional actions remain supervisor/admin-only. |
| Data integrity | No reconciliation can violate exact proof/customer/order/amount eligibility, valid state transitions, or lock ownership. |
| Auditability | Every privileged or seller reconciliation action contains immutable actor identity and role-at-action-time plus transition evidence. |
| Operations | Unresolved dead letters and alert-delivery failures persist as observable records; inspection and replay controls enforce role, eligibility, idempotency, and audit. |
| Gates | Missing, malformed, and cache-local configuration cannot open a gate; a deployment-controlled environment change plus Web recreation is required for a gate-state change. |

## Expected OpenSpec capability deltas

| Capability | Delta |
| --- | --- |
| Canonical payment-proof intake | **Modified.** Define one asynchronous admission contract for Web, Evolution, and Telegram; prohibit legacy direct persistence and Cloud proof intake. |
| WhatsApp provider authority | **Modified.** Declare Evolution as the sole production payment-proof WhatsApp authority while preserving Cloud verification/general-chat compatibility. |
| Payment-proof reconciliation | **Modified.** Add active seller authority for approved reconciliation actions across all customers, protected by lock, invariant, and audit requirements. |
| Payment-proof recovery operations | **Modified.** Formalize privileged-only diagnostics and controlled replay requirements; production execution remains separately authorized. |
| Payment-proof observability | **Modified.** Require persistent unresolved-dead-letter and alert-delivery-failure signals. |
| Operational gates | **Added/modified.** Define declarative Compose/environment gates that fail closed and become effective only through controlled workload recreation. |
| SQL verification baseline | **Modified.** Make green pgTAP coverage and idempotent handoff setup a delivery prerequisite for subsequent operational changes. |

## Delivery sizing

The exploration forecasts approximately **1,280 authored lines** across the five causal phases, exceeding the 400-line review budget. Chained slices are therefore likely, with each phase serving as the preferred independent work-unit and rollback boundary. The exact chain strategy remains deferred to the tasks phase and the review-workload gate under the `ask-on-risk` delivery strategy.

## Proposal basis

This proposal is based on the corrected exploration inventory, provider topology, test-failure analysis, causal units, and risk assessment in [exploration.md](./exploration.md). Confirmed product decisions from the handoff supersede exploration alternatives where they differ, specifically the selection of declarative Compose/environment configuration as the durable fail-closed gate authority and customer-wide seller reconciliation scope.
