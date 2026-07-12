# Specification: autenticacao_email

**Domain:** `autenticacao_email`
**Change:** `epica9-melhorias-integracao`
**Phase:** Phase 1 — Email Confirmation Fix + i18n
**Status:** `approved`
**Date:** 2026-07-06

---

## 1. Overview

This domain fixes the broken email confirmation redirect (currently pointing to `localhost:3000`), translates all user-facing text on the `/verificar-email` page from Spanish (Rioplatense) to pt-BR, creates a branded HTML email template for the Supabase "Confirm signup" email, and documents the required manual Supabase Dashboard configuration changes.

### Scope

| Item | In Scope | Out of Scope |
|------|----------|--------------|
| Supabase Dashboard `site_url` configuration | ✅ (documented) | Automated provisioning |
| Supabase Dashboard redirect URLs | ✅ (documented) | |
| Supabase email template override | ✅ (documented + HTML file) | Other email types (password reset, etc.) |
| `/verificar-email` page i18n (Spanish → pt-BR) | ✅ | Multi-language support |
| Auth callback route (`/api/auth/callback`) | — No changes needed | |
| Middleware | — No changes needed | |

---

## 2. External Configuration Requirements

### 2.1 Supabase Dashboard — Site URL

**REQ-EMAIL-001**: The Supabase Cloud project MUST have its `Site URL` set to `https://casadeasados.duckdns.org`.

- **Location:** Supabase Dashboard → Authentication → URL Configuration → Site URL
- **Current value:** `http://localhost:3000` (incorrect)
- **Target value:** `https://casadeasados.duckdns.org`
- **Impact:** All email confirmation links will use this URL as the base for the `{{ .ConfirmationURL }}` template variable.

### 2.2 Supabase Dashboard — Redirect URLs

**REQ-EMAIL-002**: The Supabase Cloud project MUST include `https://casadeasados.duckdns.org/**` in the list of allowed Redirect URLs.

- **Location:** Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
- **Action:** Add `https://casadeasados.duckdns.org/**` (wildcard to cover all paths)

### 2.3 Supabase Dashboard — Email Template

**REQ-EMAIL-003**: The Supabase Cloud project MUST override the "Confirm signup" email template with the branded pt-BR HTML content from `docs/templates/email-confirmacao.html`.

- **Location:** Supabase Dashboard → Authentication → Email Templates → Confirm signup
- **Subject line:** `Confirme seu e-mail — Casa de Asados`
- **Body:** Copy from `docs/templates/email-confirmacao.html`
- **Required template variables:** `{{ .ConfirmationURL }}`

---

## 3. Email Template Specification

### 3.1 Template File

**REQ-EMAIL-004**: A branded HTML email template MUST be created at `docs/templates/email-confirmacao.html`.

#### Content Requirements

| Aspect | Requirement |
|--------|-------------|
| Language | pt-BR |
| Subject | `Confirme seu e-mail — Casa de Asados` |
| Brand name | `Casa de Asados` |
| Brand tagline | `Churrascaria Premium` |
| Color palette | Primary: `#dc2626` (red-600), Accent: `#f59e0b` (amber-500), Background: `#18181b` (zinc-900), Text: `#fafafa` (zinc-50) |
| CTA button text | `Confirmar Meu E-mail` |
| CTA button link | `{{ .ConfirmationURL }}` |
| Expiry notice | MUST state link expiration (24 hours) |
| Support note | MUST include "Se você não criou esta conta, ignore este e-mail." |
| Footer | MUST include "© 2026 Casa de Asados — Churrascaria Premium" |

#### Technical Requirements

**REQ-EMAIL-005**: The email template MUST use inline CSS styles only (no `<style>` blocks or external stylesheets) for maximum email client compatibility.

**REQ-EMAIL-006**: The email template MUST be table-based layout for compatibility with Outlook and older email clients.

**REQ-EMAIL-007**: The email template MUST include the Supabase template variable `{{ .ConfirmationURL }}` as the `href` of the primary CTA button.

**REQ-EMAIL-008**: The email template MUST render correctly in:
- Gmail (web + mobile)
- Outlook (desktop + web)
- Apple Mail
- Mobile default email apps

---

## 4. `/verificar-email` Page Translation

### 4.1 Text Changes

**REQ-EMAIL-009**: ALL user-facing text on the `/verificar-email` page MUST be translated from Spanish (Rioplatense) to pt-BR.

#### Translation Map

