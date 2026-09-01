# Delta for payment-proof-reconciliation

## ADDED Requirements

### Requirement: Active seller reconciliation authority

Every active user whose role is `vendedor` MUST be authorized to confirm a proof amount, link eligible customer orders, reconcile or approve, and reject a payment proof for any customer. Inactive sellers and every role not explicitly authorized for the action MUST be denied by the authoritative layer; application actions and UI controls MUST also prevent or clearly reject the prohibited action.

#### Scenario: Customer-wide active seller reconciliation

- GIVEN an active `vendedor` and an eligible proof for a customer not assigned to that seller
- WHEN the seller confirms the amount and reconciles the proof with eligible orders
- THEN the authoritative layer MUST permit the action subject to all proof invariants.

#### Scenario: Inactive or unauthorized actor

- GIVEN an inactive `vendedor` or an actor in another unauthorized role
- WHEN the actor attempts a seller reconciliation action
- THEN the action MUST be denied, no state or linkage MUST change, and the UI MUST provide negative authorization feedback.

### Requirement: Restricted exceptional operations

Restore, purge, dead-letter inspection, and replay mutation MUST NOT be available to a `vendedor`. Those operations MUST be restricted to active supervisors or administrators according to their applicable authorization requirements.

#### Scenario: Seller recovery attempt

- GIVEN an active `vendedor`
- WHEN the seller attempts restore, purge, dead-letter inspection, or replay mutation
- THEN the operation MUST be denied and MUST NOT change proof, queue, or recovery state.

### Requirement: Locked exact reconciliation invariants

A reconciliation or rejection MUST require an authoritative proof lock held by the acting operator and MUST reject lock conflicts, expired ownership, invalid proof states, and invalid transitions. Reconciliation MUST atomically enforce exact confirmed amount equality, same-customer linkage, eligible-order state, and idempotent outcome; a failed invariant MUST leave proof, order, payment, and linkage state unchanged.

#### Scenario: Conflicting or invalid reconciliation

- GIVEN a proof is locked by another operator, has an expired actor lock, has an invalid state, or is linked to foreign, ineligible, or amount-mismatched orders
- WHEN reconciliation is attempted
- THEN the operation MUST fail without partial state changes and the UI MUST provide specific safe negative feedback.

### Requirement: Immutable reconciliation actor audit

Every seller or privileged reconciliation action MUST append audit evidence containing immutable actor identity, role at action time, action, timestamp, proof, relevant customer and order linkage, and transition outcome. Historic audit role data MUST NOT be derived from a mutable current profile.

#### Scenario: Role changes after action

- GIVEN a seller completes a reconciliation and later changes role or becomes inactive
- WHEN the historical action is inspected
- THEN the audit record MUST retain the actor identity and the role captured at the time of action.
