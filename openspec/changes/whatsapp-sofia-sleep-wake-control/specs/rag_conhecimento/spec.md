# Delta for rag_conhecimento

## ADDED Requirements

### Requirement: RAG suppression for sleeping WhatsApp customers

The RAG pipeline MUST NOT generate Sofia replies for a WhatsApp customer while that customer is sleeping, even if the conversation would otherwise be IA-active.

#### Scenario: Sleeping customer sends a WhatsApp message
- GIVEN a WhatsApp customer is sleeping
- WHEN a new inbound WhatsApp message is stored
- THEN the RAG pipeline MUST not execute for that customer
- AND no Sofia reply MUST be generated

#### Scenario: Customer wakes later
- GIVEN a WhatsApp customer was sleeping and is later woken
- WHEN the next inbound WhatsApp message arrives
- THEN the RAG pipeline MAY execute again if the conversation is otherwise eligible

## MODIFIED Requirements

### Requirement: Execution of the RAG inbound pipeline

The pipeline of RAG MUST be triggered automatically for new customer messages only when the conversation is eligible for IA, and it MUST be suppressed when the WhatsApp customer is sleeping.
(Previously: The pipeline ran for every inserted customer message unless `ia_ativa = FALSE`.)

#### Scenario: IA-active but sleeping customer
- GIVEN a conversation with `ia_ativa = TRUE` whose WhatsApp customer is sleeping
- WHEN a new message is inserted
- THEN the pipeline MUST NOT call OpenRouter
- AND the customer MUST remain routed to human handling
