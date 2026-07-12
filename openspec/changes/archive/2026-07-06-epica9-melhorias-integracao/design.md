# Technical Design: epica9-melhorias-integracao

**Status:** `complete`
**Date:** 2026-07-06
**Change:** Épica 9 — Melhorias de Integração

---

## 1. Email Confirmation Architecture

### 1.1 Supabase Dashboard Changes (External — 3 steps)

| # | Setting | Location | Value |
|---|---------|----------|-------|
| 1 | `Site URL` | Auth → URL Configuration | `https://casadeasados.duckdns.org` |
| 2 | `Redirect URLs` | Auth → URL Configuration | Add `https://casadeasados.duckdns.org/**` |
| 3 | Email Template | Auth → Email Templates → "Confirm signup" | Replace with pt-BR branded HTML (see §1.2) |

These are **non-code** changes. A runbook will be created at `docs/supabase-email-setup.md` with screenshots.

### 1.2 pt-BR Email Template Design

Store at `docs/templates/email-confirmacao.html`. Structure:

```
┌──────────────────────────────────────────┐
│  [Asados Sofía Logo — 🔥 gradient icon]  │
│  Fundo: bg-zinc-950 (#09090b)            │
├──────────────────────────────────────────┤
│  Olá, {{ .Email }}!                      │
│                                          │
│  Obrigado por se cadastrar na            │
│  Casa de Asados.                         │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  CONFIRMAR MEU E-MAIL             │  │
│  │  (CTA: amber-500 → red-600        │  │
│  │   gradient, white text)            │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Ou copie o link:                        │
│  {{ .ConfirmationURL }}                  │
│                                          │
│  Este link expira em 24 horas.           │
├──────────────────────────────────────────┤
│  © 2026 Casa de Asados · Curitiba, PR   │
│  text-zinc-500, font-size: 12px         │
└──────────────────────────────────────────┘
```

**Colors:** amber-500 `#f59e0b`, red-600 `#dc2626`, zinc-950 `#09090b`, zinc-400 `#a1a1aa`. Use inline CSS only (email compatibility). Max width 600px. Must include `{{ .ConfirmationURL }}` Supabase variable.

### 1.3 verificar-email Page Translation

