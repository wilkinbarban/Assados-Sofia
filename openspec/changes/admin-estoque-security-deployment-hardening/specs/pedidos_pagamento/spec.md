# Delta for pedidos_pagamento

## ADDED Requirements

### Requirement: Atomic and Idempotent Order Stock Lifecycle

Order confirmation and cancellation SHALL use separately authorized transactional operations that atomically transition eligible order state, update every controlled product, and append corresponding stock movements linked to the order. Repeated or concurrent delivery of the same transition SHALL be idempotent. Confirmation SHALL reject insufficient stock without partial effects; cancellation SHALL restore stock exactly once and only for a previously stock-applied confirmation.

#### Scenario: Confirmation commits all effects
- GIVEN an eligible unconfirmed order with sufficient controlled stock
- WHEN confirmation executes
- THEN order status, all stock deductions, active-state consequences, and `saida` movements SHALL commit atomically

#### Scenario: Insufficient stock rejects the order
- GIVEN any controlled item lacks required quantity
- WHEN confirmation executes
- THEN no order status, product, or movement change SHALL persist
- AND the failure SHALL identify insufficient stock without leaking unrelated data

#### Scenario: Duplicate or concurrent confirmation
- GIVEN two confirmation attempts for the same order
- WHEN they execute concurrently or one is retried
- THEN stock SHALL be deducted at most once
- AND only one logical set of order-linked output movements SHALL exist

#### Scenario: Cancellation restores once
- GIVEN an order whose confirmation previously applied stock
- WHEN cancellation executes or is retried
- THEN stock SHALL be restored exactly once with linked `cancelamento` movements
- AND duplicate delivery SHALL produce no additional stock effect

#### Scenario: Any movement failure rolls back
- GIVEN one product or movement write fails during confirmation or cancellation
- WHEN the transaction terminates
- THEN the order, every product, and all movements SHALL remain at their prior consistent state

### Requirement: Order Stock Operation Authorization and Auditability

Order stock operations SHALL accept only trusted order-transition callers, SHALL NOT expose a generic stock mutation capability to clients, and SHALL derive actor or trusted system origin rather than accepting caller-supplied identity. Outcomes SHALL be observable by correlation identifier without secrets or customer PII.

#### Scenario: Direct client invocation is denied
- GIVEN an anonymous or ordinary client Data API session
- WHEN it invokes an order stock operation or writes order stock effects directly
- THEN grants and authorization SHALL deny the request with no mutation

#### Scenario: Trusted retry is traceable
- GIVEN a trusted transition is retried after an ambiguous response
- WHEN the operation resolves its idempotency state
- THEN it SHALL return the existing outcome and correlation evidence without duplicating effects
