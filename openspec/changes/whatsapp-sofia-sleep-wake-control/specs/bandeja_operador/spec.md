# Delta for bandeja_operador

## ADDED Requirements

### Requirement: Manual WhatsApp sleep and wake control

The `/atendimento` operator interface MUST expose a manual control to sleep and wake Sofia for a WhatsApp customer, independent of the IA manual toggle.

#### Scenario: Operator sleeps a customer
- GIVEN an operator opens a WhatsApp conversation in `/atendimento`
- WHEN the operator chooses the sleep control
- THEN the customer MUST be marked as sleeping
- AND the conversation MUST remain in human handling

#### Scenario: Operator wakes a customer
- GIVEN a customer is sleeping for WhatsApp
- WHEN the operator uses the wake control
- THEN the sleep state MUST be cleared
- AND future inbound WhatsApp messages MAY be eligible for Sofia/RAG again

### Requirement: Handoff state is visible in the inbox

The `/atendimento` inbox MUST display whether a WhatsApp customer is sleeping or waking so operators can see why Sofia is suppressed.

#### Scenario: Sleeping customer label
- GIVEN a conversation belongs to a sleeping WhatsApp customer
- WHEN the list of conversations is rendered
- THEN the conversation MUST show a human-handling state indicator
- AND the operator MUST be able to wake the customer from the same screen
