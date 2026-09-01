# Proposal: Multichannel Customer Payment Proofs

## Intent
Unify PDF payment proofs from Web, WhatsApp, and Telegram. Proofs stay hidden until admitted; staff retain authority. Sales receipts stay separate.

## Scope
### In Scope
- Private intake with provenance, global SHA-256 dedupe, tombstones, quarantine/restoration, and idempotent notifications.
- Manual identity resolution; admitted proofs appear only as PNG views.
- Advisory LLM extraction with mandatory staff confirmation.
- Manual same-customer pending-order linking; approval requires exact value equality.
- Audited proof-backed and human-confirmed external/in-person payments.
- Backfill two duplicate PDFs into one visible PNG while preserving provenance.

### Out of Scope
- Automatic approval/identity, fuzzy amounts, images, or chat PDF access.
- Mercado Pago or thermal sales-receipt changes.

## Capabilities
### New Capabilities
- `multichannel-payment-proof-admission`: Intake, identity gate, global dedupe/tombstones, quarantine, PNG projection, audit, and notifications.
- `payment-proof-reconciliation`: Staff confirmation, same-customer order links, exact-value validation, and approval handoff.

### Modified Capabilities
- `client-payment-receipts`: Route Web PDFs through admission and expose PNG only afterward.
- `operator-receipts-management`: Add identity, quarantine, review, linking, and restoration.
- `client-unified-chat`: Project one admitted PNG across channels.
- `bandeja_operador`: Review admitted proofs without PDF actions.
- `whatsapp_webhook`: Admit PDFs through the shared pipeline.
- `payment-approval-audit`: Record proof-backed or human-confirmed provenance.

## Approach
Feed channel adapters into a database-authoritative ledger. Store originals privately, atomically claim hashes, project admitted PNGs, and keep LLM advisory. Deliver sub-400-line `feature-branch-chain` slices.

## Affected Areas
| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` | New | Ledger, links, dedupe, quarantine, audit, backfill |
| `apps/web/src/app/api/` | Modified | Web/channel intake and protected derivatives |
| `apps/web/src/components/{chat,operator,comprovantes}/` | Modified | PNG-only customer/staff workflow |
| `apps/web/src/app/actions/` | Modified | Review and reconciliation |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Cross-customer disclosure | High | Fail-closed identity/admission and private storage |
| Duplicate races | Medium | Atomic global hash claim plus tombstones |
| Incorrect extraction | Medium | Mandatory human confirmation; no LLM writes |
| Migration data loss | Low | Hash verification, deterministic canonical choice, preserved provenance |

## Rollback Plan
Disable adapters and revert UI projections while retaining immutable audit rows and private objects. Backfill never deletes source evidence.

## Dependencies
- Private Storage, PDF-to-PNG worker, payment RPC, and channel media APIs.

## Success Criteria
- [ ] Exact PDF bytes cannot be admitted twice across any channel or lifecycle state.
- [ ] Unidentified/quarantined proofs never appear in chats; admitted proofs show one PNG only.
- [ ] Payment approval requires authorized review, same-customer pending orders, and exact amount equality.
- [ ] Existing duplicate PDFs migrate without lost provenance or duplicate chat visibility.
