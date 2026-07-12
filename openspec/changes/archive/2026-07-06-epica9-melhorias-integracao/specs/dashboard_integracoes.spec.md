# Specification: dashboard_integracoes

**Domain:** `dashboard_integracoes`
**Change:** `epica9-melhorias-integracao`
**Phase:** Phase 2 — Dashboard Reorganization
**Status:** `approved`
**Date:** 2026-07-06

---

## 1. Overview

This domain restructures the monolithic "Integrações" tab in `AdminDashboard.tsx` from a single `<form>` with one "Salvar Integrações" button into 5 independent management cards, each with its own Save/Test actions. New cards are introduced for Evolution API (WhatsApp QR) and Mercado Pago. Each card is extracted into a separate component file under `src/components/operator/integrations/`.

### Scope

| Item | In Scope | Out of Scope |
|------|----------|--------------|
| Extract existing LLM fields into `LlmApiCard` component | ✅ | |
| Extract existing Meta WhatsApp fields into `MetaWhatsAppCard` component | ✅ | |
| Create new Evolution API card with QR display | ✅ | Evolution API send/receive logic (Phase 3) |
| Extract existing Google Calendar card into component | ✅ | |
| Create new Mercado Pago card | ✅ | Payment processing logic |
| WHATSAPP_PROVIDER toggle switch | ✅ | Provider routing logic (Phase 3) |
| SSR data loading for new config keys | ✅ | |
| New server actions for save/test | ✅ | |

---

## 2. Component Architecture

### 2.1 Directory Structure

**REQ-DASH-001**: All integration card components MUST be placed under `src/components/operator/integrations/`.

```
src/components/operator/integrations/
├── LlmApiCard.tsx
├── MetaWhatsAppCard.tsx
├── EvolutionApiCard.tsx
├── GoogleCalendarCard.tsx
├── MercadoPagoCard.tsx
└── index.ts              (barrel export)
```

### 2.2 Shared Card Contract

**REQ-DASH-002**: Each card component MUST follow a consistent interface pattern:

| Prop | Type | Description |
|------|------|-------------|
| `configInicial` | `Record<string, string>` | Initial config values from SSR |
| `onToastMessage` | `(tipo: 'success' \| 'error', msg: string) => void` | Toast callback |

**REQ-DASH-003**: Each card MUST be a self-contained React component managing its own local state (form values, loading, test results).

**REQ-DASH-004**: Each card MUST NOT depend on or modify state of other cards.

---

## 3. Card Specifications

### 3.1 Card 1: Gestão LLM API (Modelo da Sofía)

**REQ-DASH-010**: The LLM API card MUST manage the following configuration keys:

| Key | Input Type | Mask | Description |
|-----|-----------|------|-------------|
| `OPENROUTER_API_KEY` | password (toggleable) | `sk-or-...` | API key for OpenRouter or DeepSeek |
| `OPENROUTER_MODEL` | select dropdown | — | Active LLM model ID |

**REQ-DASH-011**: The card MUST provide these action buttons:

| Button | Label (pt-BR) | Action |
|--------|---------------|--------|
| Test | `Testar Conexão LLM` | Calls `testarConexaoLLM(apiKey, model)` server action |
| Sync | `Sincronizar Modelos` | Calls `obterModelosDisponiveis(apiKey)` server action |
| Save | `Salvar LLM` | Calls `salvarConfiguracaoSistema()` for `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` only |

**REQ-DASH-012**: The model dropdown MUST auto-load available models on mount when `OPENROUTER_API_KEY` is present and valid.

**REQ-DASH-013**: The model dropdown MUST show a default list when no API key is configured:
- `google/gemini-2.5-flash`
- `google/gemini-2.5-pro`
- `deepseek/deepseek-chat`
- `meta-llama/llama-3.3-70b-instruct`

**REQ-DASH-014**: The test result MUST display inline below the action buttons with success (green) or error (red) styling.

### 3.2 Card 2: Gestão WhatsApp API (Meta Cloud)

**REQ-DASH-020**: The Meta WhatsApp card MUST manage the following configuration keys:

| Key | Input Type | Mask | Description |
|-----|-----------|------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | password (toggleable) | `EAA...` | Meta Graph API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | text | — | Meta phone number ID |
| `WHATSAPP_APP_SECRET` | password (toggleable) | — | Meta app secret for webhook HMAC |
| `WHATSAPP_VERIFY_TOKEN` | password (toggleable) | — | Webhook verification token |

