# Credential Incident Response Specification

## Purpose

Define gated containment of two exposed production credentials and repository sanitation without exposing secret values in evidence.

## Requirements

### Requirement: Coordinated Credential Containment

The response SHALL inventory both exposed credentials by fingerprint and consumer, create revocable replacements, update every known consumer, and verify replacement operation before revocation. Evidence SHALL contain fingerprints, timestamps, actor, gate decisions, and status only; it SHALL NOT contain credential values.

#### Scenario: Replace and verify both credentials
- GIVEN both credential fingerprints and all consumers are known
- WHEN replacements are installed and each consumer is verified
- THEN the response SHALL record secret-safe verification for both replacements
- AND the old credentials SHALL remain revocable until separately authorized

#### Scenario: Unknown consumer aborts containment
- GIVEN a consumer cannot be identified or replacement verification fails
- WHEN the response reaches a revocation boundary
- THEN it SHALL abort without revoking either old credential
- AND SHALL record the blocker without secret material

### Requirement: Separate Irreversible Authorization Gates

The maintainer SHALL separately authorize (1) revocation of both old credentials, (2) rewrite of local refs and reflogs, and (3) garbage collection. Approval of this specification or one gate SHALL NOT authorize another gate.

#### Scenario: Revocation gate
- GIVEN replacements are verified and the maintainer is present
- WHEN the maintainer explicitly authorizes both-credential revocation
- THEN both old credentials SHALL be revoked and independently verified unusable
- AND failure of either verification SHALL stop history sanitation

#### Scenario: Missing sanitation gate
- GIVEN revocation is verified but rewrite authorization is absent
- WHEN sanitation is proposed
- THEN no ref, reflog, or object SHALL be altered

### Requirement: Recoverable Repository Sanitation

Before rewrite, dirty work SHALL be preserved and repository reachability SHALL be confirmed. A quarantined backup SHALL permit restoration until garbage collection. Authorized sanitation SHALL rewrite all local refs and reflogs, then, under a separate gate, prune unreachable objects and scan refs, reflogs, and objects for both exposed values.

#### Scenario: Rewrite and scan succeed
- GIVEN revocation is verified, preconditions pass, and rewrite plus GC gates are recorded
- WHEN rewrite and garbage collection complete
- THEN a post-rewrite scan SHALL find zero exposed values in refs, reflogs, and objects
- AND evidence SHALL identify the scanned scope and commit state without values

#### Scenario: Abort before garbage collection
- GIVEN rewrite validation fails before garbage collection
- WHEN the failure is detected
- THEN processing SHALL stop and the quarantined backup SHALL remain available
- AND restoration MAY occur without claiming credential restoration

#### Scenario: Irreversible boundary is explicit
- GIVEN revocation or garbage collection is about to execute
- WHEN authorization is requested
- THEN the system SHALL identify that revocation cannot restore credential validity and GC can remove backup-recoverable objects