[page.tsx](file:///home/wilkin/proyectos/Asados/src/app/verificar-email/page.tsx) — translate 6 Spanish strings to pt-BR:

| Line | Current (Spanish) | Target (pt-BR) |
|------|--------------------|-----------------|
| L42 | `¡Email Verificado!` | `E-mail Verificado!` |
| L44 | `Tu dirección de correo electrónico ha sido confirmada…` | `Seu endereço de e-mail foi confirmado com sucesso. Você já pode acessar todos os serviços da churrascaria.` |
| L52 | `Continuar` | `Continuar` (same) |
| L67 | `Error de Verificación` | `Erro de Verificação` |
| L69 | `No pudimos verificar…` | `Não foi possível verificar seu e-mail. O link pode ter expirado ou já ter sido utilizado.` |
| L77,101 | `Volver al Login` | `Voltar ao Login` |
| L91 | `Verificá tu Correo` | `Verifique seu E-mail` |
| L93 | `Te enviamos un enlace…` | `Enviamos um link de ativação para seu e-mail. Verifique sua caixa de entrada (e a pasta de spam) e clique no link para confirmar sua conta.` |

---

## 2. Dashboard Card Component Architecture

### 2.1 Extraction Strategy

Replace the monolithic form at [AdminDashboard.tsx L954-L1193](file:///home/wilkin/proyectos/Asados/src/components/operator/AdminDashboard.tsx#L954-L1193) and the Calendar card at [L1196-L1300](file:///home/wilkin/proyectos/Asados/src/components/operator/AdminDashboard.tsx#L1196-L1300) with 5 independent card components under `src/components/operator/integrations/`.

### 2.2 Shared Props Interface

```typescript
// src/components/operator/integrations/types.ts

interface IntegrationCardProps {
  initialConfigs: Record<string, string>  // subset of systemConfigs
  showToast: (type: 'success' | 'error', msg: string) => void
}

// Extended per card:
interface CalendarCardProps extends IntegrationCardProps {
  calendarConfig: CalendarConfig
}

interface EvolutionCardProps extends IntegrationCardProps {
  provedorAtivo: 'meta' | 'evolution'
  onProvedorChange: (provider: 'meta' | 'evolution') => void
}
```

Each card manages its own `useState` for field values, loading, test results, and save status. No shared form state.

### 2.3 Card Breakdown

| Card Component | Config Keys | Save Action | Test Action |
|----------------|-------------|-------------|-------------|
| `LlmApiCard` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | `salvarConfiguracaoAdmin` × 2 | `testarConexaoLLM` |
| `MetaWhatsAppCard` | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | `salvarConfiguracaoAdmin` × 4 | `testarConexaoMeta` |
| `EvolutionApiCard` | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `WHATSAPP_PROVIDER` | `salvarConfiguracaoAdmin` × 4 | `testarConexaoEvolution` ★ new |
| `GoogleCalendarCard` | read-only from `calendarConfig` prop | none | `testarConexaoCalendar` |
| `MercadoPagoCard` | `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY` | `salvarConfiguracaoAdmin` × 2 | `testarConexaoMercadoPago` ★ new |

### 2.4 WHATSAPP_PROVIDER Toggle

Lives in `EvolutionApiCard`. Toggle switch between `meta` and `evolution`:

```
┌─ Provedor Ativo ──────────────────────┐
│  ○ Meta Cloud API   ● Evolution API   │
│  (saves WHATSAPP_PROVIDER on change)  │
└───────────────────────────────────────┘
```

- Default value: `meta` (no disruption to existing flow)
- On toggle: calls `salvarConfiguracaoAdmin('WHATSAPP_PROVIDER', value)` immediately
- Shows warning toast when switching: "Trocar provedor afeta o envio de mensagens imediatamente"
- `onProvedorChange` callback notifies parent so `MetaWhatsAppCard` can show visual indicator of active/inactive state

### 2.5 SSR Loader Update

[admin/page.tsx L69-L76](file:///home/wilkin/proyectos/Asados/src/app/atendimento/admin/page.tsx#L69-L76) — expand `systemConfigs` initial keys:

```typescript
const systemConfigs: Record<string, string> = {
  // existing 6 keys...
  EVOLUTION_API_URL: '',
  EVOLUTION_API_KEY: '',
  EVOLUTION_INSTANCE_NAME: '',
  WHATSAPP_PROVIDER: 'meta',        // default
  MERCADO_PAGO_ACCESS_TOKEN: '',
  MERCADO_PAGO_PUBLIC_KEY: '',
}
```

The existing `dbConfigs.forEach` loop at L78-82 already populates any key dynamically, so no structural change needed — just add default entries.

### 2.6 AdminDashboard Props Update

Extend `AdminDashboardProps.systemConfigs` to include the 6 new keys. The Integrações tab JSX at L944-L1301 is replaced with:

```tsx
<LlmApiCard initialConfigs={systemConfigs} showToast={showToast} />
<MetaWhatsAppCard initialConfigs={systemConfigs} showToast={showToast} />
<EvolutionApiCard initialConfigs={systemConfigs} showToast={showToast}
  provedorAtivo={provedorAtivo} onProvedorChange={setProvedorAtivo} />
<GoogleCalendarCard initialConfigs={systemConfigs} showToast={showToast}
  calendarConfig={calendarConfig} />
<MercadoPagoCard initialConfigs={systemConfigs} showToast={showToast} />
```

The parent `AdminDashboard` holds `provedorAtivo` state (initialized from `systemConfigs.WHATSAPP_PROVIDER || 'meta'`) to coordinate visual indicators between Meta and Evolution cards.

---

## 3. Evolution API Docker & Provider Abstraction

### 3.1 Docker Compose

Add to [docker-compose.yml](file:///home/wilkin/proyectos/Asados/docker-compose.yml):

```yaml
evolution-api:
  image: atendai/evolution-api:v2.2.3    # pinned version
  container_name: evolution-api
  restart: always
  ports:
    - "8080:8080"
  environment:
    - AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}
    - SERVER_URL=https://casadeasados.duckdns.org/evolution
    - DEL_INSTANCE=false
  volumes:
    - evolution_store:/evolution/store

volumes:
  evolution_store:
```

**Decision:** Pin `v2.2.3` instead of `latest` — Evolution API breaks across majors. Update intentionally.

### 3.2 Nginx Location Block

Add to [nginx.conf](file:///home/wilkin/proyectos/Asados/nginx.conf) inside the `server 443` block, before `location /`:

```nginx
location /evolution/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 3.3 Provider Abstraction

```
src/lib/whatsapp/
├── send.ts          # existing — becomes Meta-only sender
├── evolution.ts     # new — Evolution API client
└── provider.ts      # new — factory/router
```

**`provider.ts`** — factory pattern:

```
obterConfiguracaoSistema('WHATSAPP_PROVIDER')
       │
       ├── 'meta' ──→ enviarMensagemMeta()    (existing send.ts logic)
       └── 'evolution' ──→ enviarMensagemEvolution() (new evolution.ts)
```

The public API stays `enviarMensagemWhatsapp(conversaId, payload)` — `provider.ts` re-exports it, reads the config key, and delegates. Callers don't change.

**`evolution.ts`** exports:

| Function | Purpose |
|----------|---------|
| `enviarMensagemEvolution(conversaId, payload)` | Send text/media via Evolution REST API |
| `obterQrCode(apiUrl, apiKey, instanceName)` | GET `/instance/connect/{name}` → base64 QR |
| `verificarStatusInstancia(apiUrl, apiKey, instanceName)` | GET `/instance/connectionState/{name}` |
| `enviarTextoEvolution(instanceName, phone, text)` | POST `/message/sendText/{name}` |

### 3.4 Evolution Webhook

New route: `src/app/api/webhooks/evolution/route.ts`

```
Evolution API → POST /api/webhooks/evolution
                      │
                      ├── Validate: apikey header matches EVOLUTION_API_KEY
                      ├── Parse: Evolution payload format
                      ├── Normalize: convert to same internal structure
                      │   as Meta handler (telefone, conteudo, tipo_midia, etc.)
                      └── Insert into mensagens + update conversa
                          (reuse existing message processing pipeline)
```

**Auth:** Evolution uses `apikey` header, NOT HMAC-SHA256 like Meta. Separate validation.

### 3.5 Bug Fix: route.ts L278

[whatsapp/route.ts L278](file:///home/wilkin/proyectos/Asados/src/app/api/webhooks/whatsapp/route.ts#L278) uses `process.env.WHATSAPP_ACCESS_TOKEN` directly. Fix:

```diff
- const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
+ const accessToken = await obterConfiguracaoSistema('WHATSAPP_ACCESS_TOKEN')
```

This aligns media downloads with the dynamic config system from Épica 8.

---

## 4. Server Actions

Add to [admin.ts](file:///home/wilkin/proyectos/Asados/src/app/actions/admin.ts):

| Action | Signature | Implementation |
|--------|-----------|----------------|
| `testarConexaoEvolution` | `(apiUrl: string, apiKey: string, instanceName: string)` | GET `{apiUrl}/instance/connectionState/{instanceName}` with `apikey` header |
| `obterQrCodeEvolution` | `(apiUrl: string, apiKey: string, instanceName: string)` | GET `{apiUrl}/instance/connect/{instanceName}` → returns `{ qrcode: base64 }` |
| `testarConexaoMercadoPago` | `(accessToken: string)` | GET `https://api.mercadopago.com/v1/payment_methods` with Bearer token — validates 200 OK |

All three follow the existing pattern: `verificarPermissaoOperador()` guard → try/catch → return `{ success, error?, ...data }`.

---

## Design Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Card state management | Each card manages own `useState` | Eliminates cross-card coupling; simpler than shared reducer for independent forms |
| Provider toggle location | Inside `EvolutionApiCard` | Natural home — you configure Evolution, then activate it |
| Evolution Docker version | Pinned `v2.2.3` | `latest` tag has caused breaking changes; explicit upgrade path |
| Webhook route separation | Separate `/api/webhooks/evolution` | Different auth mechanism; cleaner than format detection in single route |
| provider.ts re-export | Wraps existing `enviarMensagemWhatsapp` name | Zero changes needed in callers (OperatorChatConsole, AI pipeline) |

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| AdminDashboard extraction breaks other tabs | Medium | Extract only Integrações JSX (L954-L1301); other tabs untouched |
| Evolution API container doesn't start | Medium | Health check in docker-compose; `testarConexaoEvolution` action validates connectivity |
| Provider switch mid-conversation | High | Default to `meta`; toast warning on switch; future: block switch if active conversations exist |
| Email template Supabase variables | Low | Use standard `{{ .ConfirmationURL }}` and `{{ .Email }}` — documented in Supabase docs |

---

## File Impact Summary

| File | Action | Lines affected |
|------|--------|----------------|
| `src/app/verificar-email/page.tsx` | Modify | ~20 (string translations) |
| `src/components/operator/AdminDashboard.tsx` | Modify | ~360 (remove L954-L1301, replace with card imports) |
| `src/components/operator/integrations/types.ts` | Create | ~25 |
| `src/components/operator/integrations/LlmApiCard.tsx` | Create | ~120 |
| `src/components/operator/integrations/MetaWhatsAppCard.tsx` | Create | ~130 |
| `src/components/operator/integrations/EvolutionApiCard.tsx` | Create | ~160 |
| `src/components/operator/integrations/GoogleCalendarCard.tsx` | Create | ~100 |
| `src/components/operator/integrations/MercadoPagoCard.tsx` | Create | ~100 |
| `src/app/atendimento/admin/page.tsx` | Modify | ~10 (add config defaults) |
| `src/app/actions/admin.ts` | Modify | ~80 (3 new actions) |
| `src/lib/whatsapp/provider.ts` | Create | ~50 |
| `src/lib/whatsapp/evolution.ts` | Create | ~120 |
| `src/app/api/webhooks/evolution/route.ts` | Create | ~150 |
| `src/app/api/webhooks/whatsapp/route.ts` | Modify | ~5 (L278 bug fix) |
| `docker-compose.yml` | Modify | ~15 |
| `nginx.conf` | Modify | ~8 |
| `docs/supabase-email-setup.md` | Create | ~40 |
| `docs/templates/email-confirmacao.html` | Create | ~80 |
