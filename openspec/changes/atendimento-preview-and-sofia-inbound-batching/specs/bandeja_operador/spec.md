# Delta for bandeja_operador

## ADDED Requirements

### Requirement: Deterministic authenticated receipt preview

The operator receipt action **"Visualizar Comprovante Anexo"** MUST resolve exactly one authenticated preview path. When the selected message has a `payment_proof_id`, the system MUST use only the canonical payment-proof preview for that identifier and MUST NOT invoke an attachment-media preview. Only when `payment_proof_id` is absent and `url_anexo` is present, the system MUST use only the authenticated attachment-media preview. The action MUST NOT select a preview path when neither identifier is available.

#### Scenario: Canonical proof takes exclusive precedence

- GIVEN an operator selects a message with both `payment_proof_id` and `url_anexo`
- WHEN the operator invokes **"Visualizar Comprovante Anexo"**
- THEN the system MUST open only the authenticated canonical payment-proof preview for `payment_proof_id`
- AND the system MUST NOT invoke an attachment-media preview

#### Scenario: Attachment-only message uses authenticated media preview

- GIVEN an operator selects a message with no `payment_proof_id` and an available `url_anexo`
- WHEN the operator invokes **"Visualizar Comprovante Anexo"**
- THEN the system MUST open only the authenticated attachment-media preview
- AND the system MUST NOT invoke a canonical payment-proof preview

### Requirement: Visible receipt-preview failure

The operator interface MUST surface a visible, actionable failure state when the selected authenticated preview cannot be fetched, authorized, or rendered, including a non-successful preview response. The interface MUST NOT silently ignore a failed preview action.

#### Scenario: Canonical preview fetch fails

- GIVEN an operator has selected a message with a `payment_proof_id`
- WHEN the canonical authenticated preview fails or returns a non-successful response
- THEN the interface MUST show a visible preview failure state to the operator
- AND the interface MUST NOT silently complete the action

#### Scenario: Attachment-only preview cannot load

- GIVEN an operator has selected an attachment-only message with `url_anexo`
- WHEN the authenticated media preview cannot load or render the attachment
- THEN the interface MUST show a visible preview failure state to the operator
- AND the interface MUST NOT invoke a canonical payment-proof preview
