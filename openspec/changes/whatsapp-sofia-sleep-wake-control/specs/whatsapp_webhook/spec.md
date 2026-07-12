# Delta for whatsapp_webhook

## ADDED Requirements

### Requirement: WhatsApp customer sleep state

The system MUST persist a WhatsApp-only sleep state per customer and MUST treat it as higher priority than IA conversation activation.

#### Scenario: Sleeping customer receives inbound WhatsApp
- GIVEN a WhatsApp customer is marked as sleeping
- WHEN a new inbound WhatsApp message arrives for that customer
- THEN the webhook MUST NOT create a new `ia_atendendo` conversation
- AND the message MUST remain routed to human handling

#### Scenario: Sleeping customer has no open human conversation
- GIVEN a WhatsApp customer is marked as sleeping and has no open human conversation
- WHEN an inbound WhatsApp message arrives
- THEN the system MUST create or reuse a human-handled conversation
- AND the system MUST keep `ia_ativa = false`

### Requirement: WhatsApp handoff phrases trigger sleep

The system MUST recognize handoff phrases such as `humano`, `atendente`, and `quiero hablar con alguien` on inbound WhatsApp and MUST move the customer into human handling.

#### Scenario: Spanish handoff request
- GIVEN a customer sends `quiero hablar con alguien`
- WHEN the webhook processes the inbound WhatsApp message
- THEN the customer MUST be marked as sleeping
- AND the conversation MUST be routed to human handling

#### Scenario: Explicit human request from chat
- GIVEN a customer sends `atendente`
- WHEN the webhook processes the message
- THEN the system MUST suppress Sofia replies for that customer
- AND the message MUST be stored without creating an IA-active conversation

## MODIFIED Requirements

### Requirement: Auto-registration of customers and conversations

For each valid inbound WhatsApp message, the system MUST extract the customer phone and Meta profile name, validate the Curitiba number format, auto-register missing customers, and associate the message with an existing human-handled conversation or create a human-handled conversation when the customer is sleeping.
(Previously: Inbound messages always created a new `ia_atendendo` conversation when none existed or the latest conversation was closed.)

#### Scenario: Sleeping customer inbound message
- GIVEN a sleeping WhatsApp customer with a closed or missing conversation
- WHEN an inbound message arrives
- THEN the system MUST not create `ia_atendendo`
- AND the message MUST be linked to a human-handled conversation
