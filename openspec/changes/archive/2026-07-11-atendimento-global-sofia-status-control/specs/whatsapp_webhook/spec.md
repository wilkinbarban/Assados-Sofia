# Delta for whatsapp_webhook

## ADDED Requirements

### Requirement: Global Sofia gate before channel processing

The WhatsApp webhook MUST check the channel-global Sofia state before any Sofia or RAG processing occurs.

When the channel is globally off, the webhook MUST not call Sofia, MUST not call RAG, and MUST not generate an LLM response.

When the channel is in yellow out-of-hours or business-hours paused state, the webhook MUST send only the configured schedule message and MUST not call the LLM.

#### Scenario: Global off blocks processing
- GIVEN WhatsApp Sofia is globally off
- WHEN an inbound WhatsApp message reaches the webhook
- THEN the webhook MUST skip Sofia and RAG processing
- AND no LLM call MUST be performed

#### Scenario: Yellow state sends only schedule message
- GIVEN WhatsApp Sofia is in the yellow out-of-hours state
- WHEN an inbound WhatsApp message reaches the webhook
- THEN the webhook MUST send only the configured schedule message
- AND the webhook MUST NOT call the LLM

### Requirement: Global priority over per-conversation awake state

The WhatsApp webhook MUST treat the channel-global Sofia state as higher priority than any per-client or per-conversation awake state.

A conversation that is awake MUST still be blocked when the global channel state is off.

#### Scenario: Awake conversation remains blocked globally
- GIVEN a conversation is awake for Sofia
- AND WhatsApp Sofia is globally off
- WHEN a message arrives for that conversation
- THEN the webhook MUST not invoke Sofia
- AND the awake state MUST NOT override the global off state
