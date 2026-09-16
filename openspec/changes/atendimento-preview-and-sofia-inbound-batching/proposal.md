# Proposal: Deterministic Receipt Preview and Durable Sofia Inbound Batching

This change removes ambiguous receipt-preview behavior in Atendimento and prevents Sofia from responding separately to each message a customer sends in quick succession. It delivers two causally separate outcomes: a deterministic operator preview path (Outcome A), then durable inbound batching for Sofia (Outcome B).

## Intent

Operators need one reliable way to view the most recent attached receipt, with a visible error when previewing is unavailable. Customers who send a short sequence of messages and attachments need Sofia to receive that sequence as one ordered context and issue no more than one response for it.

## Goals

### Outcome A — Deterministic receipt preview

- Select exactly one preview path for **Visualizar Comprovante Anexo**.
- When `payment_proof_id` exists, open only the authenticated canonical payment-proof preview at `/api/payment-proofs/{id}/preview`.
- When `payment_proof_id` is absent and `url_anexo` exists, open only the authenticated media-preview path.
- Surface a visible, actionable preview failure rather than silently doing nothing.
- Preserve authenticated access controls for both preview routes.

### Outcome B — Durable Sofia inbound batching

- Batch inbound Telegram and WhatsApp/Evolution messages per conversation using a durable server-side mechanism.
- Process a batch after five seconds of silence since its latest inbound message, but no later than 20 seconds after its first inbound message.
- Construct Sofia context from the batch's text and attachments in chronological order.
- Claim a batch safely and produce at most one Sofia response for that claimed batch.
- Preserve immediate canonical payment-proof intake and channel-specific deduplication before batching.
- Re-check Sofia eligibility when a batch is claimed so an intervening handoff, opt-out, cooldown/sleep state, or manual pause prevents an automated response.

## Scope

| Area | Included behavior |
| --- | --- |
| Atendimento preview | Deterministic payment-proof-versus-media selection and visible preview failures. |
| Sofia scheduling | Persistent per-conversation batch records, scheduling, locking/claiming, completion/cancellation state, and recovery-safe processing. |
| Telegram intake | Continue immediate deduplication, canonical intake, and eligibility checks; enqueue eligible Sofia inbound work rather than responding per message. |
| WhatsApp/Evolution intake | Continue immediate deduplication, canonical intake, and eligibility checks; enqueue eligible Sofia inbound work rather than responding per message. |
| Sofia processing | Aggregate ordered text and attachment context, revalidate eligibility, and issue one response per claimed batch. |
| Verification | Tests for exclusive preview selection, visible error behavior, silence/max-wait timing, concurrent arrivals, ordered aggregation, and cancellation on changed eligibility. |

## Non-goals

- Supporting Meta WhatsApp Cloud; WhatsApp/Evolution and Telegram are the only active channels.
- Changing payment-proof administration, approval, rejection, reconciliation, or confirmation workflows.
- Allowing Sofia to make financial decisions or confirmations.
- Delaying canonical payment-proof ingestion, message deduplication, or message persistence until a batch runs.
- Creating advisory UX or addressing the production `invalid_provider_output` issue unless implementation explicitly needs visible failures for the specified preview or batch behavior.
- Introducing in-memory timers as the batching authority.
- Changing existing opt-out, handoff, cooldown/sleep, business-hours, or manual-pause policies.
- Adding product research, interviews, or unselected discovery work.

## Product and business rules

| Rule | Required result |
| --- | --- |
| Preview precedence | `payment_proof_id` always selects the canonical authenticated payment-proof preview; attachment preview is not also invoked. |
| Media fallback | `url_anexo` selects authenticated media preview only when there is no `payment_proof_id`. |
| Preview failure | A failed or non-OK preview fetch is visible to the operator. |
| Batch timing | `scheduled_process_at = min(latest_message_at + 5 seconds, first_message_at + 20 seconds)`. |
| Batch identity | A pending batch is unique per conversation; incoming messages update it while pending. |
| Processing race | A message arriving while a batch is processing starts a new pending batch rather than mutating the claimed batch. |
| Response limit | Each successfully claimed batch can emit at most one Sofia response. |
| Eligibility boundary | The worker re-evaluates `ia_ativa`, sleep/cooldown state, handoff/manual pause, business hours where applicable, and opt-out before responding. Ineligible batches are cancelled. |
| Financial boundary | Sofia does not approve, reject, reconcile, or confirm payments. |

## Affected areas

| Area | Expected responsibility |
| --- | --- |
| `apps/web/src/components/operator/OperatorChatConsole.tsx` | Resolve the exclusive operator preview path. |
| `apps/web/src/components/comprovantes/ModalVisualizadorComprovante.tsx` | Present authenticated preview loading failures visibly. |
| `apps/web/src/app/api/webhooks/telegram/route.ts` | Retain immediate intake/dedup and enqueue Telegram Sofia work. |
| `apps/web/src/app/api/webhooks/evolution/route.ts` | Retain immediate intake/dedup and enqueue Evolution Sofia work. |
| Sofia batch migration and queue/worker services | Persist, schedule, claim, aggregate, complete, and cancel batches. |
| `processarRagPipeline` integration | Accept ordered batched context and preserve the existing response-delivery contract. |
| Operator and batch tests | Prove preview exclusivity, failures, timing, concurrency, ordered content, and eligibility cancellation. |

