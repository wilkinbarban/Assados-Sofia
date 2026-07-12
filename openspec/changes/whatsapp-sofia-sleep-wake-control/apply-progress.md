# Apply Progress: WhatsApp Sofia Sleep/Wake Control

## Current Slice

- PR slice: PR 2b only — operator control + audit + atendimento display.
- Delivery strategy: chained PRs, `stacked-to-main`.
- Mode: Standard (`strict_tdd: false`, no dedicated test runner detected).

## Completed Tasks

- [x] 1.1 Created Supabase migration for `public.whatsapp_sofia_states` with channel-scoped uniqueness, indexes, RLS policies, explicit grants, and realtime publication registration.
- [x] 1.2 Added `src/lib/whatsapp/sofia-control.ts` with sleep/wake contracts, handoff phrase detection, and inbound eligibility helpers.
- [x] 1.3 Defined shared helper inputs/outputs for webhook and server-action use through the same state transition path.
- [x] 2.1 Updated `src/app/api/webhooks/evolution/route.ts` to resolve inbound conversations through the shared WhatsApp Sofia helper after customer resolution and before message persistence.
- [x] 2.2 Updated `src/app/api/webhooks/whatsapp/route.ts` with the same shared sleep/wake and handoff handling as Evolution, including explicit WhatsApp-origin RAG dispatch.
- [x] 2.3 Added a WhatsApp Sofia eligibility guard to `src/lib/ai/openrouter.ts` before retrieval, OpenRouter/mock generation, and outbound dispatch.
- [x] 3.1 Added `alternarSofiaWhatsApp` in `src/app/actions/atendimento.ts` to validate operator access, toggle WhatsApp Sofia sleep state through the shared server helper, force the selected conversation into human handling when sleeping, and write `logs_auditoria` entries.
- [x] 3.2 Updated `/atendimento` SSR preload to fetch `whatsapp_sofia_states` for loaded customers and attach the mapped state to each initial conversation.
- [x] 3.3 Updated operator inbox/chat components to carry WhatsApp Sofia state, show sleep/human-handling badges, refresh state through client-side Supabase reads/realtime updates, and trigger sleep/wake controls from inbox conversation cards via the server action.

## Implementation Notes

- The helper treats a missing `whatsapp_sofia_states` row as awake; explicit rows store sleep/wake state for `canal = 'whatsapp'`.
- Handoff detection normalizes lowercase text, strips accents, and checks word-boundary patterns for `humano`, `atendente`, and `quiero hablar con alguien`.
- Inbound resolution returns an `aberta`/`ia_ativa=false` conversation when sleeping or handoff-triggered, and an `ia_atendendo`/`ia_ativa=true` conversation otherwise.
- Evolution now extracts text/caption before conversation resolution so handoff phrases can sleep Sofia before any IA-active conversation is selected or created.
- Meta WhatsApp now resolves text/caption before media ingestion and conversation selection, then passes `canalOrigem: 'whatsapp'` into the RAG pipeline.
- The RAG guard fetches `ia_ativa` with the conversation and suppresses WhatsApp processing when the customer is sleeping or the conversation is not IA-active, before any RAG RPC or OpenRouter/mock generation runs.
- Manual `/atendimento` controls now use a server action instead of importing the service-role helper into client components.
- Manual sleep/wake writes audit entries with action names `sofia_whatsapp_dormir` and `sofia_whatsapp_acordar`, including non-PII IDs and state transition metadata.
- Manual sleep forces the selected conversation to `status = 'aberta'` and `ia_ativa = false`; manual wake only clears the durable sleep state and leaves future IA eligibility to the next inbound message.
- `/atendimento` SSR and client refreshes fetch WhatsApp Sofia state separately by `cliente_id`, avoiding fragile nested relationship assumptions.
- Operator realtime now listens to `whatsapp_sofia_states` changes and applies state updates to all loaded conversations for the same customer.

## Verification

- PR 1: `npm run lint` — passed.
- PR 1: `npm run build` — passed.
- PR 2a: `npm run lint` — passed.
- PR 2a: `npm run build` — passed.
- PR 2b: `npm run lint` — passed.
- PR 2b: `npm run build` — passed.

## Remaining Tasks

- [x] 4.1 `npm run lint` passed after webhook/RAG and operator UI wiring.
- [x] 4.2 `npm run build` passed after webhook/RAG and operator UI wiring.

- [x] 4.3 Manual Evolution webhook verification passed: sleeping inbound routed to `aberta`/`ia_ativa=false`; handoff phrase stored `sofia_dormindo=true` with `motivo=handoff_phrase`; wake state allowed `ia_atendendo`/`ia_ativa=true`. Test data was cleaned up.
