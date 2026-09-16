# Delta for rag_conhecimento

## ADDED Requirements

### Requirement: Durable multichannel Sofia batch scheduling

For Telegram, WhatsApp/Evolution, and Web customer messages, the system MUST use one durable, per-conversation Sofia batching contract. The database admission time of each accepted inbound message MUST be authoritative for batching; process-local timers MUST NOT be the source of truth. At most one mutable pending batch SHALL exist per conversation.

A pending batch MUST be due at `min(latest_inbound_at + 10 seconds, first_inbound_at + 20 seconds)`. Each eligible arrival before claim MUST update `latest_inbound_at` without changing `first_inbound_at`. Durable maintenance MUST discover due batches at least every 2 seconds while maintenance is available.

#### Scenario: Latest admitted arrival resets the silence window

- GIVEN a pending batch whose first message was admitted at T0
- WHEN another eligible message is admitted at T1 before the batch is claimed
- THEN the batch MUST retain T0 as its first inbound time
- AND the batch MUST be due at the earlier of T1 plus 10 seconds or T0 plus 20 seconds

#### Scenario: Continuous arrivals reach the first-message cap

- GIVEN eligible messages keep being admitted to one pending batch
- WHEN 10 seconds after the latest message would be later than 20 seconds after the first message
- THEN the batch MUST be due no later than 20 seconds after its first admitted message

#### Scenario: Maintenance discovers durable due work

- GIVEN a due pending batch is durable and maintenance is available
- WHEN a maintenance interval elapses
- THEN the system MUST inspect due work within 2 seconds of the preceding inspection
- AND discovery MUST NOT depend on an in-memory timer created by message intake

### Requirement: Claim-bound batch membership and ordered context

The system MUST atomically claim a due batch before generating a Sofia response. A message admitted after that claim MUST belong to a new pending batch and MUST NOT modify the claimed batch's membership, timestamps, or generated context. The claimed context MUST preserve admitted inbound chronological order for text and attachments, retaining every attachment with its originating message.

#### Scenario: Arrival after claim is isolated

- GIVEN a worker has safely claimed a conversation batch
- WHEN a later eligible customer message is admitted for that conversation
- THEN the new message MUST be assigned to a distinct pending batch
- AND the claimed response context MUST remain unchanged

#### Scenario: Context retains text and attachments in order

- GIVEN a claimed batch contains text, then an attachment-only message, then more text
- WHEN Sofia context is constructed
- THEN the context MUST represent those messages in admitted chronological order
- AND the attachment MUST remain associated with its chronological message

### Requirement: Policy-safe and crash-fenced response authority

Before generation and before acquiring final response-delivery authority, the system MUST re-evaluate existing applicable automation policy and conversation fencing, including opt-out, handoff or manual pause, cooldown or sleep, business-hours, channel-global availability, and `ia_ativa`. Ineligible work MUST be cancelled without Sofia generation or delivery.

The system MUST durably fence claims, terminal transitions, and response delivery so concurrent workers, retries, lease recovery, or a crash produce at most one Sofia response and at most one external response attempt for a batch. Provider-visible effects MUST NOT occur before durable delivery authority is acquired. A crash after authority is acquired MUST NOT cause response regeneration or an additional external attempt.

#### Scenario: Policy changes during the waiting window

- GIVEN a pending batch was eligible when its messages were admitted
- WHEN an applicable opt-out, handoff, pause, availability rule, or fence makes it ineligible before response authority
- THEN the system MUST cancel the batch
- AND the system MUST NOT generate or deliver a Sofia response

#### Scenario: Concurrent recovery preserves one response

- GIVEN a claimed batch is observed by concurrent workers or recovery after interruption
- WHEN they contend for processing or delivery
- THEN no more than one worker MUST obtain final response-delivery authority
- AND no more than one Sofia response or external response attempt MUST result

### Requirement: Humanized post-authority response pacing

After final response-delivery authority is acquired, the system MUST derive a minimum visible activity duration from the final response length and MUST clamp that duration inclusively between 2 and 6 seconds. Generation elapsed time MUST count toward this minimum. The system MUST delay only `max(0, computed_minimum - generation_elapsed)` and MUST NOT add an unconditional post-generation delay.

The applicable activity indicator MUST remain active continuously from generation start through any remaining delay and MUST clear on final delivery or every terminal processing outcome. Responses MUST be delivered as final messages; token streaming and partial-response delivery MUST NOT be introduced.

#### Scenario: Slow generation needs no extra delay

- GIVEN the response-length-derived minimum is 4 seconds
- AND generation takes 5 seconds
- WHEN final delivery is prepared
- THEN the system MUST apply zero additional pacing delay
- AND the activity indicator MUST clear when delivery reaches its terminal outcome

#### Scenario: Fast generation receives only the remainder

- GIVEN the response-length-derived minimum is 4 seconds
- AND generation takes 1 second
- WHEN final delivery is prepared
- THEN the system MUST keep the activity indicator active for exactly the remaining 3 seconds before final delivery
- AND the response MUST be delivered as one final message without token streaming

### Requirement: Default-closed multichannel adoption

The durable batching and humanized-response behavior MUST be default-closed independently for Telegram, WhatsApp/Evolution, and Web. Presence of durable state or processing capability MUST NOT activate a channel. When a channel is disabled, the system MUST NOT enqueue new work through this behavior for that channel.

Meta WhatsApp Cloud and streaming transport behavior MUST remain excluded from this change.

#### Scenario: Disabled channel does not adopt batching

- GIVEN the new batching behavior is disabled for Web
- WHEN a Web customer message is accepted
- THEN the system MUST NOT route that message through the new batching behavior
- AND the disabled state MUST NOT activate Meta WhatsApp Cloud or streaming behavior
