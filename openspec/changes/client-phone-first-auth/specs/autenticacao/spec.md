# Delta for Autenticacao

## MODIFIED Requirements

### Requirement: Role-specific authentication

The system MUST authenticate clients with canonical Curitiba phone and password after explicit phone verification. It MUST preserve email-and-password authentication for active `admin`, `supervisor`, and `vendedor` profiles, secure session cookies, and current role-based route restrictions.
(Previously: all users registered and authenticated with email, and clients required email confirmation before phone verification.)

#### Scenario: Client login
- GIVEN a client has a verified phone and valid password
- WHEN login succeeds
- THEN a secure session MUST be created
- AND the client MUST be routed to the client portal

#### Scenario: Operator regression
- GIVEN an active operator with valid email credentials
- WHEN the operator logs in
- THEN email authentication and role routing MUST behave unchanged

#### Scenario: Unverified client
- GIVEN a newly created client has not completed phone OTP verification
- WHEN protected client access is attempted
- THEN access MUST be denied or routed to phone verification

## REMOVED Requirements

### Requirement: Client email-first signup and confirmation

(Reason: client identity is now established by required phone plus password and phone verification.)
(Migration: legacy email login remains temporarily available only through the controlled compatibility rollout.)
