# Tasks: Atendimento Global Sofia Status Control

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 450-650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 foundation/config/actions/credits; PR 2 webhook gates; PR 3 /atendimento UI/status bar; PR 4 integration verification/artifacts |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Config, helpers, and action contracts | PR 1 | Base branch = current feature branch; keep scope to pure helpers and server actions. |
| 2 | Webhook gates for WhatsApp/Evolution/Telegram | PR 2 | Base = PR 1 branch; prove global-off and schedule priority paths. |
| 3 | Operator status bar and toggle UX | PR 3 | Base = PR 2 branch; wire SSR + client refresh around `/atendimento`. |
| 4 | Integration verification and rollout artifacts | PR 4 | Base = PR 3 branch; align scripts, seed/migration, and spec conformance. |

## Phase 1: Foundation

- [x] 1.1 Add typed global Sofia config helpers in `src/lib/config/sistema.ts` for `SOFIA_GLOBAL_WHATSAPP_ENABLED` and `SOFIA_GLOBAL_TELEGRAM_ENABLED`.
- [x] 1.2 Add provider-neutral credit status helpers in `src/lib/ai/credits.ts` with 30-minute freshness metadata.
- [x] 1.3 Extend `src/app/actions/atendimento.ts` with read/toggle actions enforcing admin/supervisor-only updates.
- [x] 1.4 Add migration/seed for both global keys with enabled defaults in `supabase/migrations/*_sofia_global_status.sql`.

## Phase 2: Webhook Gates

- [x] 2.1 Gate `src/app/api/webhooks/whatsapp/route.ts` on global WhatsApp state before schedule or awake logic.
- [x] 2.2 Gate `src/app/api/webhooks/evolution/route.ts` on the same global WhatsApp key and preserve inbound persistence.
- [x] 2.3 Gate `src/app/api/webhooks/telegram/route.ts` on global Telegram state before any RAG/LLM work.
- [x] 2.4 Add tests for global-off override and schedule-yellow priority in the webhook integration script.

## Phase 3: Operator UI

- [x] 3.1 Fetch initial channel/credit status in `src/app/atendimento/page.tsx` and pass it to the inbox container.
- [x] 3.2 Create `src/components/operator/SofiaGlobalStatusBar.tsx` with channel badges, enabled/off toggles, and USD balance.
- [x] 3.3 Update `src/components/operator/OperatorInboxContainer.tsx` to refresh status after action success and block vendedor toggles.

## Phase 4: Verification

- [x] 4.1 Add unit tests for boolean parsing, availability ordering, and credit color/stale-state rules.
- [x] 4.2 Extend operator integration coverage to verify role permissions and independent channel persistence.
- [x] 4.3 Update rollout notes/scripts for the new global gate and status bar scenarios from `bandeja_operador`, `horario_atendimento`, `integracoes`, and `whatsapp_webhook`.
