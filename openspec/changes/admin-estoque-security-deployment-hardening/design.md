# Design: Admin Inventory Security and Deployment Hardening

## Technical Approach

Establish authorization, transactional inventory, Storage reconciliation, and immutable releases. The maintainer accepts both legacy keys remaining active through Slices 2–8 because Supabase disables legacy `anon` and `service_role` together while the current image embeds the legacy publishable key. This exception expires at Slice 9. Mutations use disposable Supabase; production smoke is read-only.

## Architecture Decisions

| Decision | Choice and rationale | Rejected tradeoff |
|---|---|---|
| Credential retirement sequencing | A0 stays partial and A1 blocked/unexecuted. Slices 2–8 may proceed under recorded temporary-risk acceptance, but every slice gate repeats secret-safe legacy-key activity checks and consumer scans. Slice 9 migrates the image before requesting paired disablement; offline OpenCode sanitation then precedes separately authorized B1/B2. | Immediate paired disablement breaks the embedded publishable-key consumer; blocking all feature slices adds no containment while the maintainer has accepted the bounded risk. |
| Data boundaries | Column-safe profile grants plus audited RPCs; transactional stock/order writers; durable approved orphan queue with a Storage-API worker. | RLS alone is not column-safe, application-step stock writes are partial, and SQL Storage deletion is unsupported. |
| Delivery | Forced stacked-to-main work units, each ≤400 authored changed lines, tests/docs included. | A large PR exceeds the review budget. |

## Data Flow and Contracts

**Slices 2–8:** each gate repeats fingerprint-only legacy activity checks and consumer scans, then records the accepted risk. Unknown consumers or unsafe output fail closed. A0 remains partial; A1/B1/B2 remain unauthorized and incomplete.

**Slice 9 mandatory order:** clean commit-SHA image using the replacement publishable/protected runtime secret, with no legacy value → deploy and pass provenance, health, direct `:3020`, and HTTPS read-only smoke → obtain fresh paired-disable authorization → disable both legacy keys → verify both unusable and all consumers healthy → sanitize OpenCode offline → obtain separate B1 authorization and validate disposable-clone rewrite → obtain separate B2 authorization → GC and scan refs/reflogs/objects. Evidence is fingerprint/status-only; unknown consumers, failed verification, missing gates, preservation/publication ambiguity, or pre-GC failure aborts.

**Production prohibition:** no production deployment before the Slice 9 clean image. That deployment remains separately authorized; earlier slices cannot rebuild, restart, or replace production.

**Database contracts:** profile RPCs derive the actor, restrict self-service columns, enforce role/self-lockout/last-admin rules, and audit atomically. Dedicated stock/order RPCs serialize UUID locks, derive trusted identity, create exactly-once movements, and roll back shortages or failures. Shared list RPCs apply relevance then official deterministic order. `orphan_reconciliacoes` uses `reported→approved→claimed→completed|protected|failed`; a Storage-API worker applies 24-hour grace, `SKIP LOCKED`, immediate four-column recheck, bounded deletion, retry, and audit. Errors use stable codes/correlation IDs; evidence excludes secrets/PII.

## File Changes

| Files | Action |
|---|---|
| `docs/runbooks/credential-incident.md`, `scripts/verify-incident-preconditions.sh` | Create gated, fail-closed runbook/checks. |
| `supabase/migrations/`, `supabase/tests/`, `src/app/actions/`, `src/components/operator/` | Add expand migrations/tests and authorized RPC consumers/UI. |
| `src/app/api/health/route.ts`, `Dockerfile`, `docker-compose.yml`, `scripts/deploy-web.sh`, `docs/runbooks/deployment.md` | Add replacement-key clean-image enforcement, SHA provenance, paired-retirement sequencing, health/smoke/rollback gates, and web-only recreate. |
| `tests/unit/`, `tests/e2e/` | Add negative, transactional, UI, cleanup, and environment-boundary coverage. |

## Testing Strategy

SQL RED tests cover escalation, transactional stock/order behavior, ranking, claims, rechecks, and roles. Vitest covers actions, clean-image credential classification, gate ordering, and deployment rollback. Every slice gate records fingerprint-only legacy activity and consumer-scan results without revealing values. Local Playwright proves roles and workflows; hosted production permits only health/provenance/read smoke and blocks all mutation methods. Slice 9 rehearses web-only rollback and proves recovery in under five minutes.

## Threat Matrix

| Boundary | Applicability; safe/failure behavior; planned RED test |
|---|---|
| Documentation-like paths | N/A—no executable-file classifier. |
| Git repository selection | Applicable—canonical absolute root/recovery clone only; reject relative or mismatched `git -C`; tests cover relative/absolute/wrong repo. |
| Commit state | Applicable—rewrite requires preserved dirty/untracked checksum and clean sanitation clone; tests cover staged, `commit -a` risk, empty index. |
| Push state | Applicable—no remote means fail closed; later publication requires explicit remote/refspec; tests cover tracking, first push, explicit refspec. |
| PR commands | N/A—design defines slices but no PR-command automation. |

## Migration / Rollout and Stacked Slices

Reconcile migration ledgers/signatures first; never blind-replay drift. Slices remain stacked-to-main and ≤400 authored lines. Slice 2 depends on merged Slice 1 safeguards and its own clean work-unit boundary—not completion of A1, B1, or B2. Slices 2–8 may proceed under the explicit risk exception, repeated secret-safe checks, local/disposable mutation testing, and the production-deployment prohibition. At Slice 9 the exception expires and the mandatory sequence above applies. Keep expand/contract compatibility and the previous immutable image so web-only rollback remains under five minutes. No operational gate is complete: A0 is partial; A1, B1, and B2 are unchecked.

## Open Questions

None blocking Slices 2–8. Remote publication ownership and migration drift must be evidenced before Slice 9 execution; Slice 9 deployment, paired disablement, B1, and B2 each retain their stated authorization boundaries.
