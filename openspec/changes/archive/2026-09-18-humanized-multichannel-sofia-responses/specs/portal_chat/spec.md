# Delta for portal_chat

## ADDED Requirements

### Requirement: Web durable Sofia batching replaces direct generation

When the default-closed Web adoption control is enabled, an eligible Web customer message MUST be admitted to the same durable per-conversation Sofia batching contract used by Telegram and WhatsApp/Evolution. The Web inbound path MUST NOT directly invoke per-message Sofia generation. Final Sofia responses MUST remain durable final messages and MUST be delivered through the existing authorized Web message path without token streaming.

#### Scenario: Consecutive Web messages form one durable interaction

- GIVEN Web adoption is enabled and a customer sends eligible messages within the batching window
- WHEN the messages are admitted
- THEN they MUST join the shared durable pending batch for that conversation until it is claimed
- AND the Web path MUST NOT directly generate a Sofia response for an individual message

### Requirement: Durable authorized Web Sofia presence

The system MUST maintain a durable Web Sofia presence projection per conversation with an explicit composing or idle state, an opaque attempt identifier, and an expiry. The projection MUST become composing after the independent activity authority is acquired and before generation begins, MUST remain composing through generation and any remaining pace delay, and MUST clear on final delivery or another terminal outcome. This activity authority is distinct from durable final-send authority: only the existing final-send transition immediately before delivery authorizes the final message.

Web clients MUST receive presence updates through authorized Realtime delivery and MUST read back the current durable projection when subscribing or reconnecting. A client MUST treat expired presence as idle even if it misses a Realtime update. Realtime presence is state synchronization only and MUST NOT expose token chunks or partial response content.

#### Scenario: Reconnected client resolves current presence

- GIVEN a Web response is durably composing for a customer's authorized conversation
- WHEN the customer reconnects after missing a Realtime event
- THEN the client MUST read the durable current presence for that conversation
- AND it MUST render composing only while the presence has not expired

#### Scenario: Presence clears after terminal delivery

- GIVEN a Web presence projection is composing for an authorized conversation
- WHEN the associated final response is delivered or its attempt terminates
- THEN the durable presence MUST transition to idle or otherwise clear
- AND authorized clients MUST receive or read back the cleared state

### Requirement: Web presence tenant authorization

Web Sofia presence reads and Realtime updates MUST be authorized by conversation tenancy. A customer MUST access presence only for conversations they own. Staff MUST access presence only for conversations they are authorized to access. Unauthorized clients MUST NOT read, subscribe to, infer, or receive another conversation's Sofia presence state.

#### Scenario: Customer cannot observe another conversation

- GIVEN a customer is authenticated for conversation A
- WHEN that customer requests, reads back, or subscribes to presence for conversation B
- THEN the system MUST deny the presence state and Realtime updates for conversation B
- AND the customer MUST receive no Sofia composing information for that conversation
