# Proposal: Humanized Multichannel Sofia Responses

## Intent

Make Sofia feel responsive without replying mechanically to each individual inbound message. Telegram, WhatsApp through Evolution, and Web will use one durable batching contract that collects a customer's short message sequence into one ordered context, then sends at a humanized pace.

The change preserves the existing automation-policy gates, conversation fencing, at-most-one response guarantee, and crash-safe processing. It changes only when and how an eligible Sofia response is scheduled and presented.

## Goals

- Use durable, server-side inbound batching for every active Sofia channel: Telegram, WhatsApp/Evolution, and Web.
- Start processing after **10 seconds of silence** since the most recent inbound message, capped at **20 seconds from the first inbound message** in a batch.
- Run durable batch maintenance at least every **2 seconds** so due work is discovered without relying on process-local timers.
- Aggregate each batch's text and attachments in chronological order before generation.
- Generate at most one Sofia response for each safely claimed batch.
- Humanize response pacing from the generated response length, clamped to a **2–6 second** computed minimum.
- Keep the channel activity indicator visible during both generation and any remaining pacing delay.
- Apply only the remaining delay necessary to satisfy the computed minimum after generation; do not add an unconditional post-generation delay.
- Use Telegram typing, Evolution's existing composing/delay capability, and durable Web presence delivered through Realtime.
- Migrate Web from direct per-message generation to the same durable batching contract as the other active channels.

## Customer and operator behavior

### Customer experience

1. When a customer sends one or several messages in quick succession, Sofia waits until the conversation has been quiet for 10 seconds, unless the batch has already been open for 20 seconds.
2. Sofia reads the ordered batch as one interaction and sends no more than one response for it.
3. The customer sees a channel-appropriate activity signal while Sofia is generating and, if generation completes early, for only the balance of the calculated humanized response pace.
4. A message received after a batch has been safely claimed belongs to a new pending batch; it cannot change the response currently being prepared.
5. Web customers receive durable Sofia-presence updates through Realtime rather than token-by-token response streaming.

### Operator experience

- Operators retain the existing ability to intervene, hand off, pause, or otherwise fence automation according to current policy.
- An operator intervention or other eligibility change before a batch is claimed prevents Sofia from responding to that batch.
- Operators do not receive token-streamed Sofia output as part of this change.
- No payment, approval, reconciliation, or other protected business decision is delegated to Sofia by this proposal.

## Scope

| Area | Included change |
| --- | --- |
| Shared inbound batching | Durable per-conversation pending batches, timestamp tracking, due-time calculation, safe claims, terminal state, and recovery-safe processing. |
| Timing | `due_at = min(latest_inbound_at + 10s, first_inbound_at + 20s)` with maintenance polling every 2 seconds. |
| Telegram | Preserve immediate intake and policy checks; enqueue eligible inbound work, show typing across generation and remaining pacing delay, and send one final response. |
| WhatsApp/Evolution | Preserve immediate intake and policy checks; enqueue eligible inbound work and use the existing composing/delay mechanism for the indicator and remaining delay. |
| Web | Replace direct per-message Sofia generation with durable batch enqueueing, durable presence state, and Realtime delivery of presence and final-response state. |
| Generation pacing | Compute a response-length-based minimum between 2 and 6 seconds, measure elapsed generation time, and delay only `max(0, minimum - elapsed)`. |
| Safety boundaries | Retain policy gates, conversation fencing, at-most-one response semantics, eligibility re-check at claim time, and crash-safe durable recovery. |
| Verification | Cover batching windows, max-wait behavior, concurrent messages, claims, restarts, Web migration, indicator lifetime, remaining-delay calculation, and policy cancellation. |

## Business rules and invariants

