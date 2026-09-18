# Delta for integracoes

## ADDED Requirements

### Requirement: Telegram durable batching and typing lifecycle

When the default-closed Telegram adoption control is enabled, eligible non-duplicate Telegram inbound messages MUST enter the shared durable Sofia batching contract after existing canonical intake, persistence, and policy gates. Telegram MUST NOT generate a direct per-message Sofia response through this adoption path.

After durable response-delivery authority is acquired, the system MUST issue Telegram's typing activity for the target chat during generation and any remaining shared pacing delay. A typing failure MAY be treated as best effort, but it MUST NOT bypass delivery fencing, create another response attempt, or cause response regeneration.

#### Scenario: Telegram typing follows durable authority

- GIVEN a durable Telegram batch has been generated and has acquired final delivery authority
- WHEN its response is being prepared for delivery
- THEN the system MUST issue Telegram typing for that batch's target chat before its final message attempt
- AND the typing lifecycle MUST cover generation plus only any remaining pacing delay

#### Scenario: Telegram typing failure remains fenced

- GIVEN Telegram typing fails after final delivery authority is acquired
- WHEN the batch reaches a terminal delivery outcome
- THEN the system MUST record the terminal outcome without regenerating the response
- AND the system MUST NOT create an additional final-message attempt
