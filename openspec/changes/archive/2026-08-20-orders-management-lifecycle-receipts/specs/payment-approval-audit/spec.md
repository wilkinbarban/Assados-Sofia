# Delta for payment-approval-audit

## ADDED Requirements

### Requirement: Independent auditable approval
Payment status MUST remain independent from order status. Mercado Pago and authorized manual approvals MUST pass one atomic authority that records append-only source (`mercado_pago` or `manual`), actor, external reference/reason, timestamp, previous status, and new status. Repeated webhook deliveries or approval requests MUST be idempotent.

#### Scenario: Integration approval
- GIVEN a valid Mercado Pago approval for an existing order
- WHEN the webhook is processed
- THEN payment becomes `aprovado`, audit evidence is appended, order status is unchanged, and calendar failure cannot roll back payment.

#### Scenario: Manual approval authorization
- GIVEN an authorized operator and pending payment
- WHEN manual approval includes a reason
- THEN approval and immutable audit evidence commit atomically; unauthorized or reasonless requests fail.

#### Scenario: Duplicate notification
- GIVEN an already-recorded external reference
- WHEN the same webhook arrives again
- THEN no duplicate audit row or conflicting state is created.

## MODIFIED Requirements

### Requirement: Approved payment synchronization
The system MUST update `status_pagamento` to `aprovado` for an approved Mercado Pago payment, MUST NOT update order `status` as a side effect, and MAY synchronize calendar metadata independently.
(Previously: approved payment also set order status to `confirmado`.)

#### Scenario: Approved webhook
- GIVEN payment status `approved`
- WHEN webhook processing completes
- THEN payment is approved with provenance and order status remains unchanged.
