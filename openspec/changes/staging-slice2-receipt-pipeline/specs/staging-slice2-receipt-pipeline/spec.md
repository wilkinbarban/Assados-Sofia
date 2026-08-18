# Staging Receipt Spec

## Purpose

Define a staging-only receipt without secrets or partial results.

## Requirements

### Requirement: Target Safety

The runner MUST use staging only and reject unset, production, or mismatched targets before credentials or fixtures. One receipt MAY run; conflict, timeout, ambiguity, or unexpected status MUST fail closed.

#### Scenario: Unsafe target
- GIVEN the target is unset, production, or mismatched
- WHEN a receipt is started
- THEN it MUST fail with a sanitized refusal category

#### Scenario: Concurrent request
- GIVEN a receipt lock is active for the target
- WHEN another receipt starts
- THEN it MUST fail before scenarios execute

### Requirement: Trigger Eligibility

The manifest MUST fingerprint Slice 2 migrations, inventory action, runner, and receipt contracts. Manual runs MUST run; automatic runs require a changed fingerprint.

#### Scenario: Manual invocation
- GIVEN a valid target and unchanged fingerprint
- WHEN invoked manually
- THEN it MUST execute one attempt

#### Scenario: Unchanged automatic trigger
- GIVEN the prior successful fingerprint is unchanged
- WHEN automatic eligibility is evaluated
- THEN it MUST record no execution

### Requirement: Credentials

Future scheduling MUST use one `Type=oneshot` service. Root-managed encrypted credentials MUST be service-readable only; public and privileged requests MUST use separate staging keys.

#### Scenario: Evidence emission
- GIVEN service credentials are provisioned
- WHEN diagnostics or evidence are emitted
- THEN they MUST contain no secret or secret-bearing request data

### Requirement: Fixture Lifecycle

The runner MUST create isolated Admin API fixtures, use password grants, execute authenticated Storage/RPC and denied-role scenarios, and always clean up. It MUST NOT use direct `auth.*` SQL or `psql`.

#### Scenario: Complete receipt
- GIVEN fixture creation and password grant succeed
- WHEN authenticated and denied-role scenarios return their expected status classes
- THEN the receipt MUST be eligible to succeed after cleanup proof

#### Scenario: Fixture or grant failure
- GIVEN fixture creation or normal password grant fails
- WHEN the failure is detected
- THEN scenarios MUST stop and cleanup MUST still be attempted

### Requirement: Drift and Cleanup

The runner MUST detect manifest or identity drift before fixtures and fail without repair, retry, migration, or alteration. Cleanup proof is required for success; ambiguity MUST fail.

#### Scenario: Drift detected
- GIVEN the manifest or target identity differs from its approved baseline
- WHEN preflight runs
- THEN the receipt MUST fail before fixtures are created

#### Scenario: Cleanup incomplete
- GIVEN a scenario has completed or failed
- WHEN fixture deletion cannot be proven
- THEN the receipt MUST be failed with an incomplete-cleanup category

### Requirement: Redacted Evidence

Each attempt MUST persist a redacted, external receipt with non-secret identity, revision, fingerprint, trigger, status classes, category, timestamps, and cleanup outcome. Success MUST mean complete proof.

#### Scenario: Successful evidence
- GIVEN all required scenarios and cleanup are proven
- WHEN the receipt is written
- THEN it MUST report success and the complete required fields

#### Scenario: Failed evidence
- GIVEN any guard, scenario, timeout, or cleanup check fails
- WHEN the receipt is written
- THEN it MUST report failure, its sanitized category, and no secret

### Requirement: Rollback and Non-Goals

The capability MUST preserve disposable/manual validation until authorized cutover. Rollback MUST permit runner/test reversion and scheduler disablement without application changes.

Non-goals: project creation; production access; migrations; direct Auth SQL; `psql`; CLI key lookup; host/VPS or systemd configuration; repository secrets; CI; and path-unit triggers.

#### Scenario: Rollback
- GIVEN the pipeline is withdrawn
- WHEN runner/tests are reverted and scheduling is disabled
- THEN existing application and disposable validation behavior MUST remain unchanged

### Requirement: PR3B Static Boundary Evidence

PR3B acceptance MAY use deterministic static boundary evidence when no pre-change snapshot exists. The evidence MUST declare its owned-path manifest, SHA-256 hashes of current manifest inputs, a current line-count estimate, and its rollback boundary. It MUST explicitly disclose that it is non-Git evidence and therefore does not prove a historical Git delta, actual historic ownership, or a changed-line count.

#### Scenario: Missing pre-change snapshot
- GIVEN no pre-change directory or commit snapshot is available
- WHEN PR3B boundary evidence is refreshed
- THEN the acceptance record MUST use only the declared static manifest and current bytes, state the non-Git limitation, and MUST NOT claim a Git diff or Git-derived ownership proof

## Acceptance Criteria

- Unit tests MUST prove target refusal, trigger, lock, redaction, cleanup, drift, and failure closure.
- Authorized execution MUST produce a complete redacted receipt or a failed redacted receipt, never partial success.
- First-slice implementation MUST stay within 400 review lines and MUST NOT configure host or Supabase.
