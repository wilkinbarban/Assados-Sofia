# Design: Client Phone-First Authentication

## Technical Approach

Use Supabase Auth’s native `phone + password` identity; operator `email + password` stays unchanged. All client mutations move behind server route handlers. Canonical phone, OTP lifecycle, provider-neutral delivery, and SQL finalizers replace duplicated channel logic. Supabase Admin operations that cannot share a PostgreSQL transaction use an idempotent saga with explicit pending/applied states.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|---|---|---|
| Native Supabase `phone` credential | Synthetic hidden email; custom password table | Native phone coexists with legacy/operator email, preserves Supabase password/session security,. New users are Admin-created with `phone_confirm=false`; custom OTP verification later confirms them. |
| Separate client endpoints from operator login | One polymorphic browser form calling Supabase directly | `/api/client-auth/*` accepts phones only; current operator email login remains direct and role-gated. |
| Explicit state machine plus SQL transactions | Best-effort route sequencing | PostgreSQL atomically owns OTP attempts/consumption, merge, verification evidence, grants, and outbox. GoTrue confirmation/password mutations are idempotent saga steps. |
| Activate challenge after delivery acceptance | Insert active OTP before send | Create `pending_delivery`; hash OTP with HMAC-SHA-256; provider acceptance atomically activates challenge and cooldown. Total failure marks `delivery_failed`, leaving no active cooldown. |
| One channel router | OTP-specific Meta call | Verified owner-matched Telegram first, then only `obterProvedorAtivo()` through a new destination-oriented OTP adapter supporting Meta/Evolution normalized evidence. |
| Optional profile email in `clientes.email` | Reuse `auth.users.email` | |

## Data Flow

    Signup(phone,password,name) → Admin create phone user(unconfirmed) → issue signup OTP
    OTP request → rate-limit RPC → pending challenge → Telegram → active WhatsApp
                                             success → activate + cooldown
                                             failure → delivery_failed
    Verify → atomic finalize RPC (lock/hash/attempt/purpose/merge/evidence/outbox)
           → saga confirms Supabase phone → password login/session
    Recovery OTP → atomic consume + short-lived recovery grant
                 → Admin password update (retry-safe) → mark grant applied/revoke peers

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web/src/lib/auth/{phone,client-auth,password-policy}.ts` | Create | Canonical `^55419[0-9]{8}$`, schemas, generic contracts, client coordinator. |
| `apps/web/src/lib/otp/{service,hash,delivery,types}.ts` | Create | Purpose-bound lifecycle, HMAC comparison, routing/evidence. |
| `apps/web/src/lib/whatsapp/{provider,send,evolution}.ts` | Modify | Add `sendOtp(destination, code)` contract without conversation/window coupling. |
| `apps/web/src/app/api/client-auth/{signup,login,recovery/request,recovery/verify,recovery/reset}/route.ts` | Create | Server-only client credential flows and IP extraction. |
| `apps/web/src/app/api/auth/{otp,verify-otp}/route.ts` | Modify | Compatibility wrappers for signup/phone-change, then retire. |
| `apps/web/src/app/{cadastro,login,cliente/verificar-telefone,cliente/perfil}/**` | Modify | Phone-first forms, operator/client separation, optional email, purpose-aware OTP UX. |
| `apps/web/src/app/api/webhooks/{telegram,whatsapp,evolution}/route.ts` | Modify | Shared normalization; Telegram ownership provenance. |
| `apps/web/src/proxy.ts`, `apps/web/src/app/cliente/layout.tsx`, `apps/web/src/lib/auth/safe-redirect.ts` | Modify | Gate on explicit verified timestamp and saga readiness. |
| `supabase/migrations/*_client_phone_auth_schema.sql` | Create | Add `clientes.email`, `telefone_verificado_em/origem`, Telegram verification evidence; replace OTP table with status/purpose/hash/actor/IP/evidence; limits, grants, outbox, partial unique ownership. |
| `supabase/migrations/*_client_phone_auth_rpcs.sql` | Create | Concurrent issuance, activation/failure, atomic finalize/merge/phone-change, recovery grants. |
| `scripts/client-phone-auth-{audit,backfill,reconcile}.mjs` | Create | Dry-run ambiguity report, additive backfill, saga repair/canary metrics. |
| `tests/unit/{client-auth,phone-normalization,otp-*}.test.ts`, `tests/e2e/client-phone-auth.spec.ts` | Create | New contracts and journeys. |

## Interfaces / Contracts

`OtpPurpose = 'signup' | 'recovery' | 'phone_change'`; delivery returns `{accepted, channel, provider, externalId?, failureCode?}`. Logs contain challenge ID, masked phone, purpose, channel/provider and outcome—never OTP, password, token, or provider secret.

## Testing Strategy

| Phase | Verification |
|---|---|
| Schema/migration | pgTAP/RPC concurrency; duplicate ownership quarantine; dry-run/backfill/rollback rehearsal. |
| OTP core | RED tests for cross-purpose/hash/expiry/attempts; failed sends create no cooldown; Telegram→active Meta/Evolution; parallel rate limits by phone, actor/session, IP, purpose. |
| Atomic/saga | Inject merge, confirmation, and password-update failures; prove DB rollback or deterministic pending state and reconciliation. |
| UI/auth | Signup without email, phone login/recovery, optional email add/remove; operator email regression; explicit-verification route gates. |
| Release | Build + unit + DB + E2E; canary cohort metrics for lockouts, delivery acceptance, pending saga age, merge divergence. |

## Threat Matrix

N/A — no shell, subprocess, VCS automation, executable classification, or new process-integration boundary.

## Migration / Rollout

1. Add schema/RPCs and feature flags: `CLIENT_PHONE_AUTH_ISSUANCE`, `LOGIN`, `RECOVERY`; retain legacy reads.
2. Audit canonical phones; quarantine null/invalid/duplicate ownership. Backfill explicit evidence only from trustworthy OTP/owner-matched Telegram records; others must reverify.
3. Add native phone to existing Supabase users without removing email; canary client login, reconciliation, and rollback by disabling flags.
4. Enable phone signup/recovery, then phone login. Keep legacy client email login for a bounded compatibility window; operators remain permanent email login.
5. Retire client callback/status UI and plaintext legacy OTP columns only after zero unresolved sagas/ambiguities and rollback rehearsal. Rollback disables flags; additive data remains, old email access remains available during the window.

## Open Questions

None blocking. Numeric throttle defaults must be finalized in tasks and load-tested.
