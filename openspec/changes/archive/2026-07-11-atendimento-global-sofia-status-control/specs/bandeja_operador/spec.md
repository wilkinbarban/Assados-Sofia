# Delta for bandeja_operador

## ADDED Requirements

### Requirement: Global Sofia controls by channel

The `/atendimento` interface MUST expose two independent global Sofia controls, one for WhatsApp and one for Telegram.

Each control MUST switch only between globally enabled and globally off. The yellow business-hours paused state MUST be derived from the schedule module, not manually selected by the control.

#### Scenario: Independent control per channel
- GIVEN an operator is viewing `/atendimento`
- WHEN the WhatsApp control is turned off and the Telegram control remains on
- THEN WhatsApp and Telegram MUST keep independent global states
- AND changing one control MUST NOT change the other

#### Scenario: Global off overrides local awake state
- GIVEN a conversation is marked awake for a client or conversation
- AND the channel global state is off
- WHEN the webhook or UI evaluates Sofia availability
- THEN the global off state MUST take priority over the awake state
- AND Sofia MUST remain blocked for that channel

### Requirement: Channel status bar

The `/atendimento` status bar MUST show the current state for each channel with the following visual semantics:
- green for operational
- yellow for business-hours paused or out-of-hours programmed message only
- red for globally off

The status bar MUST be channel-specific and MUST make the current state unambiguous.

#### Scenario: Green operational state
- GIVEN a channel is enabled and available for Sofia automation
- WHEN the status bar is rendered
- THEN the channel MUST appear green
- AND the label MUST indicate operational status

#### Scenario: Yellow paused state
- GIVEN a channel is globally enabled but outside business hours or paused by the schedule module
- WHEN the status bar is rendered
- THEN the channel MUST appear yellow
- AND the label MUST indicate that only the programmed schedule message is allowed

#### Scenario: Red globally off state
- GIVEN a channel is globally disabled
- WHEN the status bar is rendered
- THEN the channel MUST appear red
- AND the label MUST indicate that Sofia is globally off

### Requirement: LLM credits indicator

The `/atendimento` interface MUST display an LLM credits indicator for the active Sofia provider/model.

The indicator MUST show the remaining credit as a USD value, MUST refresh at least every 30 minutes, and MUST use the following color mapping:
- green when remaining value is greater than 2 USD
- yellow when remaining value is greater than 1 USD and less than or equal to 2 USD
- red when remaining value is less than 1 USD

If the provider is unavailable or the balance cannot be refreshed, the indicator MUST enter a stale or unknown state instead of showing a misleading numeric value.

#### Scenario: Credits in green range
- GIVEN the provider reports 2.01 USD remaining
- WHEN the indicator is rendered
- THEN the value MUST be shown in USD
- AND the indicator MUST be green

#### Scenario: Credits in yellow and red ranges
- GIVEN the provider reports 1.50 USD remaining
- WHEN the indicator is rendered
- THEN the indicator MUST be yellow
- GIVEN the provider reports 0.75 USD remaining
- WHEN the indicator is rendered
- THEN the indicator MUST be red

#### Scenario: Provider unavailable
- GIVEN the provider cannot be reached during refresh
- WHEN the indicator is updated
- THEN the UI MUST show a stale or unknown state
- AND the last known numeric balance MUST NOT be presented as current
