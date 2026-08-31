# SQL Verification Baseline Specification

## Purpose

Establish trustworthy SQL verification for payment-proof operations before dependent capabilities are enabled.

## Requirements

### Requirement: Classified invariant-preserving SQL recovery

The system MUST classify each affected pgTAP failure or blocked suite as either a production defect, an obsolete expectation, or non-idempotent test bootstrap before correction. A correction MUST preserve the applicable payment-proof invariant and MUST NOT merely weaken an assertion to obtain a passing result.

#### Scenario: Production invariant regression

- GIVEN an affected pgTAP assertion exposes a violated production invariant
- WHEN the baseline is corrected
- THEN the production behavior and its invariant-focused assertion MUST be corrected and the rationale MUST identify the root-cause classification.

#### Scenario: Obsolete or non-idempotent test setup

- GIVEN an affected suite has an obsolete expectation or repeats already-applied policy setup
- WHEN the baseline is corrected
- THEN the expectation or setup MUST be made current and idempotent without changing unrelated production behavior.

### Requirement: Green prerequisite for dependent operations

The affected payment-proof pgTAP assertions MUST all pass, and the security handoff suite MUST execute its TAP assertions rather than fail during setup, before dependent intake, reconciliation, recovery, or gate phases are enabled or accepted as ready.

#### Scenario: Blocked handoff suite

- GIVEN the security handoff suite is run against a pre-migrated database
- WHEN policy setup is encountered
- THEN setup MUST complete idempotently and the suite MUST execute its TAP assertions.

### Requirement: Idempotent payment-proof test bootstrap

Payment-proof SQL test bootstrap MUST be repeatable against an already-prepared test database and MUST NOT fail because a policy or equivalent setup object already exists.

#### Scenario: Repeated bootstrap

- GIVEN the payment-proof test bootstrap has completed once
- WHEN it is run again against the same prepared test database
- THEN bootstrap MUST complete without duplicate-object setup failure.
