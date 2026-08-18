# Tasks: Client Phone-First Authentication

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,800–2,600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Schema, RPCs, audit | PR 1, base = tracker branch | `npm run supabase:test` | `npm run supabase:reset` | Additive migrations/flags |
| 2 | OTP core/providers | PR 2, base = PR 1 branch | `npx vitest run tests/unit/{phone-normalization,otp-*}.test.ts` | provider sandbox probes | OTP library/adapters |
| 3 | Atomic finalize/sagas | PR 3, base = PR 2 branch | `npm run supabase:test` | reconcile dry-run | RPCs/outbox/grants |
| 4 | Client auth/profile UI | PR 4, base = PR 3 branch | `npx vitest run tests/unit/client-auth.test.ts tests/unit/verificar-email.test.tsx` | Playwright client journey | routes/forms/flags |
| 5 | Migration/canary/cutover | PR 5, base = PR 4 branch | `npm run test:all` | `docker compose up -d --build web` | disable flags/legacy dual-read |

## Phase 1: Safe Data Foundation

- [x] 1.1 RED: add SQL tests for duplicate ownership, evidence, concurrent issuance, purpose isolation, expiry, attempts, and layered throttles.
- [x] 1.2 GREEN: add schema/RPC migrations for hashed stateful challenges, verification provenance, recovery grants, outbox, partial uniqueness, and atomic rate limits.
- [x] 1.3 Add `scripts/client-phone-auth-{audit,backfill,reconcile}.mjs`; verify `--dry-run`, quarantine, idempotency, migration dry-run, and rollback rehearsal.

## Phase 2: Canonical OTP Delivery

- [x] 2.1 RED: test every ingress against `^55419[0-9]{8}$`, equivalence, unsupported-number rejection, hashing, masking, and safe logs.
- [x] 2.2 GREEN: create `lib/auth/phone.ts` and `lib/otp/*`; route Telegram to the authoritative WhatsApp provider.
- [x] 2.3 RED→GREEN: prove provider acceptance activates cooldown; total failure marks `delivery_failed` with no usable challenge/cooldown; parallel bypass fails.
- [x] 2.4 REFACTOR webhooks and legacy OTP routes onto shared normalization/delivery; run focused Vitest and provider contract probes.

## Phase 3: Atomic Finalization and Recovery

- [x] 3.1 RED: inject merge, confirmation, and password-update failures; assert rollback or deterministic retryable saga state.
- [x] 3.2 GREEN: implement transactional finalizers plus idempotent Supabase confirmation/password sagas.
- [x] 3.3 REFACTOR reconciliation/outbox boundaries; run DB concurrency tests and `node scripts/client-phone-auth-reconcile.mjs --dry-run`.

## Phase 4: Phone Credentials and Optional Email

- [x] 4.1 RED: test signup without email, generic login/recovery failures, explicit-verification gates, optional email, and operator email regression.
- [x] 4.2 GREEN: add `/api/client-auth/*`, phone forms, recovery, profile email, and purpose-aware verification.
- [x] 4.3 REFACTOR callback/status flow behind compatibility flags; retain operator email behavior and legacy client dual-read.

## Phase 5: Rollout Verification

- [x] 5.1 Run focused unit/component tests, `npm run lint`, `npm run build`, `npm run supabase:test` and Playwright journeys.
- [x] 5.2 Canary backfill; verify lockouts, delivery, saga age, divergence, dual-read, and flag rollback.
- [x] 5.3 Rebuild/restart containers, inspect health/logs, execute Meta/Evolution/Telegram sandbox OTPs, then retire legacy client email/OTP fields only with zero unresolved records.
