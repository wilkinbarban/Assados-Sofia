# Delta for client-unified-chat
## ADDED Requirements
### Requirement: Admitted proof projection
Customer history MUST show one faithful PNG for an admitted proof and MUST hide pending identity, quarantined, duplicate, or purged proofs. It MUST NOT expose original PDF URLs or downloads.
#### Scenario: Visible admitted proof
- GIVEN admission completed for this customer
- WHEN history loads
- THEN exactly one PNG is visible.
#### Scenario: Hidden pending proof
- GIVEN identity remains unresolved
- WHEN history loads
- THEN no proof message or attachment exists.
