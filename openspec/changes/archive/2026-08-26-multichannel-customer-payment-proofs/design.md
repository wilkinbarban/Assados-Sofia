# Design: Multichannel Customer Payment Proofs

## Technical Approach
Next.js 16 Node Route Handlers normalize all channel deliveries into one PostgreSQL admission authority. Original PDFs remain private; admitted server-rendered PNGs become chat messages. PostgreSQL owns state, dedupe, reconciliation, audit, claims, and outbox; workers own validation/hash, rendering, advisory extraction, notifications, and purge.

## Architecture Decisions
| Decision | Choice | Alternatives / rationale |
|---|---|---|
| Authority | Security-definer RPCs with locked rows and append-only events | Reject per-channel writes/direct table DML; one authority prevents drift and races. |
| Schema | `payment_proofs`, `payment_proof_events`, `payment_proof_orders`, `payment_proof_hash_tombstones`, `payment_proof_jobs`, `payment_proof_outbox` | Legacy `comprovantes` cannot safely represent identity, claims, lifecycle, links, or side effects. |
| State machine | `received → identity_pending → processing → review → admitted`; rejection enters `quarantined`, then `review` by restore or `purged` by expiry; duplicates terminally reference only canonical hash internally | Explicit states expose exits and prevent parallel truth. |
| Dedupe | SHA-256 exact bytes claimed by unique tombstone row in the same transaction as canonical creation | Filename/customer-scoped or application checks race and allow cross-channel replay. |
| Storage | Private original and derivative prefixes keyed by proof UUID; no signed Storage URLs in chats | Generic path access lacks proof authorization. |
| Media API | Node Route Handlers `/api/payment-proofs/[id]/preview` and admin-only `/original`; `force-dynamic`, authenticated ownership/role lookup before admin download | Matches installed Next 16 guidance and avoids client storage access. |
| PNG worker | Locally pinned PDF renderer produces deterministic first-page PNG, size/pixel/page bounded; failure remains reviewable | Browser PDF.js is not a durable derivative authority. |
| LLM | Worker sends bounded extracted text/image representation; result stores suggestion/confidence/model, never commands | Prompt content remains untrusted. |
| Reconciliation | `confirm_and_approve_payment_proof` locks proof/orders, validates active staff, customer/status/exact cents, writes links/events, then calls existing payment authority | UI checks race; replacing payment authority weakens history. |
| Side effects | Transactional outbox with stable idempotency key; scheduler claims `SKIP LOCKED`, bounded exponential retry and dead-letter visibility | Direct notifications fail inconsistently. |
| Quarantine | `quarantined_at`, `purge_after = +10 days`; scheduler purges objects/PNG but retains tombstone/events | Preserves countdown, restore, and dedupe after deletion. |

## Data Flow
```text
Channel adapter → private staged bytes → validate/hash job → admission RPC
                                            ├─ duplicate → generic outbox notice
                                            └─ canonical → identity → render/LLM → staff review
staff confirm + order links → reconciliation RPC → existing payment authority
quarantine scheduler → purge objects ────────────────→ tombstone/events retained
```

## Interfaces / Contracts
- `admit_payment_proof(delivery_key, channel, sender_ref, storage_key, sha256, size, mime)` returns disposition without foreign metadata.
- `resolve_payment_proof_identity(proof_id, customer_id, intent_key)` requires authorized staff.
- `transition_payment_proof(proof_id, action, reason, intent_key)` enforces lifecycle transitions.
- `confirm_and_approve_payment_proof(proof_id, confirmed_cents, order_ids[], intent_key)` enforces customer, pending status, exact sum, and idempotency.
- `approve_manual_external_payment(order_ids[], reason, intent_key)` delegates to existing manual authority without proof creation.

## File Changes
| Area | Action | Description |
|---|---|---|
| `supabase/migrations/` | Create | Tables, enums/checks, RPCs, RLS, grants, backfill, outbox claims |
| `apps/web/src/lib/payment-proofs/` | Create | Channel-neutral adapters, job/outbox contracts, renderer/LLM validation |
| `apps/web/src/app/api/payment-proofs/` | Create | Authorized preview/original and internal worker endpoints |
| `apps/web/src/app/api/webhooks/{whatsapp,evolution,telegram}/route.ts` | Modify | Normalize PDF deliveries only |
| `apps/web/src/components/{chat,operator,comprovantes}/` | Modify | PNG-only chat and management workflow |
| `ops/` and `docker-compose.yml` | Modify | Restartable claim scheduler using required secret |

## Testing Strategy
| Layer | Evidence |
|---|---|
| SQL pgTAP on disposable local Supabase | RLS/grants, transition matrix, concurrent hash claim, tombstone, exact reconciliation, idempotency, backfill |
| Vitest | PDF validation, channel normalization, low confidence, renderer bounds, outbox retry/idempotency, authorization |
| Component/E2E | Hidden-before-admission, PNG-only chats, role-specific PDF, countdown/restore, exact-value blocking |
| Operations | Scheduler restart, dead-letter visibility, object purge while hash remains |

## Threat Matrix
N/A — no shell, subprocess, VCS/PR automation, executable classification, or command routing is introduced. External channel and LLM boundaries are handled as untrusted data by validation, authorization, and advisory-only contracts.

## Migration / Rollout
1. Add schema/RPC/RLS/jobs dark; keep existing reads.
2. Hash current originals in local/disposable validation, then production backfill. Consolidate only when the known pair is byte-identical; otherwise flag review.
3. Enable Web intake, then Telegram, then WhatsApp/Evolution adapters; keep one canonical projection.
4. Enable management/reconciliation and quarantine scheduler.
5. Remove legacy direct `comprovantes`/generic path access only after parity checks.

Rollback disables adapters/workers and restores legacy UI reads; schema, originals, tombstones, and audit remain. No destructive down migration or payment rollback occurs.

## Observability
Metrics: intake/disposition, identity age, render/LLM latency, confidence, quarantine expiry, duplicate races, outbox attempts/dead letters, reconciliation denials. Logs use proof/delivery opaque IDs only; alerts cover stalled jobs, purge failure, and authorization anomalies.

## Open Questions
None blocking. Exact renderer library is selected during tasks after confirming Node 20 compatibility and local-container reproducibility; its contract is fixed above.