| Rule | Required behavior |
| --- | --- |
| Active-channel coverage | Telegram, WhatsApp/Evolution, and Web implement the same durable batching semantics. |
| Silence window | A pending batch becomes due 10 seconds after its latest inbound message when the 20-second cap has not been reached. |
| Maximum window | A batch becomes due no later than 20 seconds after its first inbound message, even if new messages continue arriving. |
| Maintenance cadence | The durable scheduler or worker checks for due batches at least every 2 seconds. |
| Pending identity | At most one mutable pending batch exists per conversation; new inbound messages update that pending batch. |
| Claim boundary | Once a batch is claimed, later inbound messages form a new pending batch and cannot mutate the claimed context. |
| At-most-one response | Only one worker can complete response delivery for a claimed batch; retries and concurrent workers must not create duplicate replies. |
| Eligibility boundary | Before final response work, re-evaluate existing automation policy, including applicable opt-out, handoff, manual pause, cooldown/sleep, business-hours, and conversation-fencing rules. Ineligible work is cancelled rather than answered. |
| Crash safety | Scheduling, claims, state transitions, and recovery are durable; no process-local timer is the source of truth. |
| Context ordering | Text and attachments supplied to Sofia retain persisted inbound chronological order. |
| Pace calculation | The minimum visible activity duration is derived from the final response length and clamped to 2–6 seconds. |
| No extra wait | Generation time counts toward the computed minimum; apply only any remaining delay after generation. |
| Presence duration | Channel indicators remain visible continuously from generation start through the remaining delay and are cleared when the final response is sent or processing terminates. |
| No streaming | Responses are delivered as final messages; token streaming is out of scope. |

## Non-goals

- Supporting Meta WhatsApp Cloud; it is explicitly excluded.
- Token streaming, partial response rendering, or streaming transport protocols.
- Changing Sofia's prompt, response content policy, model selection, or financial-decision boundaries.
- Changing canonical inbound persistence, deduplication, payment-proof intake, opt-out, handoff, manual-pause, cooldown/sleep, business-hours, or conversation-fencing policy definitions.
- Redesigning operator UI beyond what is necessary to preserve current intervention and visibility behavior.
- Editing or extending the existing `atendimento-preview-and-sofia-inbound-batching` change artifacts; they are upstream reference only.
- Product research or discovery beyond the confirmed contract.

## Affected areas

The implementation will affect the following logical surfaces; exact files are intentionally deferred to design and tasks work:

- Durable persistence and worker/scheduler surfaces for Sofia inbound batching, claims, recovery, and terminal status.
- Telegram inbound webhook and delivery/presence integration.
- WhatsApp/Evolution inbound webhook and its existing composing/delay integration.
- Web inbound-message path, replacing direct per-message generation with enqueueing into the durable batch workflow.
- Web Realtime publication and client consumption for durable Sofia-presence state and final responses.
- Shared Sofia generation orchestration, including ordered batch-context construction and response-length pacing.
- Automated tests for timing, concurrency, fencing, crash recovery, presence behavior, and cross-channel contract parity.

## Delivery slices

This proposal is intentionally split into independently reviewable slices. The combined work is expected to exceed the 400-line review budget, so the configured **ask-on-risk** delivery policy requires a delivery decision before implementation packaging once concrete sizing is available. No `size:exception` is implied.

1. **Slice 1 — Durable batching foundation and Telegram adoption**
   - Introduce the durable batch lifecycle, due-time computation, two-second maintenance, safe claim/recovery semantics, chronological context assembly, and policy re-check.
   - Migrate Telegram from direct response scheduling to the durable contract and keep typing visible through generation plus only any remaining computed pace.
   - Establish focused tests for silence/max windows, race boundaries, at-most-one response, cancellation, and crash-safe recovery.

2. **Slice 2 — WhatsApp/Evolution parity**
   - Attach Evolution intake and delivery to the established durable contract without changing its immediate canonical intake or policy gates.
   - Apply the existing composing/delay capability so its indicator follows the same generation-plus-remainder rule.
   - Add channel-parity and duplicate-delivery coverage.

