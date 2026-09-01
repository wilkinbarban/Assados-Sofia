# Delta for payment-approval-audit
## ADDED Requirements
### Requirement: Evidence-aware approval
Payment audit MUST distinguish `digital_proof` from `manual_external`, preserve Mercado Pago authority, reject direct/incomplete writes, and record actor, provenance, linked orders, confirmed cents, and outcome without sensitive logs.
#### Scenario: Digital proof
- GIVEN exact same-customer reconciliation
- WHEN authorized approval runs
- THEN payment events and evidence commit atomically.
#### Scenario: Incomplete evidence
- GIVEN neither valid proof reconciliation nor manual reason
- WHEN approval is attempted
- THEN payment remains unchanged.
