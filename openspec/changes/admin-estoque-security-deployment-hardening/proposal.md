# Proposal: Admin Inventory Security and Deployment Hardening

## Intent

Contain two exposed production credentials, then enforce security and deployment boundaries. The maintainer must authorize every irreversible operation; proposal approval authorizes none.

## Scope

### In Scope
- **Phase 0:** inventory fingerprints/consumers without values; create a revocable replacement, update consumers, verify, then separately gate both-credential revocation. After verified revocation, separately gate repository refs/reflogs rewrite and garbage collection, then secret-scan. Preconditions: maintainer present, dirty work preserved, replacement verified, reach confirmed. Evidence MUST contain fingerprints/status only. Abort on unknown consumers, failed verification, or missing gates. A quarantined backup permits pre-GC recovery; revocation and GC are irreversible.
- Self-profile updates cannot change `funcao`/`ativo`; transactional stock writers cover adjustments, positive initial stock (`entrada`, `Estoque inicial`), order confirmation, and cancellation. Catalog order uses `ordem_exibicao`; search ranks relevance, then this tie-breaker.
- Orphan dry-run reporting with 24-hour grace, immediate reference recheck, durable queue, and pre-deletion administrative approval.
- Local/disposable mutable E2E; hosted production read-only smoke checks only.
- Expand/contract migrations and commit-SHA images with retained previous-image rollback under five minutes.
- Forced stacked-to-main autonomous slices, each ≤400 authored changed lines and independently verifiable/reversible; details belong to `sdd-tasks`.

### Out of Scope
- Automatic orphan scheduling, production-mutating tests, unrelated cleanup, proposal-time incident execution, and dirty-tree builds/deployments.

## Capabilities

### New Capabilities
- `credential-incident-response`: gated containment and repository sanitation.
- `storage-orphan-reconciliation`: report, approval, recheck, deletion, retry, and audit.
- `immutable-deployment`: build provenance, health/smoke gates, and rollback.

### Modified Capabilities
- `perfil_operador`: column-safe self-service profile updates.
- `estoque`: transactional stock, official ordering, cleanup, and E2E invariants.
- `dashboard_admin`: authorized cleanup controls and runtime UI semantics.
- `pedidos_pagamento`: atomic stock effects on confirmation/cancellation.

## Approach and Affected Areas

Use narrow authenticated RPCs/column grants, remove generic stock writes, reconcile through Storage APIs, and deploy only clean `main`. Areas: `scripts/`, Git metadata, `supabase/migrations/`, actions/UI, `tests/`, container files, and runbooks.

## Risks and Rollback

Credential misuse and destructive cleanup are high risk; gates and rechecks mitigate them. Keep schema expand/contract compatible. Disable orphan execution while retaining reports; revert slices independently; recreate `web` from the prior image within five minutes.

## Success Criteria

- [ ] Both exposed credentials are verified revoked before history-cleanup effectiveness is claimed; post-cleanup scan finds zero exposed values in repository refs/reflogs/objects.
- [ ] Authenticated self-escalation and every non-transactional stock path fail automated tests; all stock changes produce matching movements.
- [ ] Referenced or <24-hour images have zero deletions; every deletion has approval, recheck, and audit evidence.
- [ ] Local E2E covers roles, stock/history, ordering, geometry, badges, and cleanup failures; production checks perform zero mutations.
- [ ] Every slice stays ≤400 changed lines; deployment uses a commit-SHA image, passes health/smoke gates, and demonstrates <5-minute rollback.
