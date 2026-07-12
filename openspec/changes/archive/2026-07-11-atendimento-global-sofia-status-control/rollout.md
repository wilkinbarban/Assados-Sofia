# Rollout Notes: Atendimento Global Sofia Status Control

## Scope

This rollout verifies the global Sofia gate and `/atendimento` status bar without adding new product behavior.

## Preflight

- Confirm `SOFIA_GLOBAL_WHATSAPP_ENABLED` and `SOFIA_GLOBAL_TELEGRAM_ENABLED` exist in `configuracoes_sistema`; missing values default to enabled.
- Confirm only `admin` and `supervisor` profiles can update global Sofia state; `vendedor` can view status only.
- Confirm LLM credit status is provider-neutral and stale/unknown states do not show a current numeric balance.

## Scenario Coverage

| Domain | Scenario | Evidence |
|---|---|---|
| `bandeja_operador` | `/atendimento` renders independent WhatsApp and Telegram cards with green/yellow/red availability and read-only vendedor messaging. | `tests/unit/sofia-global-status-bar.test.tsx`, `tests/unit/operator-inbox-sofia-status.test.tsx`, `scripts/test-operator-integration.js` |
| `horario_atendimento` | Enabled channels outside business hours show yellow and send only the configured schedule message. | `tests/unit/sofia-global-config.test.ts`, `tests/unit/webhook-global-gates.test.ts` |
| `integracoes` | Global channel settings persist independently and admin/supervisor permissions are enforced. | `tests/unit/sofia-global-config.test.ts`, `scripts/test-operator-integration.js` |
| `whatsapp_webhook` | WhatsApp/Evolution global off persists inbound messages and skips schedule, RAG, and LLM work. | `tests/unit/webhook-global-gates.test.ts`; `scripts/test-webhook-integration.js` only when `NEXT_PUBLIC_APP_URL` points to the Asados app |

## Safe Rollout Steps

1. Run targeted unit coverage for PR4:
   - `npm run test:unit -- tests/unit/sofia-global-config.test.ts tests/unit/llm-credits.test.ts tests/unit/operator-inbox-sofia-status.test.tsx tests/unit/sofia-global-status-bar.test.tsx tests/unit/webhook-global-gates.test.ts`
2. Run the full local verification set:
   - `npm run test:unit`
   - `npm run lint`
   - `npm run build`
3. When a local Supabase stack is available, run:
   - `node scripts/test-operator-integration.js`
4. Run live webhook integration only against the Asados app, never a default `localhost:3000` that may belong to another project:
   - `NEXT_PUBLIC_APP_URL=http://localhost:3020 node scripts/test-webhook-integration.js`
   - or use the deployed Asados URL explicitly.

## Rollback

- Re-enable both global keys by setting `SOFIA_GLOBAL_WHATSAPP_ENABLED=true` and `SOFIA_GLOBAL_TELEGRAM_ENABLED=true`.
- Hide the status bar if needed; webhooks will default to enabled when keys are absent.
