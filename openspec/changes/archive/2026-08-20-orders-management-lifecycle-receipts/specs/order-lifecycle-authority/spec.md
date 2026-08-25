# Delta for order-lifecycle-authority

## ADDED Requirements

### Requirement: Atomic independent lifecycle transitions
The system MUST expose one database-authoritative transition matrix for `novo`, `confirmado`, `entregue`, and `cancelado`; order transitions MUST NOT mutate payment status. Confirmation and cancellation (including `novo`) and delivery MUST be atomic, stock-safe, authorized, and idempotent.

#### Scenario: Invalid transition rejected
- GIVEN an order in `entregue`
- WHEN an operator requests `confirmado`
- THEN the transaction fails without changing order or payment state and returns valid next actions.

#### Scenario: New order cancellation
- GIVEN an order in `novo` with unapplied stock
- WHEN an authorized operator cancels it
- THEN the order becomes `cancelado` atomically without requiring stock rollback.

#### Scenario: Concurrent delivery and cancellation
- GIVEN concurrent requests for the same order
- WHEN both attempt terminal transitions
- THEN exactly one valid transition commits; the other is rejected or idempotently acknowledged.

### Requirement: Legacy classification and rollback
Existing rows with invalid combinations MUST be classified and reported before any explicit backfill; no history or provenance may be silently rewritten. New actions/renderers MUST be disableable while legacy readers remain available, and additive schema rollback MUST preserve exported audits/snapshots.

#### Scenario: Legacy row
- GIVEN a persisted `entregue` + `pendente` row
- WHEN migration classification runs
- THEN it is flagged for review, not rewritten.
