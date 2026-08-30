# Tasks: Multichannel Customer Payment Proofs

## Review Workload Forecast
| Field | Value |
|---|---|
| Estimated changed lines | 3,000–4,500 authored |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Each PR targets its immediate predecessor; PR1 base is the draft tracker branch. Polluted child diffs MUST be retargeted/rebased. Migrations are forward-only; rollback disables consumers and retains audit.

### Suggested Work Units
| PR | Goal / dependency | Tests; runtime; rollback; edit roots |
|---|---|---|
| 1 | Ledger, events, jobs, RLS | `npm test -- payment-proof-schema`; `npm run selfhost:test:db -- supabase/tests/payment_proof_schema.sql`; revert migration before consumers; `supabase/migrations, supabase/tests, tests/unit` |
| 2 | PDF ingestion, identity, Web/channel adapters; PR1 | `npm test -- payment-proof-ingestion`; controlled Web/Telegram/WhatsApp fixtures; disable adapters; `apps/web/src/app/api, apps/web/src/lib/payment-proofs, tests` |
| 3 | Atomic dedupe, quarantine, outbox; PR2 | `npm test -- payment-proof-lifecycle`; concurrent pgTAP claims/restores; disable claims; `supabase/migrations, supabase/tests, tests/unit` |
| 4 | Advisory LLM and confidence; PR3 | `npm test -- payment-proof-extraction`; mocked provider failure/low confidence; disable worker; `apps/web/src/lib/payment-proofs, tests/unit` |
| 5 | Deterministic bounded PNG; PR4 | `npm test -- payment-proof-render`; real fixture render in web container; disable renderer; `apps/web/src/lib/payment-proofs, apps/web/src/app/api/payment-proofs, tests` |
| 6 | Admin review UX/PDF authorization; PR5 | `npm test -- operator-payment-proofs`; role E2E; revert UI/routes; `apps/web/src/components/comprovantes, apps/web/src/app/actions, apps/web/src/app/api/payment-proofs, tests` |
| 7 | Customer/operator PNG-only chat; PR6 | `npm test -- payment-proof-chat`; Web E2E hidden/admitted; revert projections; `apps/web/src/components/chat, apps/web/src/components/operator, tests` |
| 8 | Exact 1:N reconciliation; PR7 | `npm test -- payment-proof-reconciliation`; pgTAP mismatch/race; disable RPC callers; `supabase/migrations, supabase/tests, apps/web/src/app/actions, tests` |
| 9 | Manual external authority; PR8 | `npm test -- manual-external-payment`; pgTAP auth/idempotency; revert adapter; `supabase/migrations, supabase/tests, apps/web/src/app/actions, tests` |
| 10 | Scheduler/purge/retries; PR9 | `npm test -- payment-proof-scheduler`; container restart/purge harness; stop service; `ops, docker-compose.yml, apps/web/src/app/api/internal, tests` |
| 11 | Exact-duplicate backfill; PR10 | `npm test -- payment-proof-backfill`; disposable Supabase + real hashes; forward corrective migration only; `supabase/migrations, supabase/tests, tests/unit` |
| 12 | Rollout/observability and legacy contraction; PR11 | `npm test -- payment-proof-rollout`; container health/metrics smoke; disable rollout, retain evidence; `apps/web/src, ops, docker-compose.yml, docs, tests` |

## Strict TDD Execution
For every PR: **RED** add the named focused and runtime assertions first; **GREEN** implement only that slice; **REFACTOR** remove duplication, run focused tests plus `npm run typecheck`, `npm run build`, `git diff --check`, and record exact evidence. PRs stay under 400 authored lines; split within boundaries.

## Ordered Checklist
- [x] 1.1 PR1 schema/RLS RED→GREEN→REFACTOR.
- [x] 2.1 PR2 intake/identity/adapters RED→GREEN→REFACTOR.
- [x] 3.1 PR3 dedupe/quarantine/outbox RED→GREEN→REFACTOR.
- [x] 4.1 PR4 advisory LLM RED→GREEN→REFACTOR.
- [x] 5.1 PR5 deterministic PNG RED→GREEN→REFACTOR.
- [x] 6.1 PR6 admin workflow RED→GREEN→REFACTOR.
- [x] 7.1 PR7 PNG-only chats RED→GREEN→REFACTOR.
- [x] 8.1 PR8 exact reconciliation RED→GREEN→REFACTOR.
- [x] 9.1 PR9 manual external approval RED→GREEN→REFACTOR.
- [x] 10.1 PR10 scheduler/purge RED→GREEN→REFACTOR.
- [x] 11.1 PR11 duplicate backfill RED→GREEN→REFACTOR.
- [x] 12.1 PR12 rollout/observability/contraction RED→GREEN→REFACTOR.
