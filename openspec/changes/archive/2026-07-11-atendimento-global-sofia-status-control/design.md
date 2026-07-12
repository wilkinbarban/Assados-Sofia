# Design: Atendimento Global Sofia Status Control

## Technical Approach

Add a channel-global availability layer above the existing conversation/client Sofia controls. `/atendimento` reads and mutates global channel settings, then renders WhatsApp/Telegram status plus LLM credit status. Webhooks check the global gate before resolving per-client awake state and before any RAG/LLM work. Schedule checks remain the only source of yellow state.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Global state storage | Store `SOFIA_GLOBAL_WHATSAPP_ENABLED` and `SOFIA_GLOBAL_TELEGRAM_ENABLED` as boolean strings in `configuracoes_sistema`. | New table for channel availability. | Existing config table already supports secure dynamic settings via server/admin clients and avoids schema surface beyond seed/default keys. |
| Gate priority | Evaluate global OFF first, then schedule yellow, then per-conversation/per-client awake state, then RAG/LLM. | Keep existing `ia_ativa` first. | Global OFF is operational kill-switch semantics and must override local awake states. |
| Yellow state | Derive from `verificarHorarioAtendimento()` only; toggles remain binary enabled/off. | Manual yellow toggle. | Specs define yellow as business-hours/programmed-message behavior, not operator intent. |
| Credit status | Add provider-neutral adapter contract for OpenRouter and direct DeepSeek only, detected from the same Sofia runtime key/model rules, cached for 30 minutes with `fetchedAt`/`stale` metadata. | UI calls a provider API directly or blocks chat on unknown credits. | Keeps billing provider handling explicit and prevents availability from depending on billing API freshness. |
| UI placement | Render a compact status bar above `OperatorInboxContainer` in `/atendimento`, with channel badges, toggles, and visible USD balance. | Put controls in admin integrations only. | Operators need live operational state where they handle conversations. |

## Data Flow

```text
/operator page SSR ──read config + schedule + credit status──> status bar
      │                         │
      └──server action toggle───┴──upsert configuracoes_sistema

webhook inbound ──global gate──> red: persist inbound only/no Sofia
                    │
                    ├──schedule gate──> yellow: send out-of-hours message/no LLM
                    │
                    └──local awake gate──> RAG pipeline ──provider adapter──> LLM
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/config/sistema.ts` | Modify | Add typed helpers for global Sofia config and boolean parsing/defaults. |
| `src/app/actions/atendimento.ts` | Modify | Add authorized server actions to read/update global channel states and credit status. |
| `src/app/atendimento/page.tsx` | Modify | Fetch initial status and pass it to the operator container/status bar. |
| `src/components/operator/OperatorInboxContainer.tsx` | Modify | Own status state, call toggle actions, subscribe/refetch after updates. |
| `src/components/operator/SofiaGlobalStatusBar.tsx` | Create | Render WhatsApp/Telegram green/yellow/red states and USD credit indicator. |
| `src/lib/ai/credits.ts` | Create | Provider-neutral credit contract and 30-minute cache. |
| `src/lib/ai/openrouter.ts` | Modify | Export OpenRouter credit adapter alongside existing RAG pipeline. |
| `src/app/api/webhooks/{whatsapp,evolution,telegram}/route.ts` | Modify | Apply global gate before local awake/RAG; preserve existing inbound persistence paths. |
| `supabase/migrations/*_sofia_global_status.sql` | Create | Seed default enabled config keys. |
| `scripts/test-webhook-integration.js`, `scripts/test-operator-integration.js` | Modify | Cover global off, yellow, and status actions. |

## Interfaces / Contracts

```ts
type Channel = 'whatsapp' | 'telegram'
type ChannelAvailability = 'operational' | 'scheduled_pause' | 'global_off'
type LlmCreditStatus = {
  provider: 'openrouter' | 'deepseek'
  balanceUsd: number | null
  state: 'fresh' | 'stale' | 'unknown'
  fetchedAt: string | null
  color: 'green' | 'yellow' | 'red' | 'neutral'
}
```

Server actions return `{ success: true, data } | { success: false, error }`. Credit colors: green `> 2`, yellow `> 1 && <= 2`, red `< 1`, neutral for stale/unknown. DeepSeek uses `GET https://api.deepseek.com/user/balance` and only reports USD when a USD `balance_infos[].total_balance` is present; CNY-only balances remain unknown/null rather than converted.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Boolean config parsing, availability derivation, credit color/cache rules. | Extract pure helpers and test with deterministic inputs. |
| Integration | Server actions enforce operator permissions and persist independent channel keys. | Extend operator integration script against local Supabase. |
| Webhook | Global off skips RAG/LLM; yellow sends schedule message only. | Stub config/schedule and assert no `processarRagPipeline` path is reached. |

## Migration / Rollout

Create an idempotent migration inserting both global keys with `true` and `eh_segredo=false`. Rollout is backward-compatible: missing keys default to enabled, and stale/unknown credits never block chat. Current credit provider detection supports OpenRouter and direct DeepSeek only.

## Open Questions

- [x] Global toggle permission: only `admin` and `supervisor`; `vendedor` can view status but cannot toggle.
- [x] Evolution and Meta WhatsApp share the same global WhatsApp key.
