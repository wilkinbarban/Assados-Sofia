# Delta for evolution_api

## ADDED Requirements

### Requirement: Evolution inbound processing honors WhatsApp sleep state

The Evolution webhook MUST apply the same WhatsApp sleep and wake rules used by the Meta webhook.

#### Scenario: Sleeping customer on Evolution
- GIVEN a customer is marked as sleeping for WhatsApp
- WHEN Evolution receives an inbound `messages.upsert` event for that customer
- THEN the webhook MUST NOT create a new `ia_atendendo` conversation
- AND the message MUST be routed to human handling only

#### Scenario: Handoff phrase on Evolution
- GIVEN an inbound Evolution message contains `humano`, `atendente`, or `quiero hablar con alguien`
- WHEN the webhook processes the event
- THEN the customer MUST be marked as sleeping
- AND Sofia/RAG replies MUST be suppressed for that customer

## MODIFIED Requirements

### Requirement: Unified inbound WhatsApp processing

The Evolution webhook MUST continue routing inbound messages into the same unified customer, conversation, and message pipeline used by the Meta webhook, but that pipeline MUST honor WhatsApp sleep state before any IA conversation activation.
(Previously: Evolution routed inbound messages through the unified pipeline without a customer sleep-state gate.)

#### Scenario: Unified pipeline with sleep gate
- GIVEN the unified pipeline receives an Evolution inbound message
- WHEN the customer is sleeping
- THEN the pipeline MUST keep the conversation in human handling
- AND it MUST NOT create a new IA-active conversation
