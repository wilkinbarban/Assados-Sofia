# Delta for horario_atendimento

## ADDED Requirements

### Requirement: Yellow state uses schedule message only

When a channel is outside business hours or paused by schedule, the system MUST enter a yellow state for that channel.

In the yellow state, the system MUST send only the configured out-of-hours schedule message and MUST NOT invoke the LLM.

#### Scenario: Out-of-hours response
- GIVEN the current time is outside the configured business hours
- WHEN a WhatsApp or Telegram message arrives
- THEN the system MUST send the configured schedule message only
- AND the system MUST NOT call the LLM

### Requirement: Scheduled pause is distinct from global off

The schedule-driven yellow state MUST be distinct from the red global-off state.

A yellow state MUST mean the channel is temporarily constrained by business hours, while a red state MUST mean Sofia is globally disabled for that channel.

#### Scenario: Different colors for different causes
- GIVEN a channel is outside business hours
- WHEN the status is rendered
- THEN the channel MUST be yellow
- GIVEN a channel is globally disabled
- WHEN the status is rendered
- THEN the channel MUST be red
