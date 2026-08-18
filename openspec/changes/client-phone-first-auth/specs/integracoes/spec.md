# Delta for Integracoes

## ADDED Requirements

### Requirement: Authoritative WhatsApp OTP provider

All WhatsApp OTP delivery MUST resolve the single active provider configuration used by normal outbound messaging. `META` MUST use current Meta credentials; `EVOLUTION` MUST use the current Evolution instance and credentials. Environment-only or inactive-provider bypasses MUST NOT be used.

#### Scenario: Evolution is active
- GIVEN Evolution is configured, connected, and active
- WHEN an eligible OTP requires WhatsApp delivery
- THEN Evolution MUST receive the outbound request
- AND Meta credentials MUST NOT be required

#### Scenario: Active provider unavailable
- GIVEN the active WhatsApp provider cannot accept delivery
- WHEN no verified Telegram route succeeds
- THEN the request MUST report generic delivery failure
- AND MUST NOT silently switch to an inactive WhatsApp provider

### Requirement: Provider delivery evidence

The integration MUST return normalized acceptance or failure evidence sufficient to decide whether an OTP challenge becomes active, without persisting secrets or plaintext OTPs in logs.

#### Scenario: Accepted send
- GIVEN the active provider accepts an OTP message
- WHEN its response is normalized
- THEN the challenge MAY become active
- AND audit data MUST identify channel and provider without OTP content
