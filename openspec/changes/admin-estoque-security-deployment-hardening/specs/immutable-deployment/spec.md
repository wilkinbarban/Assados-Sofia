# Immutable Deployment Specification

## Purpose

Define reproducible, secret-safe web deployment with migration, smoke, and rollback gates.

## Requirements

### Requirement: Commit-Provenance Image

Production images SHALL be built from a clean tree at an identified commit SHA. The image SHALL expose that SHA as provenance and SHALL contain no source-control dirt, local environment files, credential values, or secret-bearing build arguments/layers. Deployment SHALL abort when provenance or secret scanning fails.

#### Scenario: Clean image is accepted
- GIVEN the tree is clean and the commit SHA is recorded
- WHEN the image is built and scanned
- THEN provenance SHALL match the commit and no embedded secret SHALL be detected

#### Scenario: Dirty or secret-bearing build aborts
- GIVEN uncommitted content or a secret is detected in image inputs/layers
- WHEN the release gate evaluates
- THEN build/deployment SHALL stop without replacing production

### Requirement: Compatible Migration and Web-Only Recreate

Schema changes SHALL follow expand/contract compatibility so the current and candidate web images can operate during deployment and rollback. A migration failure SHALL stop deployment. After compatibility and health gates pass, only the web service SHALL be recreated; dependencies SHALL NOT be restarted or redeployed.

#### Scenario: Migration remains rollback-compatible
- GIVEN the previous image is retained
- WHEN candidate migrations are applied
- THEN both previous and candidate images SHALL remain compatible through the rollback window

#### Scenario: Migration or healthcheck fails
- GIVEN migration validation or candidate healthcheck fails
- WHEN deployment evaluates the gate
- THEN the current web service SHALL remain active or be restored
- AND no dependent container SHALL be restarted

### Requirement: Read-Only Smoke and Observable Release

The candidate SHALL pass a healthcheck plus direct-origin and HTTPS read-only smoke checks. Smoke SHALL verify identity/provenance and critical read surfaces without creating, editing, approving, reordering, or deleting production data. Evidence SHALL include SHA, image identity, timestamps, endpoints, status, and rollback decision without secrets.

#### Scenario: Release passes both paths
- GIVEN the candidate web service is healthy
- WHEN direct and HTTPS smoke checks execute
- THEN both SHALL pass against the same commit-SHA image
- AND the checks SHALL perform zero production mutations

#### Scenario: Smoke failure triggers rollback decision
- GIVEN either smoke path fails or serves unexpected provenance
- WHEN the release gate evaluates
- THEN promotion SHALL stop and rollback SHALL begin or be explicitly authorized

### Requirement: Previous-Image Rollback Under Five Minutes

The immediately previous image SHALL remain available. Rollback SHALL recreate only web from that immutable image, require no destructive down-migration, and restore passing health plus direct/HTTPS read-only smoke within five minutes of the rollback decision.

#### Scenario: Timed rollback succeeds
- GIVEN a failed candidate and a retained compatible previous image
- WHEN rollback is authorized
- THEN the previous web image SHALL pass health and both smoke paths in under five minutes

#### Scenario: Rollback validation fails
- GIVEN the previous image does not pass validation
- WHEN rollback is attempted
- THEN the incident SHALL remain open with observable failure evidence
- AND no successful recovery SHALL be claimed
