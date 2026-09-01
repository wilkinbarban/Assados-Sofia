# Payment Proof Observability Specification

## Purpose

Provide durable, least-privilege visibility and controlled recovery for unresolved payment-proof dead letters.

## Requirements

### Requirement: Persistent unresolved dead-letter signals

The system MUST persist and expose the cumulative count of unresolved payment-proof dead letters and the age of the oldest unresolved dead letter. It MUST persist each alert-delivery failure as an observable failure record independent of whether an alert is eventually delivered.

#### Scenario: Unresolved failures persist

- GIVEN payment-proof dead letters remain unresolved and alert delivery fails
- WHEN operational diagnostics are evaluated
- THEN diagnostics MUST expose the cumulative unresolved count, oldest unresolved age, and persisted alert-delivery failure record.

### Requirement: Privileged read-only diagnostics

Dead-letter diagnostic inspection MUST be read-only and available only to active supervisors and administrators. A seller or other unauthorized actor MUST NOT inspect dead-letter details or mutate recovery state through an inspection operation.

#### Scenario: Unauthorized inspection

- GIVEN an active `vendedor` requests dead-letter diagnostics
- WHEN authorization is evaluated
- THEN access MUST be denied and no recovery state MUST change.

### Requirement: Explicit idempotent eligible-state replay

Replay MUST require an explicit invocation by an authorized privileged actor, MUST be limited to explicitly eligible states, MUST be idempotent, and MUST append audit evidence of the actor, eligibility decision, request, and outcome. Replay MUST reject terminal, locked, or otherwise ineligible items without changing their state.

#### Scenario: Eligible replay retry

- GIVEN an authorized supervisor or administrator explicitly requests replay for an eligible dead-letter item
- WHEN the same replay request is repeated
- THEN at most one eligible replay transition or work item MUST result and each request outcome MUST be auditable.

#### Scenario: Ineligible replay

- GIVEN a dead-letter item is terminal, locked, or otherwise ineligible
- WHEN an authorized actor requests replay
- THEN replay MUST be rejected and the item's existing state MUST remain unchanged.

### Requirement: No automatic production replay

The system MUST NOT automatically replay a production payment-proof dead letter because of deployment, alerting, retry scheduling, or code delivery. Production replay MUST remain a separately authorized operational action.

#### Scenario: Deployment with unresolved dead letters

- GIVEN production deployment completes while unresolved dead letters exist
- WHEN the deployment and normal alerting run
- THEN no dead letter MUST be replayed unless an authorized actor explicitly invokes replay.
