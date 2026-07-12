# Proposal: Sofia Channel Hardening Roadmap

## Intent
Plan a staged hardening roadmap for Sofia channels before final archiving. Reduce spoofing, duplicates, OTP abuse, provider confusion, and weak observability while keeping slices reviewable.

## Scope
### In Scope
- Define child SDD changes for Telegram, OTP, WhatsApp policy, outbound reliability, provider abstraction, and Sofia intelligence.
- Align requirements with existing specs.

### Out of Scope
- Code, migrations, specs, design, tasks, and archiving.
- Reworking `whatsapp-sofia-sleep-wake-control`; it stays pending archive until related development is complete.

## Capabilities
### New Capabilities
- `channel-outbox`: Durable send queue, correlation IDs, delivery/failure events, retries, and auditability.
- `channel-provider`: Unified inbound/outbound contract preserving provider policy.
- `sofia-intelligence`: Approved feedback, summaries/memory, and Sofia metrics.

### Modified Capabilities
- `integracoes`: Telegram secret token, own-contact validation, inbound idempotency.
- `validacao_telefone`: `usuario_id`, failed-attempt limits, atomic RPC, safer send/store.
- `whatsapp_webhook`: Correlation and delivery/failure events.
- `evolution_api`: Evolution official; Meta legacy/disabled except explicit fallback.
- `rag_conhecimento`: Approved feedback/summaries without uncontrolled learning.
- `bandeja_operador`: Send failures, provider state, and feedback approval.
- `dashboard_admin`: IA, human, failures, and conversion metrics.
- `portal_chat`: User-visible delivery/failure state.

## Approach
Recommended child changes:
1. **Telegram security hardening**: secret token, own-contact validation, idempotency.
2. **OTP hardening**: ownership-bound OTP, failed attempts, atomic RPC, send/store behavior.
3. **WhatsApp provider policy**: Evolution official; Meta legacy/disabled with migration notes.
4. **Outbox and observability**: queued sends, correlation IDs, delivery/failure events.
5. **ChannelProvider abstraction**: unify contracts after outbox/events stabilize.
6. **Sofia product intelligence**: approved feedback, summaries/memory, metrics panel.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/*` | Modified/New | Delta specs per child change |
| `src/app/api/webhooks/*` | Planned | Inbound security/idempotency |
| `src/lib/**` | Planned | OTP, providers, outbox, Sofia pipeline |
| `src/app/(admin)/**` | Planned | Feedback and metrics |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Giant PR | High | Enforce six child changes |
| WhatsApp breakage | Med | Feature flags and explicit Meta fallback |
| Duplicate sends | Med | Idempotency keys and correlation IDs |
| Unsafe learning | Med | Admin approval; no automatic prompt mutation |

## Rollback Plan
Make each child change reversible: toggle Telegram enforcement during verified mismatch, switch WhatsApp fallback by config, pause outbox workers preserving rows, and disable Sofia memory/feedback consumption without deleting audit data.

## Dependencies
- `whatsapp-sofia-sleep-wake-control` implemented/verified but unarchived.
- Existing Supabase, Telegram, Evolution, RAG, operator, and admin specs.

## Success Criteria
- [ ] Six child changes are independently specifiable and implementable.
- [ ] Security, idempotency, observability, and provider policy have clear boundaries.
- [ ] Admins can diagnose failures and approve Sofia improvements safely.