**REQ-DASH-021**: The card MUST provide these action buttons:

| Button | Label (pt-BR) | Action |
|--------|---------------|--------|
| Test | `Testar Conexão Meta` | Calls `testarConexaoMeta()` server action |
| Save | `Salvar WhatsApp Meta` | Calls `salvarConfiguracaoSistema()` for the 4 Meta keys only |

**REQ-DASH-022**: The card MUST display a visual indicator of connection status (connected/disconnected badge) based on test results or initial config presence.

### 3.3 Card 3: Gestão WhatsApp QR (Evolution API)

**REQ-DASH-030**: The Evolution API card MUST manage the following configuration keys:

| Key | Input Type | Mask | Description |
|-----|-----------|------|-------------|
| `EVOLUTION_API_URL` | text | `https://...` | Evolution API base URL |
| `EVOLUTION_API_KEY` | password (toggleable) | — | Evolution API authentication key |
| `EVOLUTION_INSTANCE_NAME` | text | — | Evolution instance name |

**REQ-DASH-031**: The card MUST include a QR code display area:

- **Initial state:** Show placeholder text "Nenhuma instância conectada. Configure as credenciais e teste a conexão."
- **After successful test:** Display the QR code image returned by the Evolution API
- **QR rendering:** Use a `<img>` tag with the base64 QR data from the Evolution API response
- **Refresh:** A "Atualizar QR Code" button MUST allow manual refresh of the QR image

**REQ-DASH-032**: The card MUST provide these action buttons:

| Button | Label (pt-BR) | Action |
|--------|---------------|--------|
| Test | `Testar Conexão Evolution` | Calls `testarConexaoEvolution()` server action (Phase 3 implements the actual test logic) |
| Save | `Salvar Evolution API` | Calls `salvarConfiguracaoSistema()` for the 3 Evolution keys only |
| QR Refresh | `Atualizar QR Code` | Fetches fresh QR from Evolution API |

**REQ-DASH-033**: The card MUST include the WHATSAPP_PROVIDER toggle switch:

| Aspect | Requirement |
|--------|-------------|
| Position | Bottom of the Evolution API card, visually separated by a divider |
| Label | `Provedor Ativo de WhatsApp` |
| Options | `Meta Cloud API` (value: `meta`) / `Evolution API` (value: `evolution`) |
| Default | `meta` |
| Config key | `WHATSAPP_PROVIDER` |
| Visual | Toggle/switch component, NOT a dropdown |
| Save behavior | Persists immediately on toggle via `salvarConfiguracaoSistema('WHATSAPP_PROVIDER', value)` |

**REQ-DASH-034**: When the provider toggle is switched, the card MUST display a confirmation warning:

```
Atenção: Alterar o provedor de WhatsApp afetará o envio e recebimento de mensagens imediatamente.
Tem certeza que deseja continuar?
```

**REQ-DASH-035**: The Evolution API card MUST display a status badge indicating which provider is currently active:
- When `meta` is active: Badge text "Meta Cloud API ativa" (blue badge)
- When `evolution` is active: Badge text "Evolution API ativa" (green badge)

### 3.4 Card 4: Gestão Google Calendar API

**REQ-DASH-040**: The Google Calendar card MUST be extracted from the current monolith with NO functional changes.

**REQ-DASH-041**: The card MUST display the following read-only fields:

| Field | Display | Source |
|-------|---------|--------|
| `GOOGLE_CALENDAR_ID` | Masked text (`calend****@group.calendar.google.com`) | `calendarConfig.googleCalendarId` |
| `GOOGLE_CLIENT_EMAIL` | Masked text (`servi****@project.iam.gserviceaccount.com`) | `calendarConfig.googleClientEmail` |
| `GOOGLE_PRIVATE_KEY` | Status badge (Configured/Not Configured) | `calendarConfig.googlePrivateKeyConfigured` |

**REQ-DASH-042**: The card MUST provide a single "Testar Conexão" button that calls the existing `testarConexaoCalendar()` server action.

**REQ-DASH-043**: The card MUST NOT have a Save button (values come from `.env`, not editable via dashboard).

