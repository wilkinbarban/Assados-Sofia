# Exploration Analysis: epica9-melhorias-integracao

**Status:** `complete`
**Date:** 2026-07-06
**Change:** Épica 9 — Melhorias de Integração (Email Confirmation, Dashboard Reorganization, Evolution API)

---

## Executive Summary

This change spans three major workstreams that touch auth flow, admin dashboard UI, Docker infrastructure, and WhatsApp messaging abstraction. The codebase is a Next.js 15 app with Supabase auth, running behind Nginx reverse proxy on `casadeasados.duckdns.org` via Docker Compose (port 3020→3000).

**Key findings:**
1. **Email confirmation redirect** is broken — Supabase sends users to `http://localhost:3000/?code=...` because the cloud project's `site_url` is misconfigured in the Supabase Dashboard (not in codebase). The callback route at `src/app/api/auth/callback/route.ts` works correctly once the user reaches the app. The verification landing page (`/verificar-email`) exists and is branded, but texts are in Spanish (rioplatense) — not pt-BR as required. The Supabase email template is the default English one — must be overridden in the Supabase Dashboard.
2. **Dashboard Integrações tab** is a single monolithic 74KB component (`AdminDashboard.tsx`) with ONE massive `<form>` containing ALL API keys (OpenRouter, WhatsApp Meta × 4 fields) and a single "Salvar Integrações" button. Google Calendar is a separate card. MercadoPago has NO dashboard management at all. This needs to be split into 5 independent management cards.
3. **Evolution API** does not exist yet. Docker Compose has only a single `web` service. WhatsApp sending is hardcoded to Meta Cloud API in `src/lib/whatsapp/send.ts`. The webhook handler in `src/app/api/webhooks/whatsapp/route.ts` only handles Meta's payload format. A new provider abstraction layer is needed.

---

## Affected Areas

### Area 1: Auth & Email Confirmation Flow

