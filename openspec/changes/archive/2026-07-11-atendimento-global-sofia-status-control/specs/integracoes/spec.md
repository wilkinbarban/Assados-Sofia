# Delta for integracoes

## ADDED Requirements

### Requirement: Global channel Sofia settings

The system MUST persist and read two independent global Sofia settings, one for WhatsApp and one for Telegram.

Each setting MUST be available to the operator surface and to webhook processing.

#### Scenario: Persist independent channel settings
- GIVEN an administrator updates the Sofia availability for WhatsApp
- WHEN the setting is saved
- THEN the WhatsApp global state MUST be persisted independently of Telegram
- AND the Telegram state MUST remain unchanged

### Requirement: Telegram global Sofia gate

The Telegram webhook MUST check the Telegram global Sofia state before any Sofia or RAG processing occurs.

When Telegram is globally off, the webhook MUST not call Sofia, MUST not call RAG, and MUST not generate an LLM response, even if the conversation is awake.

#### Scenario: Telegram global off blocks processing
- GIVEN Telegram Sofia is globally off
- WHEN an inbound Telegram message reaches the webhook
- THEN the webhook MUST skip Sofia and RAG processing
- AND no LLM call MUST be performed

#### Scenario: Telegram awake conversation remains blocked globally
- GIVEN a Telegram conversation is awake for Sofia
- AND Telegram Sofia is globally off
- WHEN a message arrives for that conversation
- THEN the webhook MUST not invoke Sofia
- AND the awake state MUST NOT override the global off state

### Requirement: Provider-neutral LLM credit status

The system MUST expose a provider-neutral LLM credit status that returns the remaining USD value, freshness metadata, and availability state.

The credit status MUST be refreshable at least every 30 minutes and MUST support a stale or unknown state when the provider is unavailable.

#### Scenario: Refreshable credit status
- GIVEN the provider returns a current balance
- WHEN the status is requested
- THEN the system MUST return the remaining USD value
- AND the status MUST include freshness metadata no older than 30 minutes after refresh

#### Scenario: Unavailable provider
- GIVEN the credit provider cannot be queried
- WHEN the status is requested
- THEN the system MUST return a stale or unknown state
- AND it MUST NOT invent a current balance
