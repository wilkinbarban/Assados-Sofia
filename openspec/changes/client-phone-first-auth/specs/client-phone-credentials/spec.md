# Client Phone Credentials Specification

## Purpose

Define phone-first credentials for clients while preserving compatible access during migration.

## Requirements

### Requirement: Phone and password credentials

A client MUST register and sign in with name, canonical Curitiba mobile phone, and password. Email MUST NOT be required or used as the client-facing login identifier. Password policy MUST be enforced identically at signup, reset, and change.

#### Scenario: New client signup
- GIVEN an unowned valid Curitiba mobile phone
- WHEN a client submits a valid name, phone, and password
- THEN the account MUST be created pending phone verification
- AND no email confirmation MUST be required

#### Scenario: Non-enumerating login failure
- GIVEN a phone is unknown, unverified, inactive, or paired with a wrong password
- WHEN client login is attempted
- THEN the response MUST use the same generic failure contract
- AND MUST NOT disclose account existence or state

### Requirement: Optional profile email

An authenticated client MAY add, change, or remove a syntactically valid email in the client profile. It MUST NOT alter phone ownership, login eligibility, or verification state.

#### Scenario: Add optional email
- GIVEN a phone-authenticated client
- WHEN a valid email is saved in the profile
- THEN it MUST be stored as optional contact data
- AND subsequent login MUST still use phone and password

### Requirement: OTP password recovery

A client MUST be able to reset the password by proving control of the account's verified phone through a recovery-purpose OTP. Recovery responses MUST be non-enumerating.

#### Scenario: Successful recovery
- GIVEN a verified client phone
- WHEN a recovery OTP is delivered and correctly verified
- THEN the password MUST be replaced atomically
- AND existing recovery OTPs MUST become unusable

### Requirement: Existing-client compatibility

Existing clients MUST retain access during a reversible migration. A phone MUST have one unambiguous owner before phone login is enabled; ambiguous or missing ownership MUST be quarantined without destructive reassignment.

#### Scenario: Safe migration
- GIVEN a legacy client with one canonical verified phone
- WHEN migration runs
- THEN a compatible phone credential MUST be established without losing history
- AND rollback metadata MUST preserve legacy access until cutover completes
