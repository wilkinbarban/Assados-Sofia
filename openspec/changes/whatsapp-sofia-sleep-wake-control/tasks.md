# Tasks: WhatsApp Sofia Sleep/Wake Control

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450-650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: migration + shared helper; PR 2: webhook/UI/RAG wiring |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Persist and expose WhatsApp Sofia state | PR 1 | Base schema, helper, audit-ready transition contracts |
| 2 | Route inbound/control flows through shared state | PR 2 | Webhooks, RAG guard, manual `/atendimento`, UI badges |

## Phase 1: Database and shared control foundation

- [x] 1.1 Create Supabase migration for `public.whatsapp_sofia_states` with `cliente_id`, `canal`, `sofia_dormindo`, `motivo`, `origem`, `alterado_por`, timestamps, unique key, indexes, RLS, and grants.
- [x] 1.2 Add `src/lib/whatsapp/sofia-control.ts` with sleep/wake contracts, handoff phrase detection, and inbound eligibility helpers.
- [x] 1.3 Define helper inputs/outputs so webhooks and server actions can share the same state transition path.

## Phase 2: Inbound WhatsApp wiring

- [x] 2.1 Update `src/app/api/webhooks/evolution/route.ts` to use the shared helper before creating/selecting `ia_atendendo` conversations.
- [x] 2.2 Update `src/app/api/webhooks/whatsapp/route.ts` with the same sleep/wake and handoff handling as Evolution.
- [x] 2.3 Add the `src/lib/ai/openrouter.ts` guard so sleeping WhatsApp customers cannot reach OpenRouter/RAG.

## Phase 3: Operator control and audit

- [x] 3.1 Add a server action in `src/app/actions/atendimento.ts` for WhatsApp sleep/wake and persist `logs_auditoria` entries.
- [x] 3.2 Update `src/app/atendimento/page.tsx` SSR data to include WhatsApp Sofia state for the selected customer.
- [x] 3.3 Update operator components to show the human-handling/sleep badge and trigger wake/sleep controls from the inbox.

## Phase 4: Verification and manual checks

- [x] 4.1 Run `npm run lint` and fix any type or style regressions from the new helper and UI wiring.
- [x] 4.2 Run `npm run build` to verify App Router, server action, and webhook compilation.
- [x] 4.3 Manually verify sleeping inbound WhatsApp does not create `ia_atendendo`, handoff phrases sleep Sofia, and wake restores future IA eligibility.
