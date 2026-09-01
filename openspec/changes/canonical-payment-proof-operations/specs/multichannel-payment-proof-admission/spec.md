# Delta for Multichannel Payment Proof Admission

## ADDED Requirements

### Requirement: Canonical asynchronous admission

Web, Evolution, and Telegram payment-proof handlers MUST atomically admit an eligible proof through the canonical admission-and-enqueue contract before acknowledging acceptance. They MUST NOT perform PDF rendering, OCR, or advisory extraction inline in the request lifecycle; those operations MUST run asynchronously after enqueueing.

#### Scenario: Accepted channel proof

- GIVEN an eligible payment proof from Web, Evolution, or Telegram
- WHEN the channel handler receives it
- THEN the handler MUST atomically create the canonical admission outcome, durably enqueue processing, return HTTP 202 Accepted, and perform no inline rendering or extraction.

#### Scenario: Enqueue failure

- GIVEN canonical admission cannot durably enqueue the proof for processing
- WHEN the handler processes the proof
- THEN it MUST return HTTP 503 Service Unavailable, MUST NOT acknowledge the proof as accepted, and MUST leave no admitted-but-unenqueued proof outcome.

### Requirement: Exact delivery idempotency and deduplication

The canonical intake contract MUST apply exact delivery idempotency and global exact-byte deduplication atomically across Web, Evolution, and Telegram. A retry or duplicate MUST NOT create another canonical proof, queue item, chat projection, or notification.

#### Scenario: Retried delivery

- GIVEN a channel retries an already handled delivery
- WHEN canonical intake is invoked again
- THEN it MUST return HTTP 200 OK as the idempotent acknowledged outcome and MUST NOT create duplicate canonical or downstream records.

### Requirement: Acknowledged intake semantics

A supported channel MUST return HTTP 202 Accepted only after atomic canonical admission and enqueueing succeed. A duplicate delivery MUST return HTTP 200 OK without representing a new accepted proof. Invalid or unauthorized intake MUST return a non-2xx response and MUST NOT enqueue work; unavailable enqueueing MUST return HTTP 503 Service Unavailable.

#### Scenario: Invalid proof

- GIVEN a proof fails canonical eligibility validation
- WHEN a supported channel submits it
- THEN the handler MUST return a non-2xx response and MUST NOT enqueue rendering, extraction, or reconciliation work.
