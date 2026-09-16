# Exploration: humanized-multichannel-sofia-responses

## SDD result context

- **Change:** `humanized-multichannel-sofia-responses`
- **Phase:** explore
- **Artifact store:** OpenSpec
- **Execution:** auto
- **Delivery:** ask-on-risk
- **Review budget:** 400 changed lines per causal slice
- **Test runner:** Vitest (strict TDD)
- **Scope guard:** exploration only; no code, runtime, database, environment, GitHub, issue, or PR mutation.

## Product contract

Sofia must feel human without weakening delivery authority or safety:

1. Durable inbound silence is **10 seconds from the latest admitted inbound message**; the hard maximum remains **20 seconds from the first admitted message**. The schedule is `min(latest_message_at + 10s, first_message_at + 20s)`.
2. The maintenance scheduler polls every **2 seconds**, which is the operational cadence for due work, not a guarantee while the worker is unavailable.
3. After durable response/delivery authority is acquired, response delay is length-based and clamped to **2–6 seconds**.
4. Telegram shows a provider typing indicator. Evolution keeps its existing embedded `presence: composing` and delay support. Meta WhatsApp Cloud is excluded.
5. Web gets durable presence synchronized through Supabase Realtime; this is presence only, not token streaming.
6. Every channel preserves opt-out, handoff/manual pause, business-hours, global, fencing, at-most-one response, and crash-safety gates.

## Exact current architecture

### Durable Sofia batching already present

The repository already contains the earlier batch implementation in source and migrations, although the related OpenSpec change remains untracked and must not be edited:

- `supabase/migrations/20260909010000_sofia_inbound_batch_admission.sql` creates `sofia_inbound_batches` and immutable `sofia_inbound_batch_messages`, with one pending batch per conversation, service-role-only admission, and a five-second schedule.
- `supabase/migrations/20260909020000_sofia_inbound_batch_processing.sql` creates the durable response outbox and fenced claim/cancel/fail/complete/delivery RPCs.
- `supabase/migrations/20260909030000_sofia_inbound_batch_attach_message.sql` attaches already-persisted webhook messages atomically and recalculates the schedule.
- `apps/web/src/lib/sofia/inbound-batch-worker.ts` claims batches, rechecks eligibility, formats ordered context, generates once, completes once, then claims and begins delivery.
- `apps/web/src/lib/sofia/inbound-batch-gates.ts` uses strict string-`"true"` gates. Telegram and Evolution enqueue gates are separate; processing has its own gate.
- `apps/web/src/app/api/internal/sofia/inbound-batches/maintenance/route.ts` is authenticated, bounded to 20 work items, returns aggregate counts, and returns zero work when processing is closed.
- Telegram and Evolution webhook routes currently retain direct RAG when their respective producer gate is closed and attach persisted messages when open. The requested product state says producers are closed while processing is true; this change must not silently open either producer.

The current batch contract is therefore the right ownership boundary for timing, membership, fencing, and response intent. This change should alter timing and humanization around that boundary rather than introduce a second queue.

### Existing delivery behavior

- `apps/web/src/lib/telegram/send.ts` sends with `sendMessage` and persists after provider success unless `salvarNoBanco: false`; it has no typing call in the Sofia delivery path.
- `apps/web/src/lib/whatsapp/evolution.ts` sends text through Evolution with `options.delay` and `options.presence: 'composing'`, using `calcularDelayDigitacao` from `apps/web/src/lib/whatsapp/delays.ts`. Current constants are 1200–4500 ms with jitter, so they do not meet the new 2000–6000 ms contract.
- `apps/web/src/lib/sofia/inbound-batch-worker.ts` completes the durable IA message and response intent before beginning provider delivery. Its `salvarNoBanco: false` adapters are the correct place to avoid a second ledger row.
- `apps/web/src/lib/ai/openrouter.ts` exposes `processarRagBatchPipeline`, but the shared pipeline still contains channel-specific eligibility and delivery concerns. Any refactor must preserve the batch worker as the sole completion/authority boundary.
- `apps/web/src/components/chat/ChatContainer.tsx` has an ephemeral local `isIaTyping` indicator around the authenticated Web server action and subscribes to `mensagens`/`conversas` Realtime. That local state cannot represent a server-side delayed batch response after a reload or across browser sessions.
- `public.mensagens` and `public.conversas` are already in `supabase_realtime`; there is no existing durable Sofia presence table or presence source found in the application tree.

