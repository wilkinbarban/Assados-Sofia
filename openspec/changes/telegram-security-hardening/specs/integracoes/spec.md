# Delta for Integracoes

## ADDED Requirements

### Requirement: Telegram Webhook Secret Validation

The system MUST reject Telegram webhook requests unless `X-Telegram-Bot-Api-Secret-Token` matches the configured shared secret.

#### Scenario: Valid secret token
- GIVEN a POST request to `/api/webhooks/telegram` with the expected secret token
- WHEN the request is received
- THEN the system MUST continue webhook processing

#### Scenario: Missing or mismatched secret token
- GIVEN a POST request to `/api/webhooks/telegram` without the secret token or with a different value
- WHEN the request is received
- THEN the system MUST reject the request before processing the update body

## MODIFIED Requirements

### Requirement: REQ-TEL-008 — Process Telegram text updates securely

The system MUST process Telegram text-message updates only after webhook authentication and secure idempotency checks.
The system MUST derive the inbound deduplication key from the chat scope and message identity, using a value equivalent to `telegram:${chatId}:${messageId}`; `message_id` alone MUST NOT be used as a unique key.
The system MUST accept and link a shared contact phone only when `message.contact.user_id === message.from.id`.
The system MUST ignore or reject contact-based phone linking when ownership cannot be proven.
(Previously: The system processed text updates using `telegram_mensagem_id` idempotency and created/linked clients from Telegram messages without ownership validation.)

#### Scenario: Unique message in a chat
- GIVEN a Telegram text update with a valid webhook secret
- AND the chat id and message id have not been processed together before
- WHEN the update is received
- THEN the system MUST process it once

#### Scenario: Same message id in different chats
- GIVEN two Telegram updates with the same `message_id` but different `chat.id` values
- WHEN the second update is received
- THEN the system MUST treat it as a distinct event

#### Scenario: Shared contact owned by sender
- GIVEN a Telegram contact message where `message.contact.user_id` equals `message.from.id`
- WHEN the update is processed
- THEN the system MAY use the contact phone for linking or updating the client record

#### Scenario: Shared contact not owned by sender
- GIVEN a Telegram contact message where `message.contact.user_id` does not equal `message.from.id`
- WHEN the update is processed
- THEN the system MUST NOT link that phone to the client record
- AND the system MUST NOT update `clientes.telefone` from that contact
