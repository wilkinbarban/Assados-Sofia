# Specifications: Multichannel Customer Payment Proofs

## Admission
### Requirement: Gated PDF identity
The system MUST accept only valid, bounded PDF bytes from Web, WhatsApp/Evolution, or Telegram and record delivery provenance. Ambiguous external senders MUST remain hidden pending authorized identity resolution.
#### Scenario: Unknown or invalid intake
- GIVEN an unknown sender or invalid/non-PDF bytes
- WHEN intake runs
- THEN unknown valid bytes await identity invisibly; invalid bytes fail without LLM or chat publication.

### Requirement: Advisory extraction
The LLM MAY suggest classification and value but MUST NOT decide identity, admission, links, confirmed value, or payment. Low-confidence/failure MUST route to human review.
#### Scenario: Low confidence
- GIVEN extraction is uncertain
- WHEN processing completes
- THEN an unconfirmed suggestion is shown only to staff and payment is unchanged.

### Requirement: Global dedupe
Exact-byte SHA-256 MUST be claimed atomically across all customers, channels, states, and races. Tombstones MUST retain hashes after purge; duplicate notices MUST be idempotent and reveal no matching metadata.
#### Scenario: Race or purged replay
- GIVEN concurrent identical files or bytes matching a tombstone
- WHEN claimed
- THEN at most one canonical proof exists and duplicates are rejected generically with audit.

### Requirement: Quarantine and failures
Rejected proofs MUST have a 10-day quarantine/countdown. Admin restoration MUST audit and queue one correction notice on the original channel. Expiry MUST purge bytes/derivatives but retain hash/audit. Failed workers, notices, or purges MUST retry with bounded backoff.
#### Scenario: Restore or expiry
- GIVEN a quarantined proof
- WHEN restored before expiry or claimed at zero
- THEN it returns to review with one correction notice, or bytes are purged with tombstone retained.

### Requirement: Least-privilege media
Chats MUST show one faithful PNG only after admission. Original PDFs MUST be available only to active admins/supervisors in management. RLS MUST deny cross-customer reads and direct lifecycle/payment writes; transitions MUST append safe actor/source/outcome audit.
#### Scenario: Projection and authorization
- GIVEN an admitted proof
- WHEN chats or a non-admin request it
- THEN chats expose PNG without download and original PDF access is denied.

## Reconciliation
### Requirement: Human exact reconciliation
Authorized staff MUST confirm/correct cents and manually link one admitted proof to one or more pending orders of the same customer. Atomic approval MUST require exact sum equality and MUST be idempotent.
#### Scenario: Valid or invalid links
- GIVEN linked pending orders
- WHEN approval runs
- THEN exact same-customer totals commit links/proof/payments atomically; mismatch or foreign orders change nothing.

### Requirement: Manual external payment
Authorized staff MAY approve in-person/external payment without proof only with reason/provenance and idempotency; the system MUST NOT fabricate evidence.
#### Scenario: Human-confirmed payment
- GIVEN valid actor, reason, and key
- WHEN approved
- THEN payment audit records `manual_external` without a proof row.

### Requirement: Duplicate backfill
Migration MUST hash existing PDFs, keep one deterministic canonical exact duplicate, quarantine the other, preserve both provenances, and expose one PNG. Unreadable/non-identical files MUST remain unresolved.
#### Scenario: Existing pair
- GIVEN the two files hash identically
- WHEN backfilled
- THEN one is visible and neither provenance trail is lost.

## Modified Capabilities
### Requirement: Canonical channel and UX behavior
`client-payment-receipts` MUST replace direct publication with admission. `operator-receipts-management` MUST add identity, countdown, restore, review, links, confirmation, provenance, and admin-only PDF. `client-unified-chat` and `bandeja_operador` MUST hide non-admitted proofs and show admitted PNG once. `whatsapp_webhook` and Telegram adapters MUST be delivery-idempotent. `payment-approval-audit` MUST distinguish `digital_proof` and `manual_external` while preserving Mercado Pago authority.
#### Scenario: Retry and incomplete evidence
- GIVEN a provider retry or approval lacking valid digital/manual evidence
- WHEN processed
- THEN no duplicate projection is created and payment remains unchanged.