| File | Role | Impact |
|------|------|--------|
| [route.ts](file:///home/wilkin/proyectos/Asados/src/app/api/auth/callback/route.ts) | Auth callback — exchanges code for session | Low: works correctly, redirects to `/verificar-email?sucesso=true` |
| [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/verificar-email/page.tsx) | Email verification landing page | Medium: needs text translation from Spanish → pt-BR |
| [middleware.ts](file:///home/wilkin/proyectos/Asados/middleware.ts) | Session refresh, route protection | None: `/verificar-email` is unprotected, works fine |
| [config.toml](file:///home/wilkin/proyectos/Asados/supabase/config.toml#L159) | Local Supabase config | Info: `site_url = "http://127.0.0.1:3000"` (local only) |
| `.env` line 33 | `NEXT_PUBLIC_APP_URL=https://casadeasados.duckdns.org` | Info: already set correctly |
| **Supabase Dashboard** (external) | Cloud `site_url` + email template HTML | **Critical**: must set `site_url` to `https://casadeasados.duckdns.org` and customize the confirmation email template to pt-BR with branding |

#### Current flow:
1. User signs up → Supabase sends email with link to `{site_url}?code=...` (currently `http://localhost:3000`)
2. User clicks link → arrives at callback route → exchanges code → redirects to `/verificar-email?sucesso=true`
3. The `/verificar-email` page shows branded success/error messages (currently in Spanish)

#### Required changes:
- **Supabase Dashboard**: Set `site_url` to `https://casadeasados.duckdns.org`, and set redirect URL to include `/api/auth/callback`
- **Email template**: Override the Supabase cloud email template with pt-BR branded HTML for `Confirm signup`
- **verificar-email page**: Translate all strings from Spanish to pt-BR

### Area 2: Dashboard Reorganization (Integrações Tab)

| File | Role | Impact |
|------|------|--------|
| [AdminDashboard.tsx](file:///home/wilkin/proyectos/Asados/src/components/operator/AdminDashboard.tsx) | Main dashboard component (74KB, 1622 lines) | **High**: Integrações tab (L940-L1301) needs full restructure |
| [admin/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/atendimento/admin/page.tsx) | SSR data loader for admin dashboard | Medium: needs to load new config keys (Evolution API, MercadoPago, WHATSAPP_PROVIDER) |
| [admin.ts](file:///home/wilkin/proyectos/Asados/src/app/actions/admin.ts) | Server actions (27KB, 814 lines) | Medium: need new test actions (Evolution API, MercadoPago) |

#### Current Integrações tab structure (L940-L1301):
```
<form> (single form, single save button)
  ├── OPENROUTER_API_KEY input
  ├── OPENROUTER_MODEL select
  ├── [Test LLM] [Sync Models] buttons
  ├── WHATSAPP_ACCESS_TOKEN input
  ├── WHATSAPP_PHONE_NUMBER_ID input
  ├── WHATSAPP_APP_SECRET input
  ├── WHATSAPP_VERIFY_TOKEN input
  ├── [Test Meta] button
  └── [Salvar Integrações] (saves ALL 6 keys at once)
</form>
<card> Google Calendar (read-only display, [Test] button) </card>
```

#### Target structure (5 independent cards):
```
Card 1: Gestão LLM API (Modelo da Sofía)
  ├── OPENROUTER_API_KEY
  ├── OPENROUTER_MODEL
  ├── [Test LLM] [Sync Models] [Save LLM]

Card 2: Gestão WhatsApp API (Meta Cloud API)
  ├── WHATSAPP_ACCESS_TOKEN
  ├── WHATSAPP_PHONE_NUMBER_ID
  ├── WHATSAPP_APP_SECRET
  ├── WHATSAPP_VERIFY_TOKEN
  ├── [Test Meta] [Save Meta]

Card 3: Gestão WhatsApp QR (Evolution API) ★ NEW
  ├── EVOLUTION_API_URL
  ├── EVOLUTION_API_KEY
  ├── EVOLUTION_INSTANCE_NAME
  ├── QR Code display area
  ├── [Test Evolution] [Save Evolution]
  ├── Toggle: Active Provider (Meta vs Evolution)

Card 4: Gestão Google Calendar API
  ├── GOOGLE_CALENDAR_ID (read-only)
  ├── GOOGLE_CLIENT_EMAIL (read-only)
  ├── GOOGLE_PRIVATE_KEY status
  ├── [Test Calendar]

Card 5: Gestão Mercado Pago API ★ NEW card
  ├── MERCADO_PAGO_ACCESS_TOKEN
  ├── MERCADO_PAGO_PUBLIC_KEY
  ├── [Test MP] [Save MP]
```

#### Key state variables to modify:
- L121-133: Current integration state (need to split into per-card states)
- L465-491: `handleSaveIntegrations()` — currently saves all 6 keys in one `Promise.all()`
- L204-244: `handleTestMeta()` — stays in Card 2
- L163-196: `handleTestLLM()` — stays in Card 1

### Area 3: Evolution API Integration (Docker + Provider Abstraction)

| File | Role | Impact |
|------|------|--------|
| [docker-compose.yml](file:///home/wilkin/proyectos/Asados/docker-compose.yml) | Docker services (only `web` today) | **High**: add `evolution-api` service |
| [nginx.conf](file:///home/wilkin/proyectos/Asados/nginx.conf) | Reverse proxy | Medium: needs route for Evolution API or webhook forwarding |
| [send.ts](file:///home/wilkin/proyectos/Asados/src/lib/whatsapp/send.ts) | WhatsApp message sender | **High**: hardcoded to Meta Cloud API, needs provider abstraction |
| [whatsapp/route.ts](file:///home/wilkin/proyectos/Asados/src/app/api/webhooks/whatsapp/route.ts) | Webhook handler (Meta format only) | **High**: needs separate Evolution webhook route or format detection |
| [sistema.ts](file:///home/wilkin/proyectos/Asados/src/lib/config/sistema.ts) | System config reader | Low: already generic, reads any key from `configuracoes_sistema` |
| **New file**: `src/lib/whatsapp/evolution.ts` | Evolution API client | New: send messages via Evolution API |
| **New file**: `src/lib/whatsapp/provider.ts` | Provider factory/router | New: routes send/receive to active provider |
| **New file**: `src/app/api/webhooks/evolution/route.ts` | Evolution webhook handler | New: receives messages from Evolution API |

#### Current WhatsApp architecture:
```
Meta Cloud API → POST /api/webhooks/whatsapp → route.ts (HMAC validation, parse Meta payload)
Outbound: send.ts → calls Meta Graph API https://graph.facebook.com/v18.0/{phoneId}/messages
Config: reads WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID from configuracoes_sistema
Mock mode: detects placeholder tokens, generates fake wamid
```

#### Target architecture:
```
                    ┌─── Meta Cloud API ──→ /api/webhooks/whatsapp (existing)
Inbound messages ───┤
                    └─── Evolution API ──→ /api/webhooks/evolution (new)
                              ↓
                    Unified message processing pipeline
                              ↓
                    ┌─── Meta provider (existing send.ts logic)
Outbound messages ──┤   (checks WHATSAPP_PROVIDER config)
                    └─── Evolution provider (new evolution.ts)
```

#### Docker Compose changes:
```yaml
# Current: only asados-web on port 3020
# Target: add evolution-api service
services:
  web: (existing)
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - AUTHENTICATION_API_KEY=...
      - SERVER_URL=https://casadeasados.duckdns.org/evolution
    volumes:
      - evolution_store:/evolution/store
```

### Area 4: Database Schema

| Table | Change |
|-------|--------|
| `configuracoes_sistema` | New keys: `WHATSAPP_PROVIDER` (`meta`\|`evolution`), `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY` |

No schema migration needed — `configuracoes_sistema` is key-value based. New keys are inserted via upsert by admin dashboard.

---

## Approaches

### Approach A: Incremental (3 phases, recommended)

**Phase 1 — Email Fix + i18n** (low risk, high impact)
- Update Supabase Dashboard: `site_url`, email template
- Translate `/verificar-email` page from Spanish to pt-BR
- Complexity: Simple
- Risk: Very low (can be done independently)

**Phase 2 — Dashboard Reorganization** (medium risk)
- Extract Integrações tab content into 5 separate card components
- Add per-card save and test handlers
- Add new fields for Evolution API and MercadoPago
- Add WHATSAPP_PROVIDER toggle switch
- Update SSR loader to pass new config keys
- Complexity: Medium (AdminDashboard.tsx is 74KB monolith)
- Risk: Medium (large component, many state variables)

**Phase 3 — Evolution API Integration** (high complexity)
- Add Evolution API to Docker Compose
- Create provider abstraction layer
- Create Evolution webhook handler
- Update Nginx for Evolution API routing
- Create QR code display in dashboard
- Complexity: High
- Risk: High (new infrastructure, dual-provider coexistence)

### Approach B: Big Bang (all at once)

Implement everything in a single change. Faster but riskier. Not recommended due to the number of moving parts (auth, UI, Docker, new API integration).

---

## Recommendation

**Use Approach A (Incremental, 3 phases).**

Key rationale:
1. **Phase 1** fixes a user-facing bug (broken email confirmation) and can be deployed immediately
2. **Phase 2** is a pure UI refactor with no backend schema changes, testable in isolation
3. **Phase 3** is the most complex and benefits from having the dashboard cards already in place

For the dashboard refactor, consider extracting each card into its own component file under `src/components/operator/integrations/` to prevent `AdminDashboard.tsx` from growing further (already 74KB).

The `WHATSAPP_PROVIDER` config key should default to `meta` to ensure zero disruption to the existing flow.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Supabase Dashboard changes are out-of-band** — email template and site_url cannot be version-controlled in codebase | Medium | Document steps in runbook; provide template HTML in `docs/` |
| **AdminDashboard.tsx is a 74KB monolith** — any refactor risks regressions in other tabs | Medium | Extract integration cards into separate components; test each tab after changes |
| **Evolution API version compatibility** — Evolution API updates frequently with breaking changes | High | Pin Docker image version; implement health check endpoint |
| **Dual WhatsApp provider coexistence** — switching providers mid-conversation could lose context | High | Only allow provider switch when no active conversations; warn in UI |
| **Webhook signature validation** — Evolution API uses different auth than Meta HMAC-SHA256 | Medium | Separate webhook route (`/api/webhooks/evolution`) with its own validation |
| **Nginx routing for Evolution API** — if exposed on same domain, needs `/evolution` path prefix | Low | Add location block in nginx.conf for Evolution API proxying |
| **Media download hardcoded to Meta token** — webhook L278 uses `process.env.WHATSAPP_ACCESS_TOKEN` instead of `obterConfiguracaoSistema()` | Medium | Fix in Phase 3 to use config reader; this is also a pre-existing bug |

### Pre-existing bug found:
- [whatsapp/route.ts L278](file:///home/wilkin/proyectos/Asados/src/app/api/webhooks/whatsapp/route.ts#L278): Media download uses `process.env.WHATSAPP_ACCESS_TOKEN` directly instead of `obterConfiguracaoSistema('WHATSAPP_ACCESS_TOKEN')`, bypassing the dynamic config system introduced in Épica 8. This means changing the token via dashboard won't affect media downloads until the server restarts.

---

## Next Recommended

1. **Create spec** — Write the detailed implementation spec for Phase 1 (email fix + i18n)
2. **Create spec** — Write the detailed implementation spec for Phase 2 (dashboard reorganization)
3. **Create spec** — Write the detailed implementation spec for Phase 3 (Evolution API)
4. **Document Supabase Dashboard steps** — Create a runbook for the manual Supabase configuration changes
5. **Create pt-BR email template HTML** — Design branded HTML email for the confirmation flow

---

## File Inventory

### Files to MODIFY:
| File | Lines | Purpose |
|------|-------|---------|
| [verificar-email/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/verificar-email/page.tsx) | 122 | Translate Spanish → pt-BR |
| [AdminDashboard.tsx](file:///home/wilkin/proyectos/Asados/src/components/operator/AdminDashboard.tsx) | 1622 | Split Integrações into 5 cards, add Evolution/MP fields |
| [admin/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/atendimento/admin/page.tsx) | 160 | Load new config keys (Evolution, MP, WHATSAPP_PROVIDER) |
| [admin.ts](file:///home/wilkin/proyectos/Asados/src/app/actions/admin.ts) | 814 | Add test actions for Evolution API, MercadoPago |
| [send.ts](file:///home/wilkin/proyectos/Asados/src/lib/whatsapp/send.ts) | 217 | Add provider routing (Meta vs Evolution) |
| [whatsapp/route.ts](file:///home/wilkin/proyectos/Asados/src/app/api/webhooks/whatsapp/route.ts) | 414 | Fix L278 env bug; keep for Meta |
| [docker-compose.yml](file:///home/wilkin/proyectos/Asados/docker-compose.yml) | 15 | Add evolution-api service |
| [nginx.conf](file:///home/wilkin/proyectos/Asados/nginx.conf) | 72 | Add Evolution API proxy location |

### Files to CREATE:
| File | Purpose |
|------|---------|
| `src/lib/whatsapp/evolution.ts` | Evolution API client (send messages, manage instance) |
| `src/lib/whatsapp/provider.ts` | Provider abstraction/factory |
| `src/app/api/webhooks/evolution/route.ts` | Evolution API webhook handler |
| `src/components/operator/integrations/LlmApiCard.tsx` | LLM management card component |
| `src/components/operator/integrations/MetaWhatsAppCard.tsx` | Meta WhatsApp management card |
| `src/components/operator/integrations/EvolutionApiCard.tsx` | Evolution API management card (QR code) |
| `src/components/operator/integrations/GoogleCalendarCard.tsx` | Google Calendar card (extract from monolith) |
| `src/components/operator/integrations/MercadoPagoCard.tsx` | MercadoPago management card |
| `docs/supabase-email-setup.md` | Runbook for Supabase Dashboard config |
| `docs/templates/email-confirmacao.html` | pt-BR branded email template |
| `supabase/migrations/20260706_epica9_*.sql` | Migration for new config defaults (optional) |

### External (non-code) changes:
- **Supabase Dashboard** → Authentication → URL Configuration → Set `Site URL` to `https://casadeasados.duckdns.org`
- **Supabase Dashboard** → Authentication → Email Templates → Override "Confirm signup" with pt-BR branded HTML
- **Supabase Dashboard** → Authentication → URL Configuration → Add `https://casadeasados.duckdns.org/**` to Redirect URLs
