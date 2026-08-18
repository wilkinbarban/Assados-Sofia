# Tasks: Admin Inventory Security and Deployment Hardening

## Review Workload Forecast

Estimate: 3,050–3,750 authored; ≤400/slice. Split: S1→S2→S3→S4→S5→S6→S7→S8→S9A→S9B; force-chained, no exception.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Work Units

| Unit/lines | Focused test | Harness | Rollback |
|---|---|---|---|
| S2/330–390 | profile SQL | local reset | migration/actions |
| S3/220–300 | products Vitest | local denial | grants/actions |
| S4/340–395 | inventory SQL | parallel SQL | RPC/actions |
| S5/350–398 | order SQL | concurrent SQL | RPC/callers |
| S6/290–360 | ordering Vitest | fixtures | selector/consumers |
| S7/350–398 | orphan SQL | disposable Storage | worker/queue |
| S8/350–398 | admin Playwright | local stack | UI/fixtures |
| S9A/B 320–395/≤120 | deploy Vitest | Compose/authorized smoke | release/image |

## Slice 1

- [x] 1.1 Checksummed baseline/restoration.
- [x] 1.2 Incident RED tests.
- [x] 1.3 Fail-closed verifier/runbook.
- [ ] 1.4 **A0 PARTIAL:** replacements migrated; unchecked.
- [ ] 1.5 **A1:** service-only revocation unsupported; paired disablement deferred to S9.
- [ ] 1.6 **B1:** separate rewrite authorization.
- [ ] 1.7 **B2:** separate GC authorization.
- [x] 1.8 Evidence/recovery/publication gate.

## Slice 2

Prerequisite only: approved safe S1 receipt; replacement runtime keys; web recreated with replacement environment; read-only smoke pass; temporary-risk acceptance; fresh no-new-legacy-consumer scan. Full S1/A0/A1/B1/B2 completion is unnecessary.

- [x] 2.1 RED `profile_hardening.sql`: escalation, cross-row, roles, spoofing, rollback.
- [x] 2.2 GREEN migration; narrow `src/app/actions/perfil.ts`, `admin.ts`.
- [x] 2.3 GATE secret-safe consumer/key-activity scan; new live privileged legacy consumer blocks.

## Slices 3–8

- [x] 3.1 RED stock denial across SQL, actions, and the inventory edit form.
- [x] 3.2 GREEN narrow authenticated product metadata updates and grants.
- [x] 3.3 GATE secret-safe consumer/key-activity scan/blocker.
- [x] 4.1–4.2 RED/GREEN create/adjust RPCs and `src/app/actions/estoque.ts`.
- [x] 4.3 GATE secret-safe consumer/key-activity scan/blocker.
- [x] 5.1 RED order-stock SQL/runtime and action contracts.
- [x] 5.2 GREEN order-stock RPCs and `src/app/actions/pedidos.ts`.
- [x] 5.3 GATE secret-safe consumer/key-activity scan/blocker.
- [x] 6.1–6.2 RED/GREEN relevance-first ordering across named consumers.
- [x] 6.3 GATE secret-safe consumer/key-activity scan/blocker.
- [x] 7.1–7.2 RED/GREEN orphan worker: grace, recheck, retry, SQL-delete denial.
- [x] 7.3 GATE secret-safe consumer/key-activity scan/blocker.
- [ ] 8.1–8.2 RED/GREEN UI, badges, geometry, failures, local E2E.
- [ ] 8.3 GATE secret-safe consumer/key-activity scan/blocker; production-mutating E2E prohibited.

Production build/restart/replacement/deployment prohibited through S8.

## Slice 9

- [ ] 9.1–9.3 RED/GREEN `deploy-web`; web-only rollback <5m.
- [ ] 9.4 Clean SHA image: replacement publishable; no legacy value.
- [ ] 9.5 Retain previous image.
- [ ] 9.6 Authorize and execute web-only deploy.
- [ ] 9.7 Pass direct/HTTPS read-only smoke.
- [ ] 9.8 Obtain fresh paired-disable authorization.
- [ ] 9.9 Disable legacy anon+service pair together.
- [ ] 9.10 Verify disabled pair; replacements active.
- [ ] 9.11 Shut down process; sanitize OpenCode offline.
- [ ] 9.12 Obtain separate B1 authorization.
- [ ] 9.13 Rewrite refs/reflogs.
- [ ] 9.14 Verify rewrite; abort before GC on failure.
- [ ] 9.15 Obtain separate B2 authorization.
- [ ] 9.16 Garbage-collect unreachable objects.
- [ ] 9.17 Record secret-safe zero-match refs/reflogs/objects.

## Completion

- [ ] 10.1 Require evidence, ≤400-line diff, rollback; planning completes nothing.