3. **Slice 3 — Web durable batching and Realtime presence**
   - Replace Web's direct per-message generation with durable batch enqueueing and final-response processing.
   - Persist and publish Sofia presence through Realtime so it survives the Web channel's generation and remaining-delay window.
   - Verify reconnect, delayed worker, and policy-intervention behavior without token streaming.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Duplicate replies from retries, multiple workers, or concurrent inbound delivery | Use durable unique pending-batch semantics, atomic claims, idempotent terminal transitions, and a one-response delivery fence. |
| Messages are answered too early or wait indefinitely | Persist first/latest inbound timestamps, calculate the exact 10-second/20-second due time, and run maintenance every two seconds. |
| A late message contaminates an already-generated response | Fence claimed batches; create or update a separate pending batch for messages arriving after the claim boundary. |
| Sofia responds after an operator or policy change | Re-check all existing eligibility and fencing gates at claim/processing time and cancel ineligible work. |
| Presence gets stuck or disappears early | Treat presence as durable lifecycle state, clear it on every terminal path, and test generation, remainder-delay, error, and recovery cases. |
| Web behavior differs from mobile channels | Make Web consume the same durable batch contract and publish status with Realtime instead of a direct generation path. |
| Humanized pace feels artificially slow | Clamp the computed minimum to 2–6 seconds and count generation time toward it rather than adding delay after every generation. |
| Rollout affects active customer conversations | Ship default-closed, enable by channel only after its durable path is verified, and retain the ability to stop new enqueueing. |

## Rollout

The rollout is **default-closed**: the new batching and presence behavior must not activate for a channel merely because code or schema is present.

1. Deploy the durable batching and recovery capability while all channel adoption remains disabled.
2. Validate due-batch maintenance, claims, recovery, terminal cleanup, and operational observability without routing live channel work through the new path.
3. Enable Telegram first behind the default-closed control and observe batching windows, duplicate prevention, policy cancellations, indicator cleanup, and final delivery.
4. Enable WhatsApp/Evolution only after Telegram behavior meets the success criteria and Evolution composing/delay parity is verified.
5. Enable Web only after durable Realtime presence and Web migration verification are complete.
6. Expand only when each channel preserves the established policy gates, fencing, and at-most-one response behavior.

## Rollback

- Disable the affected channel's new enqueue/adoption control to stop creating new durable batches through this change.
- Stop or isolate the affected batch-processing path before reverting code that depends on its durable state.
- Leave existing durable batch and presence records intact for audit, diagnosis, and safe recovery; do not delete pending or claimed work blindly.
- Restore a prior channel behavior only if it can preserve existing policy gates and avoid duplicate response delivery.
- Do not roll back canonical inbound messages, deduplication records, payment-proof intake, operator intervention state, or any financial workflow data.

## Success criteria

| Outcome | Success criterion |
| --- | --- |
| Cross-channel contract | Automated coverage demonstrates the 10-second silence window and 20-second first-message cap for Telegram, WhatsApp/Evolution, and Web. |
| Durable scheduling | Due work is discovered by durable maintenance at least every two seconds and does not depend on in-memory timers. |
| Web migration | Web no longer invokes direct per-message Sofia generation; it joins the durable batching workflow. |
| Ordered context | Automated coverage proves that each batch supplies text and attachments in chronological inbound order. |
| Response safety | Automated coverage proves at most one Sofia response per claimed batch across retries, concurrent workers, and restarts. |
| Policy preservation | Automated coverage proves applicable opt-out, handoff, manual-pause, cooldown/sleep, business-hours, and fencing changes prevent unsafe automated replies. |
| Humanized presence | Each channel's activity indicator remains visible through generation and only the remaining portion of a 2–6-second response-length-derived minimum. |
| No streaming | Responses remain final-message delivery with no token streaming introduced. |
| Default-closed rollout | No active channel uses the new behavior until deliberately enabled through the rollout control. |

## Proposal question round

Pre-proposal product decisions are confirmed, including channel scope, timing, pacing, indicators, policy preservation, Web migration, and Meta Cloud exclusion. No additional proposal questions are required for this auto-mode proposal phase.

## Upstream reference

- `openspec/changes/atendimento-preview-and-sofia-inbound-batching/proposal.md` is reference-only and is not modified by this change.
