# Delta for payment-proof-reconciliation

## MODIFIED Requirements

### Requirement: Human exact reconciliation

Only an active `supervisor` or `admin` MUST be authorized to confirm or correct proof cents, link eligible pending orders of the same customer, reconcile or approve a proof, or reject a proof. The authoritative database/RPC boundary MUST enforce this authorization independently of client state, Server Actions, and UI. An active, inactive, or stale-session `vendedor`, and every other unauthorized actor, MUST be denied without changing proof, order, payment, linkage, or audit success state. For an authorized actor, atomic approval MUST require exact sum equality and MUST be idempotent; committed success audit evidence MUST retain immutable actor identity and role at action time. A denied exception MUST leave no protected or success-audit mutation. Durable denied-attempt telemetry, if required, MUST use a separately designed boundary because writes in the rejected RPC transaction roll back with the exception.
(Previously: authorized staff could confirm/correct cents and link same-customer pending orders, with exact atomic idempotent approval.)

#### Scenario: Privileged valid reconciliation

- GIVEN an active supervisor or administrator, an admitted proof, and eligible linked pending orders of the same customer whose sum equals the confirmed cents
- WHEN the actor confirms the amount and approves reconciliation
- THEN the authoritative database/RPC boundary MUST atomically commit the allowed reconciliation and append actor identity and role-at-action-time audit evidence.

#### Scenario: Seller direct or stale submission

- GIVEN an active, inactive, or stale-session `vendedor` submits confirmation, linking, reconciliation, approval, or rejection directly or through a Server Action
- WHEN authorization is evaluated
- THEN the authoritative database/RPC boundary MUST deny the request, no protected state or success audit MUST change, and the action and UI surfaces MUST provide safe negative authorization feedback without raw database errors.

#### Scenario: Invalid privileged links

- GIVEN an active supervisor or administrator attempts reconciliation with foreign, ineligible, or amount-mismatched orders
- WHEN approval runs
- THEN reconciliation MUST fail idempotently with no partial proof, order, payment, or linkage change.