### 3.5 Card 5: Gestão Mercado Pago API

**REQ-DASH-050**: The Mercado Pago card MUST manage the following configuration keys:

| Key | Input Type | Mask | Description |
|-----|-----------|------|-------------|
| `MERCADO_PAGO_ACCESS_TOKEN` | password (toggleable) | `APP_USR-...` | Mercado Pago access token |
| `MERCADO_PAGO_PUBLIC_KEY` | password (toggleable) | `APP_USR-...` | Mercado Pago public key |

**REQ-DASH-051**: The card MUST provide these action buttons:

| Button | Label (pt-BR) | Action |
|--------|---------------|--------|
| Test | `Testar Conexão Mercado Pago` | Calls `testarConexaoMercadoPago()` server action |
| Save | `Salvar Mercado Pago` | Calls `salvarConfiguracaoSistema()` for the 2 MP keys only |

**REQ-DASH-052**: The test action MUST call the Mercado Pago API endpoint `GET https://api.mercadopago.com/v1/payment_methods` with the provided access token and validate the response.

---

## 4. Server-Side Changes

### 4.1 SSR Data Loader (`admin/page.tsx`)

**REQ-DASH-060**: The `systemConfigs` record MUST be expanded to include new keys:

```
OPENROUTER_API_KEY         (existing)
OPENROUTER_MODEL           (existing)
WHATSAPP_ACCESS_TOKEN      (existing)
WHATSAPP_PHONE_NUMBER_ID   (existing)
WHATSAPP_APP_SECRET        (existing)
WHATSAPP_VERIFY_TOKEN      (existing)
EVOLUTION_API_URL           (new)
EVOLUTION_API_KEY           (new)
EVOLUTION_INSTANCE_NAME     (new)
WHATSAPP_PROVIDER           (new, default: 'meta')
MERCADO_PAGO_ACCESS_TOKEN   (new)
MERCADO_PAGO_PUBLIC_KEY     (new)
```

**REQ-DASH-061**: The SSR loader MUST apply `process.env` fallback for new keys using the same pattern as existing keys.

### 4.2 Server Actions (`admin.ts`)

**REQ-DASH-062**: A new server action `testarConexaoMercadoPago(accessToken: string)` MUST be created that:
1. Calls `GET https://api.mercadopago.com/v1/payment_methods` with `Authorization: Bearer ${accessToken}`
2. Returns `{ success: true }` if HTTP 200 with valid JSON array
3. Returns `{ success: false, error: string }` on failure

**REQ-DASH-063**: A new server action `testarConexaoEvolution(apiUrl: string, apiKey: string, instanceName: string)` MUST be created that:
1. Calls `GET ${apiUrl}/instance/connectionState/${instanceName}` with `apikey: ${apiKey}` header
2. Returns `{ success: true, state: string }` on successful response
3. Returns `{ success: false, error: string }` on failure

**REQ-DASH-064**: A new server action `obterQrCodeEvolution(apiUrl: string, apiKey: string, instanceName: string)` MUST be created that:
1. Calls `GET ${apiUrl}/instance/connect/${instanceName}` with `apikey: ${apiKey}` header
2. Returns `{ success: true, qrcode: string }` with the base64 QR data
3. Returns `{ success: false, error: string }` on failure

**REQ-DASH-065**: The existing `salvarConfiguracaoSistema()` server action MUST continue to work with the new config keys without modification (it is generic key-value based).

---

## 5. AdminDashboard.tsx Refactoring

### 5.1 Integration Tab Replacement

**REQ-DASH-070**: The Integrações tab content (approximately lines 943–1301) MUST be replaced with rendered card components:

```tsx
{activeTab === 'integracoes' && (
  <div className="flex flex-col h-full space-y-6 overflow-y-auto max-w-4xl">
    <div>
      <h2>Integrações do Sistema</h2>
      <p>Monitore e gerencie as integrações externas...</p>
    </div>
    <LlmApiCard configInicial={systemConfigs} onToastMessage={showToast} />
    <MetaWhatsAppCard configInicial={systemConfigs} onToastMessage={showToast} />
    <EvolutionApiCard configInicial={systemConfigs} onToastMessage={showToast} />
    <GoogleCalendarCard calendarConfig={calendarConfig} onToastMessage={showToast} />
    <MercadoPagoCard configInicial={systemConfigs} onToastMessage={showToast} />
  </div>
)}
```

