# Delta for perfil_operador

## ADDED Requirements

### Requirement: Column-Safe Self-Service Profile Updates

Authenticated operators SHALL update only explicitly approved self-service columns belonging to `auth.uid()`. Direct or indirect self-service writes to `funcao`, `ativo`, another profile, or unspecified columns SHALL be denied by Data API grants and RLS, even when a crafted request bypasses the UI.

#### Scenario: Safe self-service update
- GIVEN an authenticated operator updating an approved profile column on their own row
- WHEN the update is submitted
- THEN the approved value SHALL be persisted
- AND a secret- and PII-safe audit event SHALL identify actor, target, and changed column

#### Scenario: Direct privilege escalation is denied
- GIVEN an authenticated `vendedor` using the Data API
- WHEN they attempt to update their own `funcao` or `ativo`
- THEN grants or RLS SHALL deny the write
- AND the row and audit history SHALL remain unchanged

#### Scenario: Cross-profile or mixed-column update is denied
- GIVEN any authenticated operator submits an update containing an approved field plus a protected field, or targets another profile
- WHEN the statement is evaluated
- THEN the entire statement SHALL be rejected without partial persistence

### Requirement: Managed Role and Status Changes

Role and activation changes SHALL occur only through an authenticated managed operation authorized for active `admin` or `supervisor` actors. It SHALL derive the actor from the session, enforce self-lockout and last-active-admin protections, and atomically append an immutable audit record containing previous and new values.

#### Scenario: Authorized managed change
- GIVEN an active authorized actor and an eligible target
- WHEN role or status is changed through the managed operation
- THEN the profile and audit record SHALL commit atomically
- AND the audit actor SHALL equal the authenticated session identity

#### Scenario: Unauthorized or unaudited change fails
- GIVEN an anonymous, inactive, `vendedor`, or direct Data API caller
- WHEN they request a protected-column change
- THEN the operation SHALL be denied with no profile mutation

#### Scenario: Audit failure rolls back
- GIVEN a valid managed change but audit persistence fails
- WHEN the transaction completes
- THEN the profile SHALL retain its previous role and status
