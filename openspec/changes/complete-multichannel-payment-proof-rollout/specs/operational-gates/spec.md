# operational-gates Specification

## Purpose

Ensure payment-proof rollout capabilities remain declarative, startup-adopted, fail closed, independently controllable where authorized, and subject to explicit human operational decisions.

## Requirements

### Requirement: Fail-closed startup gate authority

Payment-proof intake, reconciliation, restore, cleanup, and replay gates MUST derive only from allowlisted declarative deployment configuration captured at Web workload startup. Missing, unreadable, malformed, cache-local, database, or runtime override values MUST evaluate as closed. A changed declarative value MUST NOT affect an already-running Web workload and SHALL become effective only after an approved Web workload recreation. Diagnostics MUST disclose only sanitized effective state and reason.

#### Scenario: Invalid or live configuration change

- GIVEN a gate is closed or its configuration is missing, malformed, cache-local, database-backed, or supplied as a runtime override
- WHEN an existing Web workload evaluates the gate or its live environment changes
- THEN the capability MUST remain closed and diagnostics MUST reveal neither secrets nor raw configuration.

### Requirement: Subordinate independent Telegram admission

Telegram payment-proof admission MUST require both the canonical payment-proof intake gate and `TELEGRAM_PAYMENT_PROOF_INGEST_ENABLED` to be open as adopted at Web workload startup. Each gate MUST default closed, and opening the Telegram gate MUST NOT bypass a closed canonical gate.

#### Scenario: Telegram two-gate matrix

- GIVEN the Web workload has been recreated after the configured canonical and Telegram gate values are adopted
- WHEN Telegram PDF admission is attempted for each combination of canonical and Telegram gates
- THEN admission MUST be denied when either gate is closed and MUST be eligible only when both gates are open.

### Requirement: Privileged lifecycle and replay operations

Restore MUST require the separately authorized restore gate, an active administrator, and an explicit request at the Web action boundary. The startup gate does not enforce authenticated direct SQL/RPC calls; the database retains its independent admin-only contract. Purge and replay MUST require their separately authorized applicable gates, an active supervisor or administrator, and an explicit request. Replay MUST additionally require an eligible non-terminal unlocked target, an idempotency key, and audit of actor, role at action time, eligibility decision, request, and outcome. No deployment, alert, retry schedule, or code delivery MUST automatically replay a target.

#### Scenario: Ineligible or repeated replay

- GIVEN a seller, an ineligible/locked/terminal target, a closed replay gate, or a repeated request using the same idempotency key
- WHEN replay is requested
- THEN unauthorized or ineligible requests MUST be denied without state change, and repetition MUST create at most one eligible replay transition or work item with auditable outcomes.

### Requirement: Canary evidence and permanence decision

Every payment-proof canary MUST be explicitly authorized before its relevant gates open and MUST use approved non-sensitive data. Evidence recorded in OpenSpec or PR material MUST be sanitized to time window, aggregate outcome, gate state, release/image reference, health result, and redacted correlation aliases; it MUST NOT contain customer content, phone numbers, tokens, payloads, storage URLs, or full proof, order, message, provider, or delivery identifiers. Permanent processing or reconciliation MUST remain closed or time-bounded until a named accountable human records a decision based on reviewed canary evidence.

#### Scenario: Canary does not become permanent implicitly

- GIVEN a completed Evolution, Telegram, lifecycle, or replay canary
- WHEN no named human permanence decision has been recorded
- THEN the relevant capability MUST remain closed or expire at its approved time boundary and MUST NOT become permanently enabled by canary completion.

### Requirement: Release authorization boundary

After required evidence is accepted and the human permanence decision is recorded, the branch MAY be pushed and a pull request MAY be opened. The system and release process MUST NOT merge that pull request until a distinct final explicit authorization identifies the pull request or commit and authorizes merge.

#### Scenario: PR without final merge authority

- GIVEN accepted rollout evidence and an opened pull request
- WHEN no distinct final merge authorization identifies that pull request or commit
- THEN push and review MAY proceed but merge MUST remain prohibited.
