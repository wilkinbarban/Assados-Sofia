# Operational Gates Specification

## Purpose

Ensure payment-proof operational gates are durable, declarative, fail closed, and activated only by authorized deployment operations.

## Requirements

### Requirement: Declarative deployment authority

Payment-proof operational gates MUST derive solely from allowlisted Compose or environment configuration. Cache-local files, dynamic runtime overrides, and unallowlisted configuration values MUST NOT open a gate or supersede the deployed configuration.

#### Scenario: Cache override attempt

- GIVEN deployed declarative configuration keeps a gate closed
- WHEN a cache-local value or runtime override attempts to open it
- THEN the effective gate state MUST remain closed.

### Requirement: Fail-closed gate parsing

Each gate parser MUST accept only its documented allowlisted values. Missing, unreadable, or malformed configuration MUST evaluate the gate as closed and MUST NOT enable payment-proof intake, reconciliation, replay, cleanup, or another protected capability.

#### Scenario: Malformed configuration

- GIVEN a gate configuration value is missing or malformed
- WHEN the Web workload evaluates the gate
- THEN the effective state MUST be closed and protected operations MUST remain unavailable.

### Requirement: Controlled workload adoption and diagnostics

A change to declarative gate configuration MUST take effect only after a controlled Web workload recreation. Operational diagnostics MUST expose the effective gate state and MUST distinguish it from a requested or unavailable configuration value without exposing secrets.

#### Scenario: Environment change before recreation

- GIVEN a deployed gate value changes in Compose or environment configuration
- WHEN the existing Web workload continues without controlled recreation
- THEN its effective gate state MUST remain unchanged.

#### Scenario: Recreated workload diagnostics

- GIVEN the Web workload is recreated with valid allowlisted gate configuration
- WHEN operational diagnostics are inspected by an authorized operator
- THEN diagnostics MUST report the effective gate state without exposing secret configuration.

### Requirement: Staged reversible operational rollout

Each gate-enabled rollout stage MUST define entry evidence, an authorized operational opening action, observation expectations, a stop condition, and a rollback action that closes the applicable gate and recreates the Web workload. Code implementation and deployment MUST NOT automatically open a production gate; opening requires separate explicit operational authorization.

#### Scenario: Unauthorized automatic opening

- GIVEN protected gate behavior is deployed to production
- WHEN deployment completes without separate operational authorization
- THEN the gate MUST remain closed.

#### Scenario: Stop condition rollback

- GIVEN an authorized rollout stage reaches its documented stop condition
- WHEN operations execute its rollback action
- THEN the applicable gate MUST be closed through declarative configuration and become effective only after controlled Web recreation.
