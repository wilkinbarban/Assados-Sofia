# Specification: evolution_api

**Domain:** `evolution_api`
**Change:** `epica9-melhorias-integracao`
**Phase:** Phase 3 — Evolution API Integration
**Status:** `approved`
**Date:** 2026-07-06

---

## 1. Overview

This domain adds Evolution API as an alternative WhatsApp provider alongside the existing Meta Cloud API. It introduces a Docker Compose service, a provider abstraction layer for outbound messaging, a dedicated webhook endpoint for inbound messages, and Nginx reverse proxy routing. The existing Meta Cloud API integration MUST NOT be removed — both providers coexist, selected by the `WHATSAPP_PROVIDER` configuration key.

### Scope

| Item | In Scope | Out of Scope |
|------|----------|--------------|
| Docker Compose: add `evolution-api` service | ✅ | Kubernetes/Swarm orchestration |
| Provider abstraction layer (`provider.ts`) | ✅ | |
| Evolution API client (`evolution.ts`) | ✅ | |
| Evolution webhook handler (`/api/webhooks/evolution`) | ✅ | |
| Nginx location block for Evolution API | ✅ | |
| Fix pre-existing bug: media download using `process.env` instead of `obterConfiguracaoSistema()` | ✅ | |
| Dashboard QR code display logic | ✅ (via server actions from Phase 2) | |
| Meta Cloud API removal | ❌ MUST NOT happen | |

### Dependencies

- **Phase 2 (Dashboard Reorganization)** MUST be completed first — the Evolution API card and WHATSAPP_PROVIDER toggle MUST already exist in the dashboard.
- `configuracoes_sistema` keys (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `WHATSAPP_PROVIDER`) MUST be manageable via the dashboard.

---

## 2. Docker Compose Service

### 2.1 Service Definition

**REQ-EVO-001**: A new `evolution-api` service MUST be added to `docker-compose.yml` alongside the existing `web` service.

| Property | Value |
|----------|-------|
| Image | `atendai/evolution-api:v2.2.3` (pinned version, NOT `latest`) |
| Container name | `evolution-api` |
| Restart policy | `always` |
| Port mapping | `8080:8080` |
| Network | Same Docker network as `web` service |
| Volumes | `evolution_store:/evolution/store` |

**REQ-EVO-002**: The Evolution API service MUST be configured with the following environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `AUTHENTICATION_API_KEY` | `${EVOLUTION_API_KEY}` (from `.env`) | Authentication key for API calls |
| `SERVER_URL` | `https://casadeasados.duckdns.org/evolution` | Public URL for webhook callbacks |
| `SERVER_TYPE` | `http` | Server type |
| `SERVER_PORT` | `8080` | Internal port |
| `LOG_LEVEL` | `WARN` | Log verbosity |
| `DEL_INSTANCE` | `false` | Prevent automatic instance deletion |
| `DATABASE_ENABLED` | `false` | Use file-based storage (simpler for single-instance) |

**REQ-EVO-003**: A named volume `evolution_store` MUST be declared in the `volumes:` section of `docker-compose.yml` to persist Evolution API data across container restarts.

**REQ-EVO-004**: The Evolution API image version MUST be pinned to a specific tag (NOT `latest`) to prevent breaking changes from upstream updates.

---

## 3. Nginx Reverse Proxy

### 3.1 Evolution API Location Block

**REQ-EVO-010**: A new `location /evolution/` block MUST be added to the HTTPS server block in `nginx.conf`:

| Aspect | Requirement |
|--------|-------------|
| Path | `/evolution/` |
| Proxy target | `http://127.0.0.1:8080/` |
| Path rewriting | Strip `/evolution/` prefix before forwarding to Evolution API |
| WebSocket support | `Upgrade` and `Connection` headers MUST be forwarded |
| Standard proxy headers | `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` MUST be set |
| Timeouts | Same as existing `location /` block (60s each) |

**REQ-EVO-011**: The existing `location /` block MUST NOT be modified — it continues to proxy to the Next.js app on port 3020.

---

## 4. Provider Abstraction Layer

### 4.1 Provider Interface

**REQ-EVO-020**: A new file `src/lib/whatsapp/provider.ts` MUST define a provider abstraction with the following contract:

```typescript
interface ProvedorWhatsApp {
  enviarMensagemTexto(telefone: string, texto: string): Promise<ResultadoEnvio>
  enviarMensagemMidia(telefone: string, tipo: TipoMidia, urlMidia: string): Promise<ResultadoEnvio>
  enviarTemplate(telefone: string, nomeTemplate: string, parametros?: string[]): Promise<ResultadoEnvio>
}

interface ResultadoEnvio {
  sucesso: boolean
  mensagemId: string | null
  erro?: string
}

type TipoMidia = 'image' | 'audio' | 'document'
```

### 4.2 Provider Factory

**REQ-EVO-021**: The provider module MUST export a factory function:

```typescript
async function obterProvedorAtivo(): Promise<ProvedorWhatsApp>
```

- This function MUST read the `WHATSAPP_PROVIDER` key from `configuracoes_sistema` via `obterConfiguracaoSistema('WHATSAPP_PROVIDER')`
- If value is `'meta'` or `null` (not configured), MUST return the Meta Cloud API provider
- If value is `'evolution'`, MUST return the Evolution API provider
- MUST cache the provider instance for the duration of a single request (NOT across requests)

### 4.3 Meta Provider Extraction

**REQ-EVO-022**: The existing Meta Cloud API sending logic from `src/lib/whatsapp/send.ts` MUST be wrapped in a class/object implementing the `ProvedorWhatsApp` interface.

**REQ-EVO-023**: The existing `send.ts` MUST NOT be deleted — the `enviarMensagemWhatsapp()` function MUST be refactored to use `obterProvedorAtivo()` internally. This preserves backward compatibility with all existing callers.

### 4.4 Evolution Provider

**REQ-EVO-030**: A new file `src/lib/whatsapp/evolution.ts` MUST implement the `ProvedorWhatsApp` interface for Evolution API.

#### Text Message Sending

**REQ-EVO-031**: Text messages MUST be sent via:
```
POST ${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}
Headers: { apikey: EVOLUTION_API_KEY }
Body: { number: telefone, text: texto }
```

#### Media Message Sending

**REQ-EVO-032**: Media messages MUST be sent via:
```
POST ${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE_NAME}
Headers: { apikey: EVOLUTION_API_KEY }
Body: { number: telefone, mediatype: tipo, media: urlMidia }
```

#### Template Message Sending

**REQ-EVO-033**: Template messages via Evolution API MUST be sent using the text endpoint with a fallback format:
```
POST ${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}
Body: { number: telefone, text: "[Template: {nomeTemplate}] {parametros joined}" }
```

> **Note:** Evolution API (QR-based) does not support Meta-approved templates natively. Template messages SHOULD be documented as a limitation.

#### Mock Mode

**REQ-EVO-034**: The Evolution provider MUST support mock mode (same pattern as Meta provider). When `EVOLUTION_API_URL` or `EVOLUTION_API_KEY` contain placeholder values or are empty, the provider MUST generate a fake message ID and log a warning.

#### Configuration Reading

**REQ-EVO-035**: ALL Evolution API configuration values MUST be read via `obterConfiguracaoSistema()` (from `configuracoes_sistema` table), NOT from `process.env` directly.

---

## 5. Evolution API Webhook Handler

### 5.1 Route Definition

**REQ-EVO-040**: A new webhook handler MUST be created at `src/app/api/webhooks/evolution/route.ts`.

### 5.2 Authentication

**REQ-EVO-041**: The POST handler MUST validate incoming webhook requests using the `apikey` header:
1. Read the expected API key via `obterConfiguracaoSistema('EVOLUTION_API_KEY')`
2. Compare the request's `apikey` header with the stored key
3. Return HTTP 401 if they do not match

**REQ-EVO-042**: The webhook MUST NOT use Meta's HMAC-SHA256 validation — Evolution API uses API key header authentication.

### 5.3 Payload Processing

**REQ-EVO-043**: The webhook MUST handle the following Evolution API event types:

| Event | Action |
|-------|--------|
| `messages.upsert` | Process as incoming customer message |
| `connection.update` | Log connection state changes |
| `qrcode.updated` | Ignore (handled by dashboard polling) |

**REQ-EVO-044**: For `messages.upsert` events, the webhook MUST extract:

| Evolution API Field | Mapped To |
|--------------------|-----------|
| `data.key.remoteJid` | Customer phone number (strip `@s.whatsapp.net` suffix) |
| `data.message.conversation` or `data.message.extendedTextMessage.text` | Message text |
| `data.key.id` | `whatsapp_mensagem_id` |
| `data.messageTimestamp` | Message timestamp |
| `data.message.imageMessage`, `data.message.audioMessage`, `data.message.documentMessage` | Media attachment |