| State | Current (Spanish) | Target (pt-BR) |
|-------|-------------------|-----------------|
| `sucesso === 'true'` — Heading | `¡Email Verificado!` | `E-mail Verificado!` |
| `sucesso === 'true'` — Body | `Tu dirección de correo electrónico ha sido confirmada con éxito. Ya podés acceder a todos los servicios de la churrascaria.` | `Seu endereço de e-mail foi confirmado com sucesso. Você já pode acessar todos os serviços da churrascaria.` |
| `sucesso === 'true'` — Button | `Continuar` | `Continuar` (unchanged — same in pt-BR) |
| `sucesso === 'false'` — Heading | `Error de Verificación` | `Erro de Verificação` |
| `sucesso === 'false'` — Body | `No pudimos verificar tu dirección de correo electrónico. El enlace de confirmación puede haber expirado o ya haber sido utilizado.` | `Não foi possível verificar seu endereço de e-mail. O link de confirmação pode ter expirado ou já ter sido utilizado.` |
| `sucesso === 'false'` — Button | `Volver al Login` | `Voltar ao Login` |
| `sucesso === null` — Heading | `Verificá tu Correo` | `Verifique seu E-mail` |
| `sucesso === null` — Body | `Te enviamos un enlace de activación a tu cuenta de e-mail. Por favor, revisá tu bandeja de entrada (y la carpeta de spam) y hacé clic en el enlace para confirmar tu cuenta.` | `Enviamos um link de ativação para o seu e-mail. Por favor, verifique sua caixa de entrada (e a pasta de spam) e clique no link para confirmar sua conta.` |
| `sucesso === null` — Button | `Volver al Login` | `Voltar ao Login` |

### 4.2 Brand Header

**REQ-EMAIL-010**: The brand name on the `/verificar-email` page SHOULD remain `Asados Sofía` (brand identity, not a translation target).

---

## 5. Files Affected

| File | Action | Description |
|------|--------|-------------|
| `src/app/verificar-email/page.tsx` | MODIFY | Translate 8 text strings from Spanish to pt-BR |
| `docs/templates/email-confirmacao.html` | CREATE | Branded pt-BR HTML email template |
| `docs/supabase-email-setup.md` | CREATE | Runbook documenting the 3 Supabase Dashboard changes |

---

## 6. Acceptance Scenarios

### Scenario 1: Email confirmation link redirects to production domain

```gherkin
Given the Supabase Dashboard site_url is set to "https://casadeasados.duckdns.org"
  And the redirect URLs include "https://casadeasados.duckdns.org/**"
When a new user signs up with a valid email address
Then Supabase MUST send a confirmation email
  And the confirmation link MUST contain "https://casadeasados.duckdns.org" as the base URL
  And the link MUST NOT contain "localhost"
```

### Scenario 2: Email confirmation link reaches callback route

```gherkin
Given the Supabase confirmation email was sent with the correct site_url
When the user clicks the confirmation link in the email
Then the browser MUST navigate to "https://casadeasados.duckdns.org/api/auth/callback?code=..."
  And the callback route MUST exchange the code for a session
  And the user MUST be redirected to "/verificar-email?sucesso=true"
```

### Scenario 3: Confirmation email is in pt-BR with branding

```gherkin
Given the Supabase "Confirm signup" email template has been overridden with the branded HTML
When a new user signs up
Then the confirmation email subject MUST be "Confirme seu e-mail — Casa de Asados"
  And the email body MUST be in pt-BR
  And the email MUST contain a "Confirmar Meu E-mail" CTA button
  And the CTA button MUST link to the confirmation URL
  And the email MUST display "Casa de Asados" branding with red/amber color scheme
```

### Scenario 4: Successful verification page displays pt-BR text

```gherkin
Given the user has successfully verified their email
When the user arrives at "/verificar-email?sucesso=true"
Then the heading MUST display "E-mail Verificado!"
  And the body text MUST be in pt-BR
  And the button MUST display "Continuar"
  And the button MUST navigate to "/cliente/verificar-telefone" by default
```

### Scenario 5: Failed verification page displays pt-BR text

```gherkin
Given the email verification failed (expired or already used link)
When the user arrives at "/verificar-email?sucesso=false"
Then the heading MUST display "Erro de Verificação"
  And the body text MUST be in pt-BR explaining the link may have expired
  And the button MUST display "Voltar ao Login"
  And the button MUST navigate to "/login"
```

### Scenario 6: Pending verification page displays pt-BR text

```gherkin
Given the user just signed up and has not yet clicked the confirmation link
When the user arrives at "/verificar-email" without query parameters
Then the heading MUST display "Verifique seu E-mail"
  And the body text MUST be in pt-BR instructing to check inbox and spam
  And the button MUST display "Voltar ao Login"
```

### Scenario 7: Email template renders correctly across clients

```gherkin
Given the email template uses inline CSS and table-based layout
When the confirmation email is received in Gmail, Outlook, or Apple Mail
Then the email MUST render with correct branding colors
  And the CTA button MUST be clickable
  And the layout MUST NOT break or show raw HTML
```

---

## 7. Runbook Documentation

**REQ-EMAIL-011**: A runbook document MUST be created at `docs/supabase-email-setup.md` containing:

1. **Step-by-step instructions** for the 3 Supabase Dashboard changes (site_url, redirect URLs, email template)
2. **Screenshots placeholders** indicating where in the dashboard each change is made
3. **Verification steps** to confirm each change was applied correctly
4. **Rollback instructions** for each change

---

## 8. Non-Functional Requirements

**REQ-EMAIL-012**: The `/verificar-email` page MUST NOT change its visual design, styling, animations, or layout — only text content is translated.

**REQ-EMAIL-013**: The auth callback route (`/api/auth/callback/route.ts`) MUST NOT be modified — it already works correctly.

**REQ-EMAIL-014**: The middleware (`middleware.ts`) MUST NOT be modified — `/verificar-email` is already in the unprotected routes list.
