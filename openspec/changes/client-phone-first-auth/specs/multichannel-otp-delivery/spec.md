# Multichannel OTP Delivery Specification

## Purpose

Define secure, provider-neutral OTP issuance, delivery, throttling, and consumption.

## Requirements

### Requirement: Purpose-bound protected OTP

Every OTP MUST be random, six digits, stored only as a one-way hash, bound to phone, actor, and purpose (`signup`, `recovery`, or `phone_change`), expire within ten minutes, and have bounded attempts.

#### Scenario: Cross-purpose rejection
- GIVEN a valid signup OTP
- WHEN it is submitted for password recovery
- THEN verification MUST fail without consuming another purpose's OTP

### Requirement: Verified-channel routing

Delivery MUST prefer Telegram only when the phone was verified from an owner-matched Telegram contact. Otherwise, or when Telegram delivery fails, it MUST use the active WhatsApp provider, Meta or Evolution; it MUST NOT bypass provider configuration.

#### Scenario: Telegram then active WhatsApp
- GIVEN verified Telegram ownership and Evolution is active
- WHEN Telegram delivery fails
- THEN the same OTP challenge MUST be attempted through Evolution
- AND Meta MUST NOT be called

### Requirement: Successful-delivery semantics

A challenge MUST become active and start user cooldown only after a provider confirms delivery acceptance. Failed attempts MUST be recorded for diagnostics but MUST NOT leave a usable OTP or user resend cooldown.

#### Scenario: All providers fail
- GIVEN every eligible channel rejects delivery
- WHEN an OTP is requested
- THEN no active OTP or resend cooldown MUST remain
- AND the response MUST expose no account existence information

### Requirement: Layered throttling

Requests and verification attempts MUST be limited independently by canonical phone, account or session, IP, and purpose. Limits MUST resist parallel requests and MUST return generic responses.

#### Scenario: One dimension exceeds limit
- GIVEN the IP limit is exhausted while the phone limit is not
- WHEN another OTP is requested
- THEN delivery MUST be blocked
- AND no challenge MUST be activated

### Requirement: Atomic finalization

OTP validation, attempt accounting, single-use consumption, client merge or phone change, and password reset MUST execute atomically for the stated purpose.

#### Scenario: Finalization rollback
- GIVEN a correct unexpired OTP
- WHEN account merge or password reset fails
- THEN all finalization changes MUST roll back
- AND the OTP MUST remain consistently retryable or consistently invalidated by one documented outcome
