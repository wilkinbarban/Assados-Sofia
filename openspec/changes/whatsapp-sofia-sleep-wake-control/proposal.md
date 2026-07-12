# Proposal: WhatsApp Sofia Sleep/Wake Control

## Intent

Stop Sofia from re-taking WhatsApp customers after human handoff. The current per-conversation IA toggle is insufficient: the Evolution webhook searches only active `status = 'ia_atendendo'`; after an operator moves a conversation to `aberta`, the next inbound message can create a new IA-active conversation.

## Scope

### In Scope
- WhatsApp-only sleep/wake control for Sofia per customer.
- Manual sleep/wake control in `/atendimento`.
- Handoff phrases such as `humano`, `atendente`, and `quiero hablar con alguien` sleep Sofia and move the customer to human handling.
- Block implementation until specs/design/tasks are approved.

### Out of Scope
- Telegram, web chat, or non-WhatsApp channels.
- First implementation of timed sleep for X hours; keep as future/explicit scope.
- Broad RAG or provider-abstraction refactors.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `whatsapp_webhook`: inbound routing must honor WhatsApp sleep state and avoid recreating IA-active conversations for sleeping customers.
- `evolution_api`: Evolution inbound processing must follow the same sleep/wake rule.
- `bandeja_operador`: `/atendimento` must expose sleep/wake control and human handoff state.
- `rag_conhecimento`: Sofia/RAG must stay suppressed while the WhatsApp customer is sleeping.

## Approach

Specify a durable WhatsApp sleep state keyed by customer/channel. Route manual controls and phrase-based handoff through one server-side transition. Webhooks should persist inbound messages in human handling while sleeping, not create `ia_atendendo` conversations. Specs must decide storage shape, RLS, and phrase matching before design.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/api/webhooks/evolution/route.ts` | Modified | Sleep-aware lookup and handoff detection. |
| `src/app/api/webhooks/whatsapp/route.ts` | Modified | Meta WhatsApp parity. |
| `src/app/actions/atendimento.ts` | Modified | Manual sleep/wake action. |
| `src/app/atendimento/page.tsx` | Modified | Operator control and feedback. |
| `public.conversas` / related tables | Modified | Durable sleep state. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| IA toggle conflicts with durable sleep | Medium | Define precedence in specs. |
| Accidental sleep from phrase matching | Medium | Start with explicit phrases and auditable transitions. |
| Provider divergence | Medium | Require one shared rule for Meta and Evolution. |

## Rollback Plan

Revert implementation and remove or ignore sleep-state persistence. Existing `ia_ativa` and `status` behavior remains the fallback.

## Dependencies

- Approved specs/design/tasks.
- Database/RLS decision for sleep-state mutation.

## Success Criteria

- [ ] Sleeping a WhatsApp customer prevents Sofia replies on future inbound messages.
- [ ] Sleeping customers stay in human handling instead of new IA-active conversations.
- [ ] Operators can wake Sofia from `/atendimento`.
- [ ] Handoff phrases move WhatsApp customers to human handling.
