# Delta for rag_conhecimento

## ADDED Requirements

### Requirement: Durable per-conversation Sofia inbound batches

For Telegram and WhatsApp/Evolution inbound customer messages, the system MUST use durable server-side batch state per conversation before Sofia response processing. Durable persistence, rather than an in-memory timer, MUST be the authority for pending work and its schedule. At most one batch MAY be pending for a conversation. Each eligible accepted inbound message MUST be associated with its conversation's pending batch, preserving the message and attachment association.

The pending batch MUST retain its first and latest inbound-message timestamps and MUST schedule processing at `min(latest_message_at + 5 seconds, first_message_at + 20 seconds)`. A new eligible message arriving while that conversation has a pending batch MUST update that batch's latest timestamp and schedule without moving its first timestamp. A new eligible message arriving after a batch is claimed for processing MUST start a distinct pending batch and MUST NOT mutate the claimed batch.

#### Scenario: Silence window is extended by a pending arrival

- GIVEN a Telegram or WhatsApp/Evolution conversation has a pending Sofia batch whose first inbound message arrived at time T0
- WHEN an eligible new inbound message arrives before the batch is claimed and before T0 plus 20 seconds
- THEN the system MUST retain T0 as the batch's first-message time
- AND the system MUST set the latest-message time to the new message time
- AND the system MUST schedule processing for the earlier of five seconds after that arrival or 20 seconds after T0

#### Scenario: Continuous arrivals respect the maximum wait

- GIVEN eligible inbound messages continue arriving for one pending conversation
- WHEN five seconds after the latest message would be later than 20 seconds after the first message
- THEN the batch MUST be scheduled no later than 20 seconds after the first message

#### Scenario: Arrival while processing starts a separate batch

- GIVEN a batch for a Telegram or WhatsApp/Evolution conversation has been claimed for processing
- WHEN another eligible inbound message for that conversation arrives
- THEN the system MUST persist a new pending batch for the new message
- AND the system MUST NOT alter the claimed batch's membership, timestamps, or scheduled processing

### Requirement: Ordered batch context and bounded response

When a batch is safely claimed, Sofia context MUST include the batch's inbound text and attachments in chronological message order, retaining each attachment with its originating message. The system MUST produce at most one Sofia response for a successfully claimed batch. Existing response persistence and channel-specific delivery-outbox semantics MUST remain in effect for that response.

#### Scenario: Text and attachments preserve chronological order

- GIVEN a claimed batch contains a text message, then an attachment-only message, then another text message
- WHEN Sofia context is constructed
- THEN the context MUST represent those messages in that chronological order
- AND the attachment MUST remain associated with the message at its chronological position

#### Scenario: Claimed batch has one response limit

- GIVEN a batch has been successfully claimed by one worker
- WHEN the worker retries internal processing or another worker attempts to process the same batch
- THEN the system MUST emit no more than one Sofia response for that batch
- AND any response delivery MUST use the existing delivery-outbox semantics

### Requirement: Claim, retry, and terminal batch safety

The system MUST claim due pending batches atomically so that concurrent workers cannot both process the same batch. A claim MUST transition a batch out of pending state before Sofia response generation. Batch processing state and terminal completion, cancellation, or failure state MUST be durably recorded. A recoverable failed or abandoned claim MUST be retryable without duplicating a Sofia response, and a completed or cancelled batch MUST NOT be processed again.

#### Scenario: Concurrent workers contend for a due batch

- GIVEN one due pending batch is visible to two workers
- WHEN both workers attempt to claim it concurrently
- THEN at most one worker MUST obtain the processing claim
- AND the other worker MUST NOT generate a Sofia response for that batch

#### Scenario: Retry after an interrupted processing attempt

- GIVEN a claimed batch has not durably completed and no Sofia response has been durably committed for it
- WHEN recovery retries the batch according to the durable batch state
- THEN the batch MAY be processed again safely
- AND the system MUST still emit at most one Sofia response for the batch

### Requirement: Claim-time Sofia eligibility enforcement

Before generating or delivering a Sofia response for a claimed batch, the system MUST re-evaluate the existing automation policies for the conversation and channel. The re-evaluation MUST include `ia_ativa`, handoff or manual pause, customer opt-out, cooldown or sleep state, and applicable business-hours or channel-global availability rules. If the batch is ineligible, the system MUST cancel it without Sofia generation or automated response. This batching change MUST NOT alter the existing policies or their precedence.

#### Scenario: Human handoff during the silence window

- GIVEN a pending batch was created while Sofia was eligible
- AND an operator disables Sofia or manually pauses the conversation before the batch is claimed
- WHEN a worker claims or evaluates the due batch
- THEN the system MUST cancel the batch
- AND the system MUST NOT generate or deliver a Sofia response

#### Scenario: Opt-out, cooldown, sleep, or business-hours gate changes before claim

- GIVEN a pending batch exists for an inbound Telegram or WhatsApp/Evolution conversation
- WHEN, before response generation, the customer opts out, a cooldown or sleep state applies, or applicable business-hours or channel-global availability blocks Sofia
- THEN the system MUST cancel the batch
- AND the system MUST NOT generate or deliver a Sofia response

### Requirement: Financial authority remains outside Sofia batching

Sofia batching and Sofia responses MUST NOT approve, reject, reconcile, confirm, or otherwise make payment decisions. Payment-proof administration and payment confirmation authority MUST remain in their existing authorized workflows.

#### Scenario: Batch includes a payment proof

- GIVEN an inbound batch includes a customer payment-proof attachment
- WHEN the batch is processed for Sofia context
- THEN Sofia MUST NOT approve, reject, reconcile, or confirm the payment
- AND payment workflow authority MUST remain unchanged

### Requirement: Batch observability and rollback safety

The system MUST retain durable auditability for batch creation, scheduling, claim, retry, cancellation, failure, and completion, including channel and conversation association. Operators and maintainers MUST be able to distinguish pending, processing, completed, cancelled, and failed work. Disabling or reverting batch enqueueing or processing MUST stop new automated batch responses safely while retaining durable batch records for audit and recovery. Rollback MUST NOT delete, replay, or otherwise undo canonical payment-proof intake, persisted inbound messages, channel deduplication records, opt-outs, handoffs, or financial workflow data.

#### Scenario: Safe rollback with pending work

- GIVEN durable Sofia batches exist and batch enqueueing or processing is disabled for rollback
- WHEN the rollback takes effect
- THEN no new automated Sofia response MUST be produced from newly disabled batch processing
- AND existing durable batch records MUST remain available for audit and recovery
- AND canonical intake, deduplication, and financial workflow records MUST remain unchanged
