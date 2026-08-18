# Delta for Validacao Telefone

## MODIFIED Requirements

### Requirement: Canonical and explicit phone verification

Every client phone entering through web, Telegram, WhatsApp, migration, or profile change MUST normalize to `^55419[0-9]{8}$` or be rejected. Verified ownership MUST be represented explicitly with verification time and provenance; mere `usuario_id` linkage MUST NOT count as verification. One verified phone MUST NOT belong to multiple accounts.
(Previously: web OTP enforced Curitiba format, Telegram normalization differed, and client linkage implicitly represented verification.)

#### Scenario: Consistent channel normalization
- GIVEN equivalent formatted Curitiba phones arrive through web and Telegram
- WHEN normalized
- THEN both MUST resolve to the same canonical value

#### Scenario: Unsupported phone
- GIVEN a fixed-line, non-41, or malformed number
- WHEN received through any channel
- THEN it MUST be rejected before ownership or OTP operations

### Requirement: Atomic verified ownership

Successful purpose-bound OTP finalization MUST atomically consume the challenge, set explicit verification evidence, and create, merge, or change the client phone without losing conversations, orders, or receipts.
(Previously: OTP consumption and account merge could occur as separate operations.)

#### Scenario: Existing channel history
- GIVEN an unowned channel client holds history for the verified phone
- WHEN signup OTP finalizes
- THEN ownership and all supported history MUST merge in one transaction
- AND failure MUST leave no partial ownership or consumed-success state