### 5.2 State Cleanup

**REQ-DASH-071**: The following state variables MUST be removed from `AdminDashboard.tsx` (moved into card components):

- `openrouterApiKey`, `setOpenrouterApiKey`
- `openrouterModel`, `setOpenrouterModel`
- `showOpenRouterApiKey`, `setShowOpenRouterApiKey`
- `whatsappAccessToken`, `setWhatsappAccessToken`
- `showWhatsappAccessToken`, `setShowWhatsappAccessToken`
- `whatsappPhoneNumberId`, `setWhatsappPhoneNumberId`
- `whatsappAppSecret`, `setWhatsappAppSecret`
- `showWhatsappAppSecret`, `setShowWhatsappAppSecret`
- `whatsappVerifyToken`, `setWhatsappVerifyToken`
- `showWhatsappVerifyToken`, `setShowWhatsappVerifyToken`
- `savingIntegrations`, `setSavingIntegrations`
- `llmModels`, `setLlmModels`
- `loadingModels`, `setLoadingModels`
- `testingLLM`, `setTestingLLM`
- `llmTestResult`, `setLlmTestResult`
- `testingMeta`, `setTestingMeta`
- `metaTestResult`, `setMetaTestResult`
- `testingCalendar`, `setTestingCalendar`
- `calendarTestResult`, `setCalendarTestResult`

**REQ-DASH-072**: The functions `handleSaveIntegrations`, `handleTestLLM`, `handleTestMeta`, `handleTestCalendar`, and `carregarModelos` MUST be removed from `AdminDashboard.tsx` (moved into respective card components).

---

## 6. Visual Design Requirements

**REQ-DASH-080**: Each card MUST maintain the existing dark-mode design system:
- Card container: `rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-6`
- Card header: Icon (amber-500) + title (font-bold text-zinc-200) + description (text-xs text-zinc-500)
- Input fields: `bg-zinc-900/40 border border-zinc-800 focus:border-amber-500/80 rounded-xl`
- Save button: `bg-amber-500 hover:bg-amber-600 font-bold text-zinc-950 rounded-xl`
- Test button: `bg-zinc-800 hover:bg-zinc-700 text-amber-500 rounded-lg`

**REQ-DASH-081**: Each card MUST include a card header with:
- An icon relevant to the integration (e.g., `Bot` for LLM, `MessageSquare` for WhatsApp, `QrCode` for Evolution, `Calendar` for Google, `CreditCard` for MercadoPago)
- A title in pt-BR
- A brief description in pt-BR

**REQ-DASH-082**: The WHATSAPP_PROVIDER toggle MUST use a custom switch/toggle component styled with:
- Track: `bg-zinc-800` (inactive), `bg-amber-500` (active)
- Thumb: white circle with smooth sliding animation
- Labels next to each end: "Meta" / "Evolution"

---

## 7. Files Affected

| File | Action | Description |
|------|--------|-------------|
| `src/components/operator/AdminDashboard.tsx` | MODIFY | Remove ~360 lines of Integrações tab code; replace with card component renders; remove related state and handlers |
| `src/components/operator/integrations/LlmApiCard.tsx` | CREATE | LLM management card (extracted + self-contained) |
| `src/components/operator/integrations/MetaWhatsAppCard.tsx` | CREATE | Meta WhatsApp management card (extracted + self-contained) |
| `src/components/operator/integrations/EvolutionApiCard.tsx` | CREATE | Evolution API card (new — QR display, provider toggle) |
| `src/components/operator/integrations/GoogleCalendarCard.tsx` | CREATE | Google Calendar card (extracted — read-only, test only) |
| `src/components/operator/integrations/MercadoPagoCard.tsx` | CREATE | Mercado Pago card (new — token management) |
| `src/components/operator/integrations/index.ts` | CREATE | Barrel exports for all card components |
| `src/app/atendimento/admin/page.tsx` | MODIFY | Expand `systemConfigs` with new keys + env fallbacks |
| `src/app/actions/admin.ts` | MODIFY | Add `testarConexaoMercadoPago`, `testarConexaoEvolution`, `obterQrCodeEvolution` server actions |

---

## 8. Acceptance Scenarios

### Scenario 1: LLM card saves independently

