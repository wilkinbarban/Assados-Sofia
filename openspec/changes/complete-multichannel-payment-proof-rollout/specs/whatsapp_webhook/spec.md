# Delta for whatsapp_webhook

## MODIFIED Requirements

### Requirement: Shared PDF admission

Evolution WhatsApp PDF documents MUST use shared canonical asynchronous admission with authoritative authenticated provider, delivery, sender, and destination identities, provider-delivery idempotency, and exact-byte SHA-256 deduplication. Evolution MUST be the only production WhatsApp authority that may admit payment-proof media. WhatsApp Cloud payment media MUST remain non-admitting while its required verification handshake and non-payment general-chat behavior remain available. An Evolution payment-proof delivery MUST NOT create a legacy `comprovantes` write or perform inline rendering, OCR, or extraction.
(Previously: WhatsApp/Evolution PDF documents used shared admission with delivery idempotency, Telegram implemented the same adapter contract, and ambiguous senders remained invisible.)

#### Scenario: Real Evolution PDF E2E

- GIVEN an explicitly authorized operational canary, open canonical and WhatsApp intake gates adopted at Web startup, and an authenticated Evolution delivery of an approved non-sensitive PDF
- WHEN the delivery reaches the payment-proof handler
- THEN it MUST admit through the canonical asynchronous path, retain authoritative delivery and destination provenance, enqueue work, acknowledge without inline extraction, and create no legacy `comprovantes` record.

#### Scenario: Cloud payment-media boundary

- GIVEN an authenticated WhatsApp Cloud payment-media delivery
- WHEN the Cloud webhook processes it
- THEN it MUST return the compatible acknowledgement without canonical admission, payment-proof queue work, or legacy proof persistence.

#### Scenario: Evolution retry

- GIVEN an Evolution delivery identity that has already completed canonical admission
- WHEN Evolution retries the delivery
- THEN the handler MUST create no additional proof, queue work, chat projection, or notification.
