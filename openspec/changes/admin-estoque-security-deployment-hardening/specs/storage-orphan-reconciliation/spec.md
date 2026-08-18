# Storage Orphan Reconciliation Specification

## Purpose

Define safe discovery and approved deletion of unreferenced product images.

## Requirements

### Requirement: Scoped Dry-Run Discovery

The scanner SHALL be dry-run by default, inspect only the product-image prefix, and classify an object as eligible only when it is unreferenced and at least 24 hours old. Reports SHALL be durable, secret-safe, and contain object identity, age, scan time, reason, and reference status without mutating Storage.

#### Scenario: Eligible orphan is reported
- GIVEN an object under the product prefix is unreferenced and at least 24 hours old
- WHEN a dry-run scan executes
- THEN it SHALL be reported and no object SHALL be deleted

#### Scenario: Scope and grace protect objects
- GIVEN an object is outside the product prefix, referenced, or younger than 24 hours
- WHEN scanning executes
- THEN it SHALL not become deletion-eligible

### Requirement: Approved Atomic Claim and Recheck

Deletion SHALL require an active admin or supervisor approval recorded before execution. A worker SHALL atomically claim one eligible item, SHALL immediately recheck current product references and age, and SHALL make duplicate workers or retries idempotent. Claim, approval, attempt, recheck, result, and actor SHALL be auditable.

#### Scenario: Approved orphan is deleted once
- GIVEN an eligible item has administrative approval
- WHEN a worker claims it and the immediate recheck confirms it remains orphaned
- THEN deletion SHALL be attempted once through the Storage API
- AND success SHALL be recorded atomically as completed

#### Scenario: Reference appears after approval
- GIVEN an approved item becomes referenced before deletion
- WHEN the immediate recheck runs
- THEN deletion SHALL be skipped and the item SHALL be closed as protected

#### Scenario: Concurrent workers and retry
- GIVEN two workers or repeated delivery target the same item
- WHEN claims are attempted
- THEN at most one active claim SHALL execute deletion
- AND retries SHALL resume or return the durable outcome without duplicate deletion

### Requirement: Storage API and Failure Safety

Cleanup SHALL NOT delete rows from `storage.objects` using SQL. Storage deletion failure SHALL retain a retriable failed state and SHALL NOT clear a product reference. Product deletion or image replacement SHALL not claim success when required Storage cleanup fails; preserved referenced images SHALL remain usable.

#### Scenario: SQL deletion is prohibited
- GIVEN a cleanup candidate exists
- WHEN execution is authorized
- THEN object deletion SHALL use the supported Storage API
- AND no direct SQL `DELETE` against `storage.objects` SHALL occur

#### Scenario: Storage deletion fails
- GIVEN a claimed orphan cannot be deleted by Storage
- WHEN the attempt returns failure or times out
- THEN the item SHALL remain failed/retriable with safe diagnostics
- AND no successful-deletion audit event SHALL be emitted

#### Scenario: Referenced image cleanup fails
- GIVEN product/image deletion requires object cleanup and that cleanup fails
- WHEN the business operation resolves
- THEN product references and prior usable state SHALL remain consistent
- AND operators SHALL receive an observable retry path
