# Delta for whatsapp_webhook
## ADDED Requirements
### Requirement: Shared PDF admission
WhatsApp/Evolution PDF documents MUST use shared admission with delivery idempotency; Telegram SHALL implement the same adapter contract. Ambiguous senders MUST remain invisible pending manual identity.
#### Scenario: Provider retry
- GIVEN a previously handled delivery
- WHEN it is retried
- THEN no duplicate proof, chat projection, or notification is created.
#### Scenario: Ambiguous sender
- GIVEN no unique customer match
- WHEN a PDF arrives
- THEN it awaits identification outside chats.
