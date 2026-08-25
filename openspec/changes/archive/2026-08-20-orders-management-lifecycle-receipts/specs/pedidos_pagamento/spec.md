# Delta for pedidos_pagamento

## MODIFIED Requirements

### Requirement: Payment webhook approval decoupling
For an approved Mercado Pago notification, the webhook MUST acknowledge promptly, obtain authoritative payment details, and update only payment status through the audited payment authority; it MUST NOT confirm the order. Rejected or cancelled payments MUST update payment status only. Customer RLS and service-role webhook isolation remain mandatory.
(Previously: approved notifications set both `status_pagamento = aprovado` and `status = confirmado`.)

#### Scenario: Approved notification
- GIVEN a pending payment and any independent order status
- WHEN the webhook receives an approved notification
- THEN it returns HTTP 200 promptly, records audited approval, leaves order status unchanged, and handles calendar synchronization as a non-blocking side effect.

#### Scenario: Rejected notification
- GIVEN a pending payment
- WHEN the webhook receives `rejected` or `cancelled`
- THEN payment becomes `rejeitado` and order status is unchanged.
