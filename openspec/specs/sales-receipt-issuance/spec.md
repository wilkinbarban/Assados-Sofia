# Delta for sales-receipt-issuance

## ADDED Requirements

### Requirement: Eligibility, revenue, and management UX
Receipt issuance and realized revenue MUST require exactly `status = entregue AND status_pagamento = aprovado`. Management views MUST show both states separately, expose only valid next actions, provide keyboard/focus/label accessibility, and explain rejected actions with a valid continuation. RLS MUST limit customer data to the owner and operator access to authorized staff; logs and responses MUST avoid unnecessary personal data.

#### Scenario: Ineligible order
- GIVEN `entregue` + `pendente`
- WHEN an operator requests revenue or receipt
- THEN no amount is counted and issuance is denied with payment continuation guidance.

### Requirement: Immutable idempotent snapshot and two-copy output
An eligible order MUST atomically create one immutable, idempotent snapshot containing order, customer, line items, totals, charged amount, delivery, payment, establishment, and issuance metadata. Reprints MUST use that snapshot and render exactly two labelled copies (`VIA CLIENTE`, `VIA ESTABELECIMENTO`); inbound `comprovantes` MUST NOT be reused.

#### Scenario: Reprint
- GIVEN an existing snapshot
- WHEN a reprint is requested
- THEN identical data and charged amount are returned without mutation or duplicate issuance.

### Requirement: Print and PDF adapters
Browser print MUST support deterministic 58 mm and 80 mm layouts; server-side PDF fallback MUST render the same snapshot deterministically. ESC/POS, queues, hardware transport, and cut commands are out of scope.

#### Scenario: PDF fallback
- GIVEN browser printing is unavailable
- WHEN PDF is requested
- THEN a deterministic PDF with both copies is returned from the immutable snapshot.
