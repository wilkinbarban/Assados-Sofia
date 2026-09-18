# Proposal: Sofia Channel Hardening Roadmap

## Intent
Plan a staged hardening roadmap for Sofia channels before final archiving. Reduce spoofing, duplicates, OTP abuse, provider confusion, and weak observability while keeping slices reviewable.

## Scope
### In Scope
- Define child SDD changes for Telegram, OTP, WhatsApp policy, outbound reliability, provider abstraction, Sofia intelligence, and agent routing.
- Align requirements with existing specs.

### Out of Scope
- Code, migrations, specs, design, tasks, and archiving.
- Reworking `whatsapp-sofia-sleep-wake-control`; it stays pending archive until related development is complete.

## Capabilities
### New Capabilities
- `channel-outbox`: Durable send queue, correlation IDs, delivery/failure events, retries, and auditability.
- `channel-provider`: Unified inbound/outbound contract preserving provider policy.
- `sofia-intelligence`: Approved feedback, summaries/memory, and Sofia metrics.
- `agent-routing`: Deterministic binding tiers that select an agent entry for each inbound conversation.

### Modified Capabilities
- `integracoes`: Telegram secret token, own-contact validation, inbound idempotency.
- `validacao_telefone`: `usuario_id`, failed-attempt limits, atomic RPC, safer send/store.
- `whatsapp_webhook`: Correlation and delivery/failure events.
- `evolution_api`: Evolution official; Meta legacy/disabled except explicit fallback. Finding 4
  qualifies this: the official Meta Cloud API is the only viable path for interactive WhatsApp
  features, so this policy and that requirement must be reconciled in child 3.
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
7. **Agent routing and personas**: select an agent entry per inbound conversation through
   deterministic binding tiers, failing closed when no binding matches.

## Reconciliation Findings (verified 2026-09-17)

Verified against the repository and the handover runbook while planning the first slice. These
findings correct or extend the original children.

### 1. The humanized multichannel change is delivered, not pending
`humanized-multichannel-sofia-responses` landed on `main` across fifteen commits between `bd275ae`
(2026-09-11) and `dc9dcec` (2026-09-13): activity ownership fencing, durable response pacing,
Telegram typing presence (#143), Evolution composing pace (#144), durable Web batch admission
(#145, #146), durable Web presence (#147), and the closed-gate canary fixes. Its `design.md`,
`apply-progress.md` and `tasks.md` still describe the work as planning-only with no source edits and
a blocked authority. Those artifacts are stale and belong in the SDD verify/archive path, not in a
resume.

### 2. The five "open" design decisions are already closed in code
| Decision | Resolution in the repository |
| --- | --- |
| Combined renewal shape | `renew_sofia_owner_activity(uuid,text,uuid,uuid,integer,integer)` in `20260911020000_sofia_activity_core_a_corrective.sql` |
| TTL null/range | `p_ttl_seconds is null or p_ttl_seconds not between 10 and 300` in the same migration |
| Shared text-length definition | `sofia_response_pace_minimum_ms` adds 2 for every `octet_length(ch) = 4`, giving UTF-16 code-unit parity |
| Verified lock hierarchy | dblink concurrency suites in `supabase/tests/sofia_activity_core_a.sql`, `sofia_inbound_batch_admission.sql`, `sofia_inbound_batch_processing.sql` |
| Durable deadline placement | nullable `pace_not_before` plus DB-derived `remaining_ms` in `20260911030000_sofia_pacing_core_b.sql` |

### 3. The batch timing is 25 s / 60 s by deliberate decision
`20260913010000_sofia_timing_and_pacing_correction.sql`, from commit `15cdd6a` ("restore sliding
silence window and text-only delivery pacing"), deliberately returns both admission paths to a
25-second sliding window under a 60-second starvation cap.
`docs/runbooks/sofia-multichannel-status-and-handover.md` records that as working and confirmed by
the operator. The 10 s / 20 s figures in the change's design and tasks artifacts are superseded.
No contradiction is left to resolve: the artifacts are what is stale, not the code.

### 4. WhatsApp typing and WhatsApp buttons are blocked at the protocol level
The handover runbook, cross-checked against upstream Evolution evidence, records both defects:
- Evolution `/chat/sendPresence` returns HTTP 201, but WhatsApp clients drop Baileys composing
  updates unless the bot number is in the recipient's address book, the recipient's privacy allows
  presence from non-contacts, and the addressing mode is `@s.whatsapp.net` rather than `@lid`.
- Evolution v2.3.7 wraps `sendButtons` in a `viewOnceMessage`; Meta drops interactive native-flow
  buttons and lists over unofficial WhatsApp Web connections (Evolution API issue #2404, PR #2651).

Therefore `src/lib/whatsapp/gateways/catalog-gateway.ts` cannot be revived over Evolution/Baileys:
its builders are blocked by the provider, not merely unwired. Any WhatsApp interactive capability
requires the official Meta Cloud API, and any WhatsApp typing indicator requires the recipient-side
conditions above. Child 3 or child 5 must choose between deleting the builders and building an
official Cloud API interactive path.

**This settles the OpenClaw comparison.** OpenClaw's WhatsApp plugin sends typing through
`sendPresenceUpdate('composing')` — the identical Baileys call Evolution already issues — and its
plugin sends no buttons at all. OpenClaw is not a reference for either capability.

### 5. Missing child: agent routing
Nothing in this roadmap routes an inbound conversation to a different agent or persona.
`src/lib/ai/router.ts` performs model-tier selection (economy/smart/frontier), not agent selection.
Child 7 adds the missing capability.

### Approved sequencing deviation
Child 5 places the unified contract after the outbox and events stabilize. The approved plan keeps a
narrower path for the remaining work: build a **minimal** channel contract (declared per-channel
capabilities, one normalized inbound event, one send path) and defer the durable surface
(correlation IDs, unknown-send reconciliation, delivery receipts) to children 4 and 5. Given finding
4, explicit capability declaration is now the primary justification: the contract must be able to
state that WhatsApp has no typing and no buttons and let every caller degrade deliberately.

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
| Giant PR | High | Enforce seven child changes |
| WhatsApp breakage | Med | Feature flags and explicit Meta fallback |
| Duplicate sends | Med | Idempotency keys and correlation IDs |
| Unsafe learning | Med | Admin approval; no automatic prompt mutation |

## Rollback Plan
Make each child change reversible: toggle Telegram enforcement during verified mismatch, switch WhatsApp fallback by config, pause outbox workers preserving rows, and disable Sofia memory/feedback consumption without deleting audit data.

## Dependencies
- `whatsapp-sofia-sleep-wake-control` implemented/verified but unarchived.
- Existing Supabase, Telegram, Evolution, RAG, operator, and admin specs.

## Success Criteria
- [ ] Seven child changes are independently specifiable and implementable.
- [ ] Security, idempotency, observability, and provider policy have clear boundaries.
- [ ] Admins can diagnose failures and approve Sofia improvements safely.