**REQ-EVO-045**: After extraction, the webhook MUST feed the message into the existing unified processing pipeline (same pipeline used by the Meta webhook handler: customer lookup/creation → conversation creation/lookup → message insert → AI processing trigger).

### 5.4 Media Download

**REQ-EVO-046**: For media messages received via Evolution API, the webhook MUST download media using:
```
GET ${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE_NAME}
Headers: { apikey: EVOLUTION_API_KEY }
Body: { message: { key: data.key } }
```

**REQ-EVO-047**: Downloaded media MUST be uploaded to the `chat-midias` Supabase Storage bucket following the same path pattern used by the Meta webhook: `{conversa_id}/{timestamp}_{filename}`.

### 5.5 LGPD Compliance

**REQ-EVO-048**: The Evolution webhook MUST use the same LGPD-compliant logging functions (`maskPhone`, `maskName`) as the Meta webhook. No PII SHALL appear in production logs.

---

## 6. Pre-existing Bug Fix

### 6.1 Media Download Token

**REQ-EVO-050**: In `src/app/api/webhooks/whatsapp/route.ts`, the media download at approximately line 278 MUST be fixed to use `obterConfiguracaoSistema('WHATSAPP_ACCESS_TOKEN')` instead of `process.env.WHATSAPP_ACCESS_TOKEN`.

**Rationale:** The dynamic config system introduced in Épica 8 allows changing the token via dashboard. Using `process.env` bypasses this and requires a server restart for changes to take effect.

---

## 7. Files Affected

| File | Action | Description |
|------|--------|-------------|
| `docker-compose.yml` | MODIFY | Add `evolution-api` service + `evolution_store` volume |
| `nginx.conf` | MODIFY | Add `location /evolution/` proxy block |
| `src/lib/whatsapp/provider.ts` | CREATE | Provider abstraction — interface + factory |
| `src/lib/whatsapp/evolution.ts` | CREATE | Evolution API client implementing ProvedorWhatsApp |
| `src/lib/whatsapp/send.ts` | MODIFY | Refactor to use provider abstraction internally |
| `src/app/api/webhooks/evolution/route.ts` | CREATE | Evolution API webhook handler |
| `src/app/api/webhooks/whatsapp/route.ts` | MODIFY | Fix media download env bug at ~L278 |

---

## 8. Acceptance Scenarios

### Scenario 1: Evolution API Docker service starts alongside web

```gherkin
Given the docker-compose.yml includes the evolution-api service
When the operator runs "docker compose up -d"
Then both "asados-web" and "evolution-api" containers MUST start
  And the evolution-api container MUST be accessible on port 8080
  And the evolution-api container MUST use the pinned image version
  And the evolution_store volume MUST be mounted
```

### Scenario 2: Nginx proxies Evolution API requests

```gherkin
Given Nginx is configured with the /evolution/ location block
When an HTTP request is made to "https://casadeasados.duckdns.org/evolution/instance/connectionState/casadeasados"
Then Nginx MUST proxy the request to "http://127.0.0.1:8080/instance/connectionState/casadeasados"
  And the /evolution/ prefix MUST be stripped from the forwarded path
```

### Scenario 3: Outbound message routes through active provider

```gherkin
Given WHATSAPP_PROVIDER is set to "evolution" in configuracoes_sistema
  And Evolution API credentials are configured
When the system calls enviarMensagemWhatsapp() to send a text message
Then the message MUST be sent via the Evolution API endpoint
  And the Meta Cloud API MUST NOT be called
  And the message MUST be saved to the mensagens table with the Evolution message ID
```

### Scenario 4: Outbound message defaults to Meta when provider not configured

```gherkin
Given WHATSAPP_PROVIDER is not set in configuracoes_sistema
When the system calls enviarMensagemWhatsapp() to send a text message
Then the message MUST be sent via the Meta Cloud API (existing behavior)
  And the Evolution API MUST NOT be called
```

### Scenario 5: Evolution webhook receives and processes text message

```gherkin
Given the Evolution API webhook endpoint is configured at /api/webhooks/evolution
  And a valid apikey header is provided
When Evolution API sends a messages.upsert webhook with a text message
Then the webhook MUST extract the phone number (stripping @s.whatsapp.net)
  And the webhook MUST extract the message text
  And the webhook MUST find or create the customer and conversation
  And the webhook MUST insert the message into the mensagens table
  And the webhook MUST trigger the AI processing pipeline
```