```gherkin
Given the operator is on the Integrações tab
  And the LLM API card displays OPENROUTER_API_KEY and OPENROUTER_MODEL fields
When the operator modifies the OPENROUTER_API_KEY value
  And clicks the "Salvar LLM" button
Then only the OPENROUTER_API_KEY and OPENROUTER_MODEL keys MUST be saved to configuracoes_sistema
  And no other integration keys MUST be affected
  And a success toast MUST be displayed
```

### Scenario 2: Meta WhatsApp card saves independently

```gherkin
Given the operator is on the Integrações tab
  And the Meta WhatsApp card displays 4 credential fields
When the operator modifies the WHATSAPP_ACCESS_TOKEN value
  And clicks the "Salvar WhatsApp Meta" button
Then only the 4 Meta WhatsApp keys MUST be saved
  And a success toast MUST be displayed
  And the LLM card fields MUST remain unchanged
```

### Scenario 3: Evolution API test returns QR code

```gherkin
Given the operator has configured EVOLUTION_API_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE_NAME
When the operator clicks "Testar Conexão Evolution"
Then the system MUST call the Evolution API connection state endpoint
  And if the instance is disconnected, the QR code area MUST display the returned QR image
  And if the instance is connected, a success badge MUST be displayed
```

### Scenario 4: Provider toggle switches and persists

```gherkin
Given the WHATSAPP_PROVIDER config key is currently "meta"
  And the provider toggle shows "Meta Cloud API" as active
When the operator toggles the switch to "Evolution API"
Then a confirmation warning MUST be displayed
  And upon confirmation, the WHATSAPP_PROVIDER key MUST be saved as "evolution"
  And the active provider badge MUST update to "Evolution API ativa"
```

### Scenario 5: Provider toggle defaults to meta

```gherkin
Given no WHATSAPP_PROVIDER key exists in configuracoes_sistema
When the Integrações tab is loaded
Then the provider toggle MUST default to "meta"
  And the badge MUST display "Meta Cloud API ativa"
```

### Scenario 6: Mercado Pago connection test succeeds

```gherkin
Given the operator has entered a valid Mercado Pago access token
When the operator clicks "Testar Conexão Mercado Pago"
Then the system MUST call GET https://api.mercadopago.com/v1/payment_methods with the token
  And on HTTP 200, display a success result with "Conexão bem-sucedida"
  And on failure, display an error result with the error message
```

### Scenario 7: Google Calendar card extracted without changes

```gherkin
Given the Google Calendar card was extracted from AdminDashboard.tsx
When the Integrações tab loads
Then the Google Calendar card MUST display identical content and behavior as before
  And GOOGLE_CALENDAR_ID MUST be displayed masked
  And GOOGLE_CLIENT_EMAIL MUST be displayed masked
  And GOOGLE_PRIVATE_KEY status badge MUST be visible
  And the "Testar Conexão" button MUST work as before
```

### Scenario 8: Card independence under concurrent edits

```gherkin
Given the operator has modified values in both the LLM and Meta WhatsApp cards
When the operator clicks "Salvar LLM" in the LLM card
Then only the LLM keys MUST be saved
  And the Meta WhatsApp card MUST still show the unsaved modified values
  And the Meta WhatsApp card MUST NOT be submitted
```

### Scenario 9: Integrações tab renders all 5 cards

```gherkin
Given the operator navigates to the Integrações tab
When the tab content loads
Then exactly 5 integration cards MUST be rendered in order:
  1. Gestão LLM API
  2. Gestão WhatsApp API (Meta Cloud)
  3. Gestão WhatsApp QR (Evolution API)
  4. Gestão Google Calendar API
  5. Gestão Mercado Pago API
  And each card MUST have its own visual boundary (card container)
```

---

## 9. Non-Functional Requirements

**REQ-DASH-090**: The refactored Integrações tab MUST NOT increase the initial bundle size of `AdminDashboard.tsx` — card components SHOULD be code-split via dynamic imports or separate module boundaries.

**REQ-DASH-091**: No other tabs (operadores, conhecimento, metricas, auditoria, prompt) MUST be affected by the refactoring.

**REQ-DASH-092**: The existing `showToast` mechanism in `AdminDashboard.tsx` MUST be passed to card components via the `onToastMessage` callback prop.
