# payment-proof-reconciliation Specification
## Requirements
### Requirement: Human exact reconciliation
Authorized staff MUST confirm/correct cents and manually link one admitted proof to one or more pending orders of the same customer. Atomic approval MUST require exact sum equality and MUST be idempotent.
#### Scenario: Valid or invalid links
- GIVEN linked pending orders
- WHEN approval runs
- THEN exact same-customer totals commit atomically; mismatch or foreign orders change nothing.
### Requirement: Manual external payment
Authorized staff MAY approve in-person/external payment without proof only with reason/provenance and idempotency; the system MUST NOT fabricate evidence.
#### Scenario: Human-confirmed payment
- GIVEN valid actor, reason, and key
- WHEN approved
- THEN audit records `manual_external` without a proof row.
### Requirement: Duplicate backfill
Migration MUST hash existing PDFs, retain one deterministic canonical exact duplicate, quarantine the other, preserve both provenances, and expose one PNG. Unreadable/non-identical files MUST remain unresolved.
#### Scenario: Existing pair
- GIVEN the two files hash identically
- WHEN backfilled
- THEN one is visible and neither provenance trail is lost.