## Proposed causal architecture

### Shared timing and humanization

1. Change the admission/attach schedule formula everywhere to `latest + 10s`, capped by `first + 20s`; preserve first/latest timestamps and the one-pending-row invariant.
2. Change the scheduler script/configuration default and validation to a **2-second** interval. Keep the maintenance route bounded and fail-closed. Do not install or enable the scheduler as part of implementation.
3. Define one pure delay helper for response text length, with deterministic tests and explicit bounds of 2000–6000 ms. The helper must be applied only after `complete_sofia_inbound_batch` has granted durable response authority; it must not hold a batch lease while waiting before completion.
4. Humanization is a delivery side effect, not a new lifecycle state. A crash after authority is acquired must not regenerate or reattempt the response merely because a typing/delay call was interrupted.

### Telegram

After the response intent is durably claimed and its delivery transition is atomically changed to `attempted`, issue Telegram `sendChatAction` with `action: "typing"` for the target chat, then wait the length-based 2–6 second delay, then invoke the existing `sendMessage` adapter without persistence. The typing call is best-effort and must not create a second response attempt or bypass fencing; a provider failure remains an auditable delivery failure. Tests must prove no typing or message call happens before the durable attempt transition.

### Evolution WhatsApp

Reuse the existing Evolution `sendText` path, changing only its Sofia response delay calculation to the new 2–6 second length-based clamp while retaining `presence: 'composing'`. Preserve the current no-retry behavior when `salvarNoBanco: false`; otherwise a generic change to shared retry defaults could violate at-most-one external attempt. Do not add a separate typing endpoint or a second presence channel.

### Web durable presence

Add a narrowly scoped, private durable presence projection keyed by conversation, containing at minimum `status` (`idle`/`composing`), an opaque generation or lease token, and `expires_at`/updated timestamp. The worker should publish `composing` only after durable delivery authority is acquired and clear it after the provider-independent response is committed/delivered or the attempt fails. The browser subscribes to that projection through `postgres_changes` and treats expired presence as idle; Realtime delivery is an optimization, not the authority. RLS must limit a customer to their own conversation and staff to authorized conversations; service-role worker writes should use narrow RPCs rather than client table writes.

The Web path currently executes synchronously from `processarIaChat`, while the durable batch worker currently covers Telegram/Evolution. The implementation must explicitly decide whether Web inbound becomes a durable producer in this change or whether Web presence is only projected for responses produced by an already-durable Web worker. The product statement requires durable Web presence, but it does not authorize silently changing Web admission semantics; this is the main scope gate for design. Meta Cloud remains excluded.

## Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Ten-second timing is changed in one migration but not the other admission path. | Update both `enqueue_sofia_inbound_message` and `attach_sofia_inbound_message`; add SQL tests for reset and 20-second cap. |
| A two-second poll overloads the maintenance route or races multiple workers. | Keep `SKIP LOCKED`, bounded claims, lease fencing, and aggregate-only responses; test concurrent claims. |
| Typing or delay occurs before durable authority and duplicates after crash. | Require `begin_sofia_response_delivery` before all provider effects; never sleep before that transition. |
| Telegram typing fails or expires while the answer remains valid. | Treat typing as best-effort telemetry; still enforce one message attempt and record provider failures without regenerating. |
| Evolution's existing retry/circuit-breaker behavior silently reintroduces duplicate sends. | Keep `salvarNoBanco:false` retry count at zero and cover the exact adapter invocation count. |
| Web presence leaks another customer's automation state. | Private table/RPC, conversation-scoped RLS, authorized Realtime filters, opaque identifiers, and expiry fail-safe. |
| Realtime event loss leaves a stale composing indicator. | Persist `expires_at`; client renders composing only before expiry and reloads current state. |
| Existing handoff or opt-out occurs during the human delay. | Re-evaluate policy before authority and do not add a post-authority second response; a claimed attempt remains fenced and auditable. |
| Existing OpenSpec batch change is edited or its assumptions drift. | Treat `atendimento-preview-and-sofia-inbound-batching` as an upstream dependency/reference only; update this change's artifacts separately and do not touch its files. |

