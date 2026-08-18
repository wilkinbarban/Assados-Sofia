# Delta for Autenticacao Email

## ADDED Requirements

### Requirement: Client email is optional profile data

Client email MUST be optional, editable only after client authentication, and MUST NOT gate signup, login, recovery, or portal access. Email-related responses MUST NOT reveal whether an address belongs to a client.

#### Scenario: Registration without email
- GIVEN a new client provides valid phone credentials
- WHEN registration is submitted without email
- THEN registration MUST continue to phone verification
- AND no confirmation email MUST be sent

#### Scenario: Profile email removal
- GIVEN an authenticated client has a profile email
- WHEN the client removes it
- THEN phone login and OTP recovery MUST remain available

## REMOVED Requirements

### Requirement: Client signup confirmation email, callback, and status page

(Reason: confirmation email is no longer part of client registration or access.)
(Migration: confirmation templates MAY remain for operator-owned email workflows, but client signup links and redirects MUST be retired after compatibility cutover.)
