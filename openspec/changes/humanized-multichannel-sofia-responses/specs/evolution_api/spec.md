# Delta for evolution_api

## ADDED Requirements

### Requirement: Evolution durable batch adoption and composing pace

When the default-closed Evolution adoption control is enabled, eligible non-duplicate WhatsApp/Evolution inbound messages MUST enter the shared durable Sofia batching contract after existing canonical intake, persistence, and policy gates. Evolution MUST NOT produce a direct per-message Sofia response through this adoption path.

After durable response-delivery authority is acquired, Evolution MUST use its embedded composing and delay capability. Its composing state MUST remain active throughout generation and only the remaining portion of the shared 2–6 second response-length-derived minimum. The Evolution send MUST remain a single fenced external response attempt.

#### Scenario: Evolution joins the shared batch

- GIVEN Evolution adoption is enabled and an eligible non-duplicate inbound message is accepted
- WHEN canonical intake and persistence finish
- THEN the message MUST join the conversation's durable pending Sofia batch
- AND the webhook MUST NOT generate a direct per-message Sofia response

#### Scenario: Evolution composing covers only the required pace

- GIVEN a durable Evolution response has final delivery authority
- AND generation completes before its computed 2–6 second minimum
- WHEN the final message is sent
- THEN Evolution MUST use embedded composing for generation and the remaining delay
- AND it MUST send only one fenced final response attempt