## Causal slices under 400 lines

Forecasts include focused Vitest/SQL test additions and should be measured before implementation. No `size:exception` is inferred.

1. **Slice A — durable timing and 2-second cadence (~180–260 lines).** Update both admission/attach schedule contracts, maintenance scheduler interval, constants, and focused timing/scheduler tests. This is independently useful and does not activate producers.
2. **Slice B — shared post-authority delay contract (~180–280 lines).** Add the pure 2–6 second length helper and wire Evolution's existing composing/delay adapter plus worker tests proving authority precedes delay and provider calls. Telegram typing may remain absent until Slice C; no producer activation.
3. **Slice C — Telegram typing delivery (~180–300 lines).** Add a narrow `sendChatAction` adapter and worker dependency seam, with tests for target resolution, best-effort typing, ordering, and at-most-one message attempt. Keep the Telegram enqueue gate closed.
4. **Slice D — durable Web presence projection (~300–390 lines).** Add presence migration/RPCs, worker transitions, Realtime client subscription/state expiry, RLS/authority tests, and decide/document the Web producer boundary. This slice must not add token streaming.

If Slice D requires changing Web admission from direct server action to durable batching, that is a separate causal slice and likely exceeds the stated budget once tests are included; stop and ask under `ask-on-risk` rather than compressing it.

## Relationship to `atendimento-preview-and-sofia-inbound-batching`

That untracked change is the upstream design for durable inbound batching, fencing, response intent, channel gates, and the initial five-second/20-second schedule. This new change is a follow-on delta:

- It **reuses** its queue tables, membership immutability, claim lease, completion intent, delivery-attempt boundary, eligibility rechecks, and default-closed producer posture.
- It **changes** the silence window from 5 to 10 seconds and maintenance cadence from 5 seconds to 2 seconds.
- It **adds** channel-specific humanization after authority: Telegram typing, Evolution's revised 2–6 second composing delay, and durable Web composing presence via Realtime.
- It **does not** alter receipt preview behavior, payment-proof authority, Meta Cloud behavior, opt-out/handoff/business-hours/global policy, or financial safety rules.
- It must be implemented only after reconciling the current source/migrations with that untracked change's stated artifact plan, because the repository already contains portions of that plan and its current filenames/contracts are not identical to the earlier design text.

## Verification discovery

Strict TDD should use Vitest for TypeScript behavior and the repository's local Supabase test command for SQL where available. The current `openspec/config.yaml` records `runner: vitest` and `rls_verification: false`; therefore SQL authority coverage should still be planned, but environment/runtime verification remains out of scope here. Important tests include:

- exact schedule formula for first message, latest-message reset, and max-wait boundary;
- strict two-second scheduler interval validation and bounded maintenance work;
- delay monotonicity/length sensitivity and exact 2–6 second clamps;
- no delivery-side effect before durable `attempted` authority;
- Telegram typing failure does not create another response or ledger row;
- Evolution sends composing with the new delay and zero retry for durable intents;
- Web presence visibility, expiry, Realtime update handling, handoff/opt-out clearing, and no token chunks;
- two workers, lease expiry, crash after authority, and at-most-one response invariants.

```yaml
change_name: humanized-multichannel-sofia-responses
phase: explore
status: complete
skill_resolution: paths-injected
artifact_store: openspec
artifacts:
  - openspec/changes/humanized-multichannel-sofia-responses/exploration.md
review_budget: 400
strict_tdd_runner: vitest
delivery_strategy: ask-on-risk
forecast:
  - slice: durable-timing-and-cadence
    changed_lines: 180-260
  - slice: post-authority-delay
    changed_lines: 180-280
  - slice: telegram-typing
    changed_lines: 180-300
  - slice: durable-web-presence
    changed_lines: 300-390
upstream_change: atendimento-preview-and-sofia-inbound-batching
producer_state: closed
processing_state: true
meta_whatsapp_cloud: excluded
web_streaming: excluded
runtime_mutation: forbidden
```
