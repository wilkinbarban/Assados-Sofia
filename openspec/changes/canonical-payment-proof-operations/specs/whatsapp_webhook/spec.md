# Delta for whatsapp_webhook

## ADDED Requirements

### Requirement: Evolution-exclusive WhatsApp proof authority

Evolution MUST be the sole production WhatsApp provider authorized to admit payment proofs. An Evolution payment-proof handler MUST use canonical asynchronous admission and MUST NOT write payment-proof media or an admission substitute directly to legacy `comprovantes`.

#### Scenario: Evolution payment media

- GIVEN Evolution receives eligible WhatsApp payment media
- WHEN the media is processed as a payment proof
- THEN it MUST follow canonical admission and enqueueing and MUST NOT create a legacy `comprovantes` record.

### Requirement: Cloud payment-media non-admission

WhatsApp Cloud payment media MUST NOT admit a canonical payment proof, enqueue payment-proof work, or create a legacy proof record. The Cloud endpoint MUST return HTTP 200 OK for an authenticated payment-media delivery while explicitly treating it as non-admitting.

#### Scenario: Cloud payment media

- GIVEN the WhatsApp Cloud webhook receives payment media
- WHEN the webhook processes the event
- THEN it MUST return HTTP 200 OK, and no payment-proof admission, payment-proof queue item, or legacy proof record MUST be created.

### Requirement: Cloud compatibility boundary

Disabling Cloud payment-proof intake MUST NOT alter the required Cloud GET verification handshake or non-payment general-chat processing. Invalid Cloud webhook authentication MUST continue to be rejected before either payment-media or general-chat handling.

#### Scenario: Cloud verification handshake

- GIVEN a valid Cloud verification request
- WHEN the GET webhook endpoint receives the configured challenge
- THEN it MUST preserve the required successful handshake response.

#### Scenario: Cloud general chat

- GIVEN an authenticated Cloud non-payment general-chat event
- WHEN the POST webhook endpoint receives it
- THEN general-chat handling MUST remain available and MUST NOT create a payment-proof admission.
