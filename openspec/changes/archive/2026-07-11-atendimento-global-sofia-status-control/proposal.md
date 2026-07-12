# Proposal: Atendimento Global Sofia Status Control

## Intent

Give attendants a reliable `/atendimento` control surface for Sofia availability. Global channel off must override per-client/per-conversation awake state so operators can safely pause automation.

## Scope

### In Scope
- Global Sofia on/off controls for WhatsApp and Telegram.
- Status bar in `/atendimento`: green operational, yellow paused by business hours, red globally off.
- LLM credits indicator for the active Sofia runtime provider/key, refreshed every 30 minutes, showing both the remaining USD value and color status.
- Provider-neutral credit status for OpenRouter and direct DeepSeek only for now. The active provider is detected the same way Sofia runtime selects it: direct DeepSeek when the configured key starts with `sk-` and is not `sk-or-*`, otherwise OpenRouter for `sk-or-*`/OpenRouter hints.

### Out of Scope
- Code, migrations, or tests in this phase.
- Changing per-conversation wake/sleep beyond global override priority.
- Automatic credit recharge or billing automation.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `bandeja_operador`: Add global channel controls, availability bar, and credits indicator in `/atendimento`.
- `whatsapp_webhook`: Enforce global WhatsApp off before Sofia/RAG response generation.
- `integracoes`: Persist/read global channel settings and expose provider-neutral LLM credit status.
- `horario_atendimento`: Clarify yellow state: only the configured out-of-hours message is sent; LLM is not used.

## Approach

Store global channel availability in system configuration. UI and webhooks read it. Webhooks check global state before `ia_ativa`; red blocks Sofia entirely. If enabled but outside business hours, show yellow and send only the programmed schedule message. Credits use a provider adapter returning USD balance, display value, color, and freshness timestamp.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `/src/app/atendimento/page.tsx` | Modified | Render controls/status/credits. |
| `/src/app/actions/atendimento.ts` | Modified | Save/read global status. |
| `/src/app/api/webhooks/whatsapp/route.ts` | Modified | Block global-off WhatsApp. |
| `/src/app/api/webhooks/telegram/route.ts` | Modified | Block global-off Telegram. |
| `/src/lib/ai/openrouter.ts` | Modified | Feed credit adapter. |
| `/src/lib/horarios/verificar.ts` | Modified | Keep yellow semantics. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Provider credit APIs vary/unavailable; current Sofia may use either OpenRouter or direct DeepSeek credentials stored under legacy `OPENROUTER_API_KEY`. | Med | Adapter; stale/unknown UI, no chat block. |
| Webhook bypasses global off. | Med | Fail-closed pre-RAG checks. |
| Yellow/red confusion. | Low | Distinct labels/tooltips. |

## Rollback Plan

Stop reading global settings so webhooks return to `ia_ativa`; hide the global status UI.

## Dependencies

- `configuracoes_sistema` or equivalent secure config storage.
- Credit/balance lookup support for OpenRouter and direct DeepSeek only.

## Success Criteria

- [ ] Attendants can globally disable Sofia independently for WhatsApp and Telegram.
- [ ] Global off always prevents Sofia from answering on that channel.
- [ ] `/atendimento` shows green/yellow/red status per channel.
- [ ] Credits refresh every 30 minutes and show remaining value: green > USD 2, yellow > USD 1, red < USD 1.
