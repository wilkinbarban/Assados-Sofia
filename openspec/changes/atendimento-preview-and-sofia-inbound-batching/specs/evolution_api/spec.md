# Delta for evolution_api

## ADDED Requirements

### Requirement: Immediate idempotent Evolution intake before Sofia batching

The WhatsApp/Evolution webhook MUST preserve channel-specific delivery deduplication, canonical payment-proof intake, and inbound-message persistence before it enqueues eligible Sofia batch work. A duplicate Evolution delivery MUST NOT create an additional inbound message, canonical payment-proof intake, or Sofia batch membership. Eligible non-duplicate inbound work MUST be durably enqueued for the shared per-conversation batching contract instead of producing a separate immediate Sofia response per delivery.

#### Scenario: Evolution payment-proof delivery is admitted before batching

- GIVEN a non-duplicate WhatsApp/Evolution inbound delivery contains a payment-proof attachment
- WHEN the webhook accepts the delivery
- THEN the system MUST perform canonical payment-proof intake and persist the inbound delivery before Sofia batch processing occurs
- AND any eligible Sofia work MUST be enqueued durably after that immediate intake

#### Scenario: Evolution delivery retry is deduplicated

- GIVEN a WhatsApp/Evolution inbound delivery identifier was already accepted
- WHEN Evolution retries that same delivery
- THEN the system MUST NOT persist a duplicate inbound message or payment-proof intake
- AND the system MUST NOT add duplicate Sofia batch work or trigger a separate Sofia response
