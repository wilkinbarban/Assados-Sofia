# Delta for operator-receipts-management
## ADDED Requirements
### Requirement: Secure proof workflow
The panel MUST support identity, review, 10-day quarantine countdown, restore, links, value confirmation, provenance, and failure state. Sellers MUST NOT access original PDFs; active admins/supervisors MAY access them.
#### Scenario: Seller review
- GIVEN an admitted proof
- WHEN a seller reviews it
- THEN workflow actions and PNG are shown without PDF access.
#### Scenario: Admin restoration
- GIVEN quarantine has time remaining
- WHEN an admin restores it
- THEN review resumes and one correction notification is queued.