### Scenario 6: Evolution webhook rejects unauthorized requests

```gherkin
Given the Evolution API webhook endpoint is configured at /api/webhooks/evolution
When a POST request is made without an apikey header
Then the webhook MUST return HTTP 401
  And no message processing MUST occur
```

### Scenario 7: Evolution webhook rejects invalid API key

```gherkin
Given the Evolution API webhook endpoint is configured
When a POST request is made with an incorrect apikey header
Then the webhook MUST return HTTP 401
  And a warning MUST be logged (without PII)
```

### Scenario 8: Evolution webhook processes media message

```gherkin
Given the Evolution API sends a messages.upsert webhook with an imageMessage
When the webhook processes the event
Then the webhook MUST download the media via the Evolution API getBase64FromMediaMessage endpoint
  And the media MUST be uploaded to the chat-midias bucket
  And the message MUST be saved with the url_anexo field set
```

### Scenario 9: Provider abstraction mock mode for Evolution

```gherkin
Given WHATSAPP_PROVIDER is set to "evolution"
  And EVOLUTION_API_URL is empty or contains a placeholder value
When the system calls enviarMensagemWhatsapp()
Then the Evolution provider MUST operate in mock mode
  And a fake message ID MUST be generated (wamid.HBg... pattern)
  And a warning MUST be logged
  And the message MUST be saved to the database
```

### Scenario 10: Meta Cloud API continues working after Evolution integration

```gherkin
Given WHATSAPP_PROVIDER is set to "meta"
  And both Meta and Evolution API credentials are configured
When the system sends a message
Then ONLY the Meta Cloud API MUST be called
  And the Evolution API MUST NOT receive any outbound requests
  And the Meta webhook (/api/webhooks/whatsapp) MUST continue processing inbound Meta messages
```

### Scenario 11: Both webhooks operate simultaneously

```gherkin
Given both /api/webhooks/whatsapp and /api/webhooks/evolution routes exist
When Meta sends a webhook to /api/webhooks/whatsapp
  And Evolution sends a webhook to /api/webhooks/evolution simultaneously
Then both webhooks MUST process their respective messages independently
  And both MUST insert messages into the same mensagens table
  And both MUST trigger the same AI processing pipeline
```

### Scenario 12: Media download bug fix in Meta webhook

```gherkin
Given the Meta webhook handler processes an incoming media message
  And the WHATSAPP_ACCESS_TOKEN was recently changed via the admin dashboard
When the webhook downloads media from the Meta CDN
Then the token MUST be read from configuracoes_sistema via obterConfiguracaoSistema()
  And process.env.WHATSAPP_ACCESS_TOKEN MUST NOT be used directly
```

### Scenario 13: 24-hour window enforcement through provider abstraction

```gherkin
Given the 24-hour messaging window has expired for a conversation
  And WHATSAPP_PROVIDER is set to "evolution"
When the system attempts to send a free-form text message
Then the 24-hour window check MUST still be enforced
  And the system MUST throw "Janela de 24 horas excedida" error
  And no message MUST be sent to Evolution API
```

---

## 9. Non-Functional Requirements

**REQ-EVO-060**: The provider abstraction MUST NOT break backward compatibility — all existing callers of `enviarMensagemWhatsapp()` MUST continue to work without modification.

**REQ-EVO-061**: The Evolution API Docker container MUST be configured with a health check to enable monitoring.

**REQ-EVO-062**: The Evolution API image tag MUST be documented in a comment within `docker-compose.yml` explaining when and why to update it.

**REQ-EVO-063**: Evolution API webhook processing MUST complete within 5 seconds to avoid Evolution API retry storms.

**REQ-EVO-064**: All new TypeScript files MUST include JSDoc comments in pt-BR for exported functions and interfaces.

---

## 10. Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Evolution API (QR-based) does not support Meta-approved message templates | Template messages via Evolution will be sent as plain text | Document limitation; recommend Meta for businesses requiring templates |
| Switching providers mid-conversation may cause message delivery gaps | Messages in-flight at switch time may be lost | Provider toggle confirmation warning (Phase 2); recommend switching during off-hours |
| Evolution API uses phone number as identifier, Meta uses WhatsApp ID | Phone format normalization needed | Strip `@s.whatsapp.net` suffix in Evolution webhook; use `55...` format consistently |
