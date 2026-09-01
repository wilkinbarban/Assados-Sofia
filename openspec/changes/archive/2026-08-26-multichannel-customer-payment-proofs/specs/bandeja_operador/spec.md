# Delta for bandeja_operador
## ADDED Requirements
### Requirement: Operator proof projection
Operator chat MUST show admitted proofs once as PNG and MUST hide pending, quarantined, duplicate, or purged proofs. Original PDF actions MUST NOT appear in chat.
#### Scenario: Operator history
- GIVEN an admitted customer proof
- WHEN the operator opens the conversation
- THEN one PNG is shown without PDF access.
