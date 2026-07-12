# Design: WhatsApp Sofia Sleep/Wake Control

## Technical Approach

Introduce a shared WhatsApp Sofia control service that owns sleep/wake state, handoff phrase detection, inbound conversation resolution, and RAG eligibility. Both Meta and Evolution webhooks will call it after customer resolution and before creating/selecting a conversation. `/atendimento` will call the same transition service for manual sleep/wake. RAG gets a second guard in `processarRagPipeline` so accidental callers cannot bypass the customer-level state.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Persistence | Create `public.whatsapp_sofia_states` keyed by `(cliente_id, canal)` with `canal = 'whatsapp'`, `sofia_dormindo`, `motivo`, `origem`, `alterado_por`, timestamps. | Add columns to `clientes`; rely on `conversas.ia_ativa/status`. | A separate channel-scoped table is durable across new conversations, keeps Telegram/web chat out of scope, and fixes the current bug where changing one conversation to `aberta` does not stop a new `ia_atendendo` conversation. |
| Transition ownership | New helper `src/lib/whatsapp/sofia-control.ts`. | Duplicate logic in each webhook/action. | Meta, Evolution, manual controls, phrase handoff, and RAG must evaluate the same state. One helper prevents provider divergence. |
| Wake behavior | Waking clears `sofia_dormindo`; it does not automatically create an IA conversation. | Immediately create/reopen `ia_atendendo`. | Specs say future inbound MAY be eligible; eligibility should happen on next inbound, preserving operator context. |
| Timeout | No timeout fields used in first slice. | Add `sleep_until`. | Timed sleep is explicitly future scope; the table can add `expira_em` later without changing webhook flow. |

## Data Flow

```text
Meta/Evolution inbound
  -> normalize phone + upsert cliente
  -> Sofia control detects handoff phrase / reads sleep state
  -> if sleeping or handoff: upsert sleep, reuse/create aberta + ia_ativa=false
  -> else: reuse/create ia_atendendo + ia_ativa=true
  -> insert mensagem
  -> call RAG only when helper says eligible

Operator UI -> server action -> Sofia control sleep/wake -> update conversa -> revalidate/local UI
RAG pipeline -> Sofia control eligibility guard -> OpenRouter only if awake and IA-active
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_whatsapp_sofia_states.sql` | Create | Add state table, indexes, RLS, grants, and optional realtime publication. Generate with `supabase migration new`. |
| `src/lib/whatsapp/sofia-control.ts` | Create | Shared contracts for handoff detection, sleep/wake transitions, inbound conversation resolution, and RAG eligibility. |
| `src/app/api/webhooks/evolution/route.ts` | Modify | Replace `status = 'ia_atendendo'` lookup/create block with helper result; pass extracted text/caption for phrase detection; suppress RAG when sleeping. |
| `src/app/api/webhooks/whatsapp/route.ts` | Modify | Same Meta behavior as Evolution after media/text extraction; keep signature and idempotency flow. |
| `src/app/actions/atendimento.ts` | Modify | Add manual `alternarSofiaWhatsApp(clienteId, dormir)` action, write `logs_auditoria`, and keep `alternarIaConversa` as conversation-local control. |
| `src/app/atendimento/page.tsx` | Modify | Include Sofia WhatsApp state in SSR query. |
| `src/components/operator/*.tsx` | Modify | Extend types, show human-handling/sleep badge, add wake/sleep control, update local/realtime state. |
| `src/lib/ai/openrouter.ts` | Modify | Check WhatsApp sleep state before retrieval/OpenRouter and before dispatch. |
| `logs_auditoria` | Use | Record manual sleep/wake transitions as operator audit events. |

## Interfaces / Contracts

```ts
type SofiaSleepReason = 'manual' | 'handoff_phrase'
type SofiaSleepSource = 'operator' | 'meta_webhook' | 'evolution_webhook'

resolveWhatsAppInboundConversation(input: {
  supabase: SupabaseAdmin
  clienteId: string
  inboundText: string | null
  source: 'meta_webhook' | 'evolution_webhook'
}): Promise<{ conversaId: string; iaAtiva: boolean; sleeping: boolean; handoffTriggered: boolean }>

setWhatsAppSofiaSleep(input: {
  clienteId: string
  sleeping: boolean
  reason: SofiaSleepReason
  source: SofiaSleepSource
  actorUserId?: string
}): Promise<void>
```

Handoff phrase matching is normalized lowercase text with accent stripping and word-boundary checks for `humano`, `atendente`, and `quiero hablar con alguien`.

## Migration / RLS

Create `whatsapp_sofia_states(id, cliente_id references clientes on delete cascade, canal text check (canal = 'whatsapp'), sofia_dormindo boolean not null default true, motivo text, origem text, alterado_por uuid references auth.users, data_criacao, data_atualizacao, unique(cliente_id, canal))` plus index on `(canal, sofia_dormindo)`. Enable RLS. Operators (`admin`, `supervisor`, `vendedor`) can select/insert/update/delete; customers can select their own state only if needed by client chat. Webhooks use service role through `createAdminClient`. Avoid `SECURITY DEFINER` functions.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static | Type and lint regressions | `npm run lint` |
| Build | Next.js/server-action compatibility | `npm run build` |
| Manual integration | Sleeping inbound does not create `ia_atendendo`; handoff phrase sleeps; wake allows future IA eligibility | Use Meta/Evolution webhook payload fixtures or curl against local routes and verify Supabase rows. |
| RLS | Operator can mutate state; customer cannot mutate another customer's state | Manual SQL/Supabase dashboard checks, since no test runner is detected. |

## Open Questions

None. Manual sleep/wake transitions MUST write `logs_auditoria` because the user approved audit logging for this operational action.
