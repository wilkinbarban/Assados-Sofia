# Delta for dashboard_admin

## ADDED Requirements

### Requirement: Orphan Reconciliation Controls

The stock dashboard SHALL expose dry-run orphan reports and approval controls only to active `admin` or `supervisor` users. It SHALL show scope, age, reference-recheck status, claim state, attempts, approval actor/time, deletion outcome, and secret-safe error details; `vendedor` and unauthorized callers SHALL receive no report data or executable control.

#### Scenario: Admin or supervisor reviews and approves
- GIVEN an active admin or supervisor views an eligible orphan report
- WHEN they approve selected candidates
- THEN the UI SHALL display the approval and subsequent claim/audit state

#### Scenario: Seller is denied
- GIVEN an authenticated `vendedor`
- WHEN they request orphan reports or approval actions directly
- THEN access SHALL be denied without disclosing candidate paths

#### Scenario: Cleanup failure remains actionable
- GIVEN an approved cleanup fails
- WHEN the dashboard refreshes
- THEN it SHALL show a safe failure state and retry eligibility
- AND SHALL NOT report the object as deleted

### Requirement: Product Runtime Badge Semantics

Product cards SHALL distinguish manual active status from stock availability. `Esgotados` SHALL select controlled products with zero stock; badges SHALL not represent a manually inactive product as merely out of stock or a stock-exempt active product as unavailable.

#### Scenario: Badge states are unambiguous
- GIVEN active, inactive, zero-stock, positive-stock, and stock-exempt products
- WHEN cards and `Esgotados` render
- THEN each badge and filter result SHALL reflect both active and stock-control semantics

## MODIFIED Requirements

### Requirement: Grade responsiva de produtos

The official Stock tab SHALL render compact responsive product cards. At the designated desktop viewport, the grid SHALL render exactly six columns; smaller viewports SHALL adapt without hiding administrative actions.

(Previously: Desktop supported up to six columns, allowing fewer columns at the evidence viewport.)

#### Scenario: Six-column desktop geometry
- GIVEN the designated desktop viewport and at least six products
- WHEN the Stock tab renders
- THEN the first six cards SHALL occupy one row in exactly six columns

#### Scenario: Responsive operation
- GIVEN a smaller supported viewport
- WHEN products render
- THEN cards SHALL reflow and every permitted action SHALL remain accessible

### Requirement: Restrições administrativas existentes

Only authenticated users with active `admin` or `supervisor` profiles SHALL access Stock, movement history, orphan reports, or cleanup controls. Authentication at the route SHALL NOT substitute for server and Data API authorization.

(Previously: The restriction covered the official Stock surface without explicitly covering cleanup data/actions or layered enforcement.)

#### Scenario: Authorized roles
- GIVEN an active authenticated admin or supervisor
- WHEN they access permitted stock administration
- THEN the system SHALL authorize the surface and corresponding server operations

#### Scenario: Unauthorized roles and direct calls
- GIVEN an absent/inactive session or a role other than admin/supervisor
- WHEN the caller uses the UI, server endpoint, RPC, or Data API
- THEN access SHALL be denied and administrative data SHALL remain undisclosed
