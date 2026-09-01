# Delta for client-payment-receipts
## MODIFIED Requirements
### Requirement: Validated PDF admission
Web chat MUST submit valid bounded PDF bytes to canonical admission instead of directly publishing `comprovantes`; visibility and handoff MUST follow the admission result.
(Previously: valid PDF upload directly created the visible record and handoff.)
#### Scenario: Valid Web PDF
- GIVEN an authenticated customer uploads a valid PDF
- WHEN admission succeeds
- THEN the proof follows canonical visibility and handoff rules.
#### Scenario: Invalid Web media
- GIVEN malformed, oversized, or non-PDF bytes
- WHEN submitted
- THEN no storage-backed proof, message, or LLM job is admitted.
