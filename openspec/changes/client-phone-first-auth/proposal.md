# Proposal: Client Phone-First Authentication

## Intent

Replace client email-first auth with required phone + password and OTP recovery through Telegram or active WhatsApp. Preserve operator email auth; move optional email into client profile.

## Proposal Question Round

Assumptions: existing clients retain access; one verified phone owns one account; Curitiba-only normalization applies everywhere; recovery prefers verified Telegram, then WhatsApp.

## Scope

### In Scope
- Client signup/login with required phone and password; optional email managed only in profile.
- Transactional OTP delivery, verification, merge, and explicit verification timestamps.
- Provider-neutral OTP delivery using Telegram or active Meta/Evolution configuration.
- Layered rate limits by phone, account/session, IP, and purpose.
- Existing-client migration, observability, rollout, and rollback.
- Phone OTP password recovery; operator email login remains unchanged.

### Out of Scope
- Operator/admin phone authentication.
- International numbers or expansion beyond DDD 41.
- Marketing email and notification preferences.

## Capabilities

### New Capabilities
- `client-phone-credentials`: Phone/password signup, login, recovery, and migration.
- `multichannel-otp-delivery`: Purpose-bound OTP, routing, throttling, and atomic consumption.

### Modified Capabilities
- `autenticacao`: Phone-first clients; preserve operator email login.
- `autenticacao_email`: Remove signup confirmation; email becomes optional profile data.
- `validacao_telefone`: Explicit, provider-neutral, atomic verification and normalization.
- `integracoes`: Active WhatsApp provider becomes authoritative for OTP delivery.

## Approach

Introduce client-auth and canonical normalization. Map phones to Supabase-compatible identities without exposing synthetic identifiers. Add transactional RPCs for OTP finalization and merge. Behind a flag, backfill, enable compatibility reads, switch auth, then retire client email confirmation.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/web/src/app/{cadastro,login,cliente}` | Modified | Phone-first UX |
| `apps/web/src/app/api/auth` | Modified | Auth and recovery |
| `apps/web/src/lib/{telegram,whatsapp}` | Modified | OTP routing |
| `supabase/migrations` | Modified | Identity and transactions |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing-account lockout | Medium | Backfill audit, dual-read, canaries |
| OTP abuse | Medium | Purpose binding, hashing, layered limits |
| Provider outage | Medium | Verified-channel fallback |

## Rollback Plan

Disable the flag, restore legacy client email login during compatibility, retain additive schema, and revert routing without deleting migrated identities. Reconcile partial migrations from audit records.

## Success Criteria

- [ ] Phase 1: migration dry-run finds no ambiguous phone ownership; rollback rehearsal passes.
- [ ] Phase 2: provider, delivery, throttling, normalization, and atomicity tests pass.
- [ ] Phase 3: client auth/profile and operator email regression tests pass.
- [ ] Phase 4: canaries show no unexplained lockouts, bad OTP consumption, or merge divergence.
- [ ] Phase 5: build, integration, E2E, database, and rollback checks pass.