## Delivery slices

The outcomes remain causally separate even though they are tracked in one change.

1. **Outcome A: deterministic receipt preview.** Implement exclusive path selection and visible failure handling with focused component tests. This slice does not depend on Sofia batching.
2. **Outcome B: durable Sofia inbound batching.** Add persistent scheduling and claim semantics, update both webhook paths, aggregate ordered messages and attachments, and add worker/integration coverage. This slice must preserve the canonical intake and policy gates that precede automated responses.

Exploration forecasts approximately 120 changed lines for Outcome A and approximately 350 for Outcome B. The combined forecast exceeds the 400-line review budget, so delivery must respect the configured `ask-on-risk` strategy before implementation packaging is selected.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Duplicate or lost automated replies under concurrent webhook delivery or workers | Use database-backed pending uniqueness, atomic upsert/claim semantics, lock metadata, and terminal batch status transitions. |
| An inbound message is processed too early or held too long | Persist first/latest timestamps and calculate the scheduled time as the minimum of the five-second silence deadline and 20-second maximum deadline. |
| Sofia responds after an operator takes over or a customer opts out | Revalidate automation eligibility at claim time and cancel instead of responding. |
| Attachments or text lose conversational order | Build context from persisted inbound messages in chronological order and retain attachment association. |
| Regression in payment handling | Keep canonical proof intake and deduplication on the immediate webhook path; batching affects only later Sofia response scheduling. |
| Operators cannot diagnose preview failures | Show a clear Portuguese failure message or error state instead of silent no-op behavior. |
| Existing channel behavior drifts | Keep Telegram and Evolution transport/intake specifics intact behind a shared durable batching contract. |

## Rollout

1. Release Outcome A independently and verify that each receipt action opens one authenticated path and visibly reports failures.
2. Deploy the persistent batching schema and worker/runner capability before enabling webhook enqueue behavior.
3. Enable batching for Telegram and WhatsApp/Evolution only after migration and claim processing are available.
4. Observe batch creation, claim, cancellation, completion, scheduled-delay, and one-response-per-batch metrics by channel and conversation.
5. Verify that payment-proof intake, deduplication, opt-outs, handoffs, cooldowns, manual pauses, and financial workflows remain unchanged during rollout.

## Rollback

- **Outcome A:** revert the deterministic preview UI change; this restores the previous behavior without data migration rollback.
- **Outcome B:** disable or revert webhook batch enqueueing so no new Sofia work is scheduled through batches; retain durable rows for audit and recovery rather than deleting them blindly.
- Stop or disable the batch worker before reverting schema-dependent code.
- Do not roll back or replay canonical payment-proof intake, persisted inbound messages, deduplication records, opt-outs, handoffs, or financial workflow data.
- If schema rollback is required, perform it only after pending/processing batches have been accounted for, since destructive removal could lose scheduled work or audit evidence.

## Measurable outcomes and success criteria

| Outcome | Measure | Success criterion |
| --- | --- | --- |
| Preview determinism | Invocation path per receipt action | 100% of actions select exactly one preview path in automated coverage: canonical proof when `payment_proof_id` exists, otherwise media when `url_anexo` exists. |
| Preview observability | Failed preview behavior | Automated coverage confirms non-OK/fetch failures produce visible operator feedback and no silent no-op. |
| Silence batching | Delay from latest inbound to claimed processing | Eligible batches are not claimed before five seconds of silence, except when the 20-second maximum is due. |
| Maximum wait | Delay from first inbound to claimed processing | Eligible continuously active conversations are claimed no later than 20 seconds after the first message, subject to worker availability. |
| Single response | Responses per claimed batch | No more than one Sofia response is emitted per successfully claimed batch. |
| Context completeness | Batched prompt inputs | Tests prove text and attachments from the batch are provided in chronological order. |
| Boundary preservation | Intake and policy behavior | Tests prove deduplication and canonical proof intake remain immediate, while handoff, opt-out, cooldown/sleep, manual pause, and financial constraints prevent inappropriate automated action. |
| Durability | Restart/multi-instance behavior | Tests or integration verification demonstrate that pending work is database-backed and safely claimable without in-memory timer dependence. |

## Proposal question round

Product decisions and research selection were explicitly confirmed before this proposal. No additional proposal questions are needed for this phase.

## References

- [Exploration](./exploration.md)
- `apps/web/src/components/operator/OperatorChatConsole.tsx`
- `apps/web/src/components/comprovantes/ModalVisualizadorComprovante.tsx`
- `apps/web/src/app/api/webhooks/telegram/route.ts`
- `apps/web/src/app/api/webhooks/evolution/route.ts`
- `tests/components/operator/OperatorChatConsoleAttachmentBanner.test.tsx`
- `tests/components/operator/AttachmentCard.test.tsx`
