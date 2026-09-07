# Delta for Multichannel Customer Payment Proofs

## MODIFIED Requirements

### Requirement: Gated PDF identity

The system MUST accept only valid, bounded PDF bytes from Web, authenticated Evolution WhatsApp, or Telegram through canonical asynchronous admission. Each admitted delivery MUST retain authoritative provider identity, delivery identity, sender/destination identity, channel provenance, and a SHA-256 digest of the received bytes. Ambiguous external senders MUST remain hidden pending authorized identity resolution; intake MUST fail closed when an authoritative identity, destination, authentication, or required admission condition cannot be established.
(Previously: valid bounded PDF bytes from Web, WhatsApp/Evolution, or Telegram were accepted with delivery provenance, while ambiguous senders remained hidden.)

#### Scenario: Authenticated identifiable PDF admission

- GIVEN an authenticated Evolution or Telegram delivery containing valid bounded PDF bytes and authoritative provider, delivery, sender, and destination identities
- WHEN canonical admission succeeds
- THEN the system MUST persist the required provenance and SHA-256 digest and enqueue the proof without inline rendering, OCR, or extraction.

#### Scenario: Unknown or invalid intake

- GIVEN an unknown sender, invalid/non-PDF bytes, unauthenticated delivery, or missing authoritative identity or destination
- WHEN intake runs
- THEN unknown otherwise-valid bytes MUST await identity invisibly, invalid or unverifiable intake MUST fail closed, and neither case MUST invoke LLM processing or publish to chat.

### Requirement: Global dedupe

Exact-byte SHA-256 MUST be claimed atomically across all customers, channels, states, and races using the authoritative received bytes. Provider delivery identity MUST independently deduplicate retransmission of the same provider delivery. Tombstones MUST retain hashes after purge; duplicate notices MUST be idempotent, MUST reveal no matching metadata, and MUST reject the same bytes identically whether the matching canonical proof is live, quarantined, or tombstoned.
(Previously: exact-byte SHA-256 was atomically claimed across customers, channels, states, and races, and tombstone duplicates were rejected generically.)

#### Scenario: Race, provider retry, or purged resend

- GIVEN concurrent identical PDFs, a retried provider delivery, or bytes matching a tombstone
- WHEN the deliveries are claimed
- THEN at most one canonical proof or eligible work effect MUST exist, all duplicate outcomes MUST be safely audited, and duplicate responses MUST be generic and indistinguishable across live and tombstoned matches.

### Requirement: Quarantine and failures

Rejected proofs MUST have a 10-day quarantine/countdown. Only an active administrator MAY restore a non-expired quarantined proof through the Web action boundary when the separate restore startup gate is open; the gate does not enforce direct authenticated SQL/RPC calls, and the database retains its independent admin-only contract. A successful restore MUST audit the actor and role at action time, transition through an authoritative leased and fenced lifecycle operation, and queue exactly one correction notice to the original authoritative channel destination. Repeated or concurrent restore requests MUST be idempotent or safely rejected without a second notice. Expiry MUST transition through authoritative leased and fenced lifecycle processing to purge original bytes and derivatives while retaining the SHA-256 hash and audit tombstone. Failed workers, notices, or purges MUST retry with bounded backoff without permitting duplicate notification, byte resurrection, or an unfenced concurrent lifecycle effect.
(Previously: admin restoration audited and queued one correction notice, expiry purged bytes while retaining hash/audit, and workers retried with bounded backoff.)

#### Scenario: Authorized restore exactly once

- GIVEN a non-expired quarantined proof, an active administrator, the open restore startup gate, and the original channel destination
- WHEN the actor restores the proof and repeats or races the same request
- THEN only one authoritative restore transition and one correction notice MUST result, audit MUST record each outcome, and a vendedor request MUST be denied without state or queue change.

#### Scenario: Expiry, purge, and later resend

- GIVEN an expired proof whose purge lease is valid and fenced
- WHEN expiry processing purges its original bytes and derivatives and the same bytes later arrive again
- THEN the system MUST retain the hash/audit tombstone, MUST prevent stale or concurrent lifecycle writers from changing the terminal outcome, and MUST reject the later delivery with the same generic duplicate result used for any matching hash.
