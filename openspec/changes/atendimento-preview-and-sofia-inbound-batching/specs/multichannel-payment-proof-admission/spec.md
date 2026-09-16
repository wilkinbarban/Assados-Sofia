# Delta for multichannel-payment-proof-admission

## ADDED Requirements

### Requirement: Telegram payment-proof intake remains immediate before Sofia batching

Telegram inbound processing MUST preserve delivery deduplication, canonical payment-proof intake, and inbound-message persistence before it enqueues eligible Sofia batch work. A duplicate Telegram delivery MUST NOT create an additional inbound message, canonical payment-proof intake, or Sofia batch membership. Sofia batching MUST NOT delay, replace, replay, or alter canonical payment-proof admission.

#### Scenario: Telegram proof is admitted without batch-delay dependency

- GIVEN a non-duplicate Telegram inbound delivery contains a payment-proof attachment
- WHEN the delivery is accepted
- THEN the system MUST perform canonical payment-proof intake and persist the inbound delivery without waiting for a Sofia batch to run
- AND any eligible Sofia work MUST be enqueued separately under the durable batch contract

#### Scenario: Telegram delivery retry does not duplicate intake or batch work

- GIVEN a Telegram delivery identifier was already accepted
- WHEN Telegram retries the same delivery
- THEN the system MUST NOT create a duplicate canonical proof, inbound message, or Sofia batch membership
- AND the system MUST NOT emit an additional Sofia response because of the retry
