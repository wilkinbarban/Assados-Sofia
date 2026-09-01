# Exploration Notes: Canonical Payment Proof Operations

**Change Name:** `canonical-payment-proof-operations`
**Phase:** SDD Exploration (Corrected Rerun)
**Artifact Store:** OpenSpec (`openspec/changes/canonical-payment-proof-operations/exploration.md`)
**Delivery Strategy:** ask-on-risk
**Review Budget:** 400 authored changed lines per review unit
**Chain Strategy:** deferred (recommended: Chained PRs across 5 work units)
**RDD Status:** Enabled explicitly by user

---

## 1. Exploration Methodology & CodeGraph Notice

*Exploration Notice:* CodeGraph MCP tools were not active in this execution context, and shell execution commands are omitted per environmental tier constraints. Exploration was conducted via detailed static code inspection, test suite analysis, schema verification, and filesystem routing checks using available read and search capabilities.

---

## 2. Executive Summary & Context

This change unifies and hardens payment proof ingestion, queuing, seller reconciliation, outbox delivery, alert signals, and gate controls across all messaging channels (Web, Evolution WhatsApp, Telegram).

### Key Confirmed Product & Architectural Directives
1. **SQL Green Baseline Priority:** Before making operational adjustments, all 11 existing pgTAP test assertion and harness failures must be diagnosed and resolved to establish a clean green test baseline.
2. **Evolution API WhatsApp Authority:** Evolution API is the sole authoritative production WhatsApp provider. WhatsApp Cloud API (`webhooks/whatsapp/route.ts`) must not operate a parallel intake path; explicit disabled/read-only/deprecation behavior must be enforced without breaking HTTP GET/POST webhook verification handshakes.
3. **Async Queued Architecture:** All channels (Web, Evolution WhatsApp, Telegram) must use fast canonical admission (`admit_and_enqueue_payment_proof`) followed by asynchronous queued processing (`processing-worker.ts`), eliminating synchronous rendering and extraction delays within HTTP webhook handler response cycles.
4. **Active `vendedor` Reconciliation (`vendedor concilia`):** Active sellers (`funcao = 'vendedor'`, `ativo = true`) are authorized to reconcile payment proofs against pending customer orders. Least-privilege assignment scope, proof locking, audit actor logging, and negative UI controls must be designed to complement database authorization boundaries.
5. **Durable Fail-Closed Gate Controls:** Operational gates must fail closed by default and rely on durable production configuration rather than ephemeral local file overrides (`/home/wilkin/.cache/...`).

---

## 3. Inventory & Phasing of pgTAP Assertion Failures (Baseline SQL Recovery)

Phase 1 requires establishing a green SQL test baseline as the first invariant unit. Static inspection inventories 11 failing test assertions/blocks across 4 pgTAP test files:

### 1. `supabase/tests/payment_proof_operational_metrics.sql` (6 Failures)
- **Signature Mismatch on Maintenance Completion:** The test asserts `complete_payment_proof_maintenance` with an obsolete 4-argument signature `array['text','text','boolean','text']`. The active RPC requires parameter alignment (including lease tokens and attempt counts, e.g. 6-arg signature).
- **Timestamp & Terminal Status Expectations:** Asserts that automatic dead-lettering sets `dead_lettered_at` timestamps, that purge failures transition proofs back to `quarantined` with retry semantics, and that exact failure events (`purge_failed/storage_delete_failed`) are emitted. These expectations represent core domain invariants and must not be assumed stale; RPC completion and dead-letter logic must be verified.
- **Error Detail Sanitization:** Test expects arbitrary error strings (e.g. sensitive worker details) to be replaced with fixed strings (`operation_failed`) in public outbox records to prevent sensitive data leakage. RPC implementation must enforce error masking.

### 2. `supabase/tests/payment_proof_admin_alerts.sql` (4 Failures)
- **Lease / Retry / Dead-Letter Mechanics:** Assertions fail when testing alert outbox claims (`claim_payment_proof_admin_alerts`), active lease lock enforcement, retry backoff, and atomic dead-lettering on the 5th attempt (`dead_letter:5:true`).
- **Unresolved Fixture vs. Product Status:** It is unresolved whether these 4 failures stem from stale test fixture setup (such as simulated timestamps or interval arithmetic during test execution) or genuine product regressions in `claim_payment_proof_admin_alerts` state transition logic. Isolating fixture setup vs RPC bug is required in Phase 1.

### 3. `supabase/tests/payment_proof_processing_queue.sql` (1 Failure)
- **Independent Budget Claim Isolation:** Assertion fails when testing explicit budget progression for `claim_payment_proof_maintenance(10, 'outbox')` and `claim_payment_proof_maintenance(10, 'purge')`.
- **Unresolved Cause:** `claim_payment_proof_maintenance` fails to isolate outbox/purge budgets independently from processing queue claims or returns unexpected payload structures when outbox/purge claims are executed. Budget claim logic requires root-cause remediation.

### 4. `supabase/tests/security_handoff_receipts.sql` (Harness Execution Error)
- **Duplicate Policy Reapplication Error:** The top of the file executes `\ir ../migrations/20260828100000_sofia_handoff_authorization.sql` and `\ir ../migrations/20260828101000_comprovantes_active_staff_rls.sql`. Re-executing migration files containing raw `CREATE POLICY` statements on a pre-migrated test database raises `policy already exists` runtime errors before TAP assertions execute.
- **Remediation:** Refactor test harness setup to use idempotent policy definitions or conditional setup checks (`DROP POLICY IF EXISTS`) instead of re-running raw migration files.

---

## 4. Architectural & Design Decisions (Unresolved Alternatives)

### 1. Durable Operational Gate Authority Source
- **Requirement:** Operational feature gates must be durable, manageable, and fail closed by default.
- **Unresolved Alternatives (To be evaluated in Design phase):**
  - **Option A: Database Settings Table (`configuracoes_sistema`)**: Dynamic SQL/RPC querying, transactional UI toggles, and consistent migration management. Requires runtime in-memory caching to avoid database query overhead per HTTP request.
  - **Option B: Environment / Docker Compose Configuration (`process.env`)**: Zero database runtime overhead, immutable per container deployment. Requires container restarts for state changes; non-dynamic in production operations.
  - **Option C: Signed Operational Control / KV Store**: Cryptographically verified remote or KV configuration. Adds deployment and infrastructure complexity.
- **Decision Status:** Unresolved design decision with safety consequences. Fail-closed behavior is mandatory regardless of storage backend. Source selection is not a blocker to proposal.

### 2. Seller Reconciliation Authority (`vendedor concilia`) & Atendimento UI Scope
- **Requirement:** Active sellers (`vendedor`) are authorized to reconcile payment proofs against customer orders.
- **Clarification on Existing RLS:** `supabase/migrations/20260828101000_comprovantes_active_staff_rls.sql` permits active staff users to read receipts, but does NOT prove or enforce the full intended reconciliation workflow authority.
- **Scope Beyond Bare Role-Array Expansion:** Updating Server Actions (such as `apps/web/src/app/actions/payment-proof-admin.ts`) requires more than extending `['admin', 'supervisor']` to `['admin', 'supervisor', 'vendedor']`. The design must specify:
  - **Proof Locking:** Operator lock acquisition (`acquire_payment_proof_lock`) to prevent concurrent reconciliation by multiple sellers.
  - **Assignment Scope:** Whether sellers can reconcile any pending proof or only proofs linked to customer chats assigned to them.
  - **Audit Logging:** Tracing actor details (`vendedor_id`, role, timestamp, action) in `payment_proof_events`.
  - **Negative Controls:** UI feedback in `PaymentProofAdminPanel.tsx` blocking unauthorized actions, lock steals, or invalid status transitions.

---

## 5. Provider Intake Topology & Legacy Table Clarifications

### 1. Legacy `public.comprovantes` Table vs Canonical Proof Architecture
- **Language Correction:** `public.comprovantes` is a legacy database table protected by staff RLS (`20260828101000_comprovantes_active_staff_rls.sql`), not an unauthenticated public storage bucket.
- **Bypass Analysis:** In `apps/web/src/app/api/webhooks/evolution/route.ts` (lines 451+), media messages bypassing canonical admission fall back to inserting directly into `comprovantes`. This bypasses the canonical proof architecture:
  - **Canonical Proof Ledger:** `public.payment_proofs` (state transitions: `received`, `quarantined`, `review`, `admitted`, `purged`).
  - **Deduplication:** `public.payment_proof_hash_tombstones` (SHA-256 content hashing).
  - **Queueing Outbox:** `public.payment_proof_outbox` & `private.payment_proof_processing_queue`.
  - **Storage Contracts & Lifecycle:** Private storage bucket policies and automated purge scheduling.
- **Remediation:** Remove legacy fallback direct insertion into `comprovantes`. All proof media across all channels must undergo canonical admission (`admit_and_enqueue_payment_proof`).

### 2. Provider Ingestion Contracts
- **Evolution WhatsApp API:** Sole authoritative production WhatsApp intake. Enforces fast canonical admission and async queueing.
- **WhatsApp Cloud API (`webhooks/whatsapp/route.ts`):** Formally disabled for payment proof intake. Must return explicit disabled/deprecation responses for payment media while preserving GET/POST webhook verification handshakes.
- **Web & Telegram Intake:** Utilize fast canonical admission (`admit_and_enqueue_payment_proof`) and return HTTP 200/202 immediately. PDF rendering, OCR, and advisory extraction are deferred to background processing worker (`processing-worker.ts`).

---

## 6. Sequence of 5 Causal Invariants & Rollback Boundaries

To maintain strict compliance with RDD and the **400 changed lines limit per review unit**, work is structured into 5 sequential, independent causal invariants:

### Unit 1: SQL Baseline Recovery & pgTAP Test Idempotency
- **Causal Invariant:** Diagnostic fix for all 11 pgTAP test failures across `payment_proof_operational_metrics.sql` (RPC signature & sanitization), `payment_proof_admin_alerts.sql` (lease/retry fixtures vs RPC logic), `payment_proof_processing_queue.sql` (budget claim isolation), and `security_handoff_receipts.sql` (duplicate policy harness execution).
- **Rollback Boundary:** Changes are confined to test files and RPC/migration corrections. Reverting Unit 1 leaves production intake unchanged while restoring test suite validity.
- **Estimated Authored Lines:** ~220 lines.

### Unit 2: Canonical Async Admission & Provider Intake Authority
- **Causal Invariant:** Removal of Evolution WhatsApp legacy `comprovantes` bypass; fast canonical admission across Web, Evolution WhatsApp, and Telegram; formal disablement of WhatsApp Cloud API payment intake with webhook handshake preservation; async queueing worker model.
- **Rollback Boundary:** Webhook routes can fall back to legacy admission mode via existing configuration flags (`PAYMENT_PROOF_CANONICAL_INGEST_ENABLED`) without schema corruption.
- **Estimated Authored Lines:** ~280 lines.

### Unit 3: Active Seller (`vendedor`) Reconciliation & Atendimento Authorization
- **Causal Invariant:** App server action (`payment-proof-admin.ts`) and Atendimento UI (`PaymentProofAdminPanel.tsx`) alignment with `vendedor concilia` policy. Implementation of proof lock visualization, assignment scope, audit actor logging, and negative controls.
- **Rollback Boundary:** App guard can restrict `vendedor` actions back to `admin`/`supervisor` via configuration without DB migration rollback.
- **Estimated Authored Lines:** ~320 lines.

### Unit 4: Observability, Double-Failure Alert Signaling & Safe Replay
- **Causal Invariant:** Cumulative dead-letter gauge in `alert-policy.ts` (`total_unresolved_dead_letters`); secondary alert failure outbox logging in `alert-delivery.ts` when Telegram dispatch fails; read-only inspection diagnostics and safe, idempotent dead-letter replay RPCs/actions.
- **Rollback Boundary:** Alert policy thresholds and replay RPCs can be disabled independently without impacting ongoing intake or order processing.
- **Estimated Authored Lines:** ~260 lines.

### Unit 5: Durable System Gates & Progressive Reversible Rollout Strategy
- **Causal Invariant:** Migration of operational gate checks from local file overrides to chosen durable authority (fail-closed by default) with runtime cache revalidation, administrative toggle UI/RPCs, and multi-stage reversible rollout controls (Intake, Processing, Reconciliation, Cleanup).
- **Rollback Boundary:** Gates default to closed state if configuration is missing or disabled.
- **Estimated Authored Lines:** ~200 lines.

### Review Workload Forecast & Chained PR Recommendation
- **Total Forecasted Authored Lines:** ~1,280 lines across all 5 units.
- **Recommendation:** Because total volume exceeds 400 lines, a **Chained PR / Stacked PR Strategy** is strongly recommended. Each of the 5 units forms a single reviewable PR slice under 400 changed lines, keeping reviewer workload bounded and rollbacks isolated.

---

## 7. Inventory of Affected Files, Symbols, Migrations, and Tests

### Core Source & API Routes
- `apps/web/src/app/api/webhooks/evolution/route.ts` — Remove legacy `comprovantes` direct insertion; enforce fast canonical admission (`admit_and_enqueue_payment_proof`).
- `apps/web/src/app/api/webhooks/whatsapp/route.ts` — Add explicit disabled guard for payment intake while preserving GET/POST verification handshakes.
- `apps/web/src/app/actions/payment-proof-admin.ts` — Update staff authorization, proof locking, audit actor logging, and seller reconciliation guards.
- `apps/web/src/components/operator/PaymentProofAdminPanel.tsx` — Add seller reconciliation UI, proof lock indicators, assignment scope controls, and negative control feedback.
- `apps/web/src/lib/payment-proofs/canonical-intake.ts` — Ensure Web, Evolution, and Telegram routes call async queueing instead of inline synchronous PDF rendering.
- `apps/web/src/lib/payment-proofs/alert-policy.ts` — Add `total_unresolved_dead_letters` check alongside 60m delta.
- `apps/web/src/lib/payment-proofs/alert-delivery.ts` — Implement secondary outbox/dead-letter logging when Telegram alert dispatch fails.
- `apps/web/src/lib/whatsapp/evolution-payment-proof-compatibility.ts` — Read durable gates from selected storage authority with fail-closed default.

### Supabase Migrations & RPCs (Proposed for Next SDD Phases)
- Migration for Unit 1: RPC signature fixes (`complete_payment_proof_maintenance`), budget claim isolation in `claim_payment_proof_maintenance`.
- Migration for Unit 4 & 5: Replay RPCs for outbox & queue dead letters, durable system gate settings schema, and audit logging enhancement.

### Test Files Affected & Diagnostics
- `supabase/tests/payment_proof_operational_metrics.sql` — Fix RPC signature expectations, dead-letter timestamp assertions, and error sanitization tests.
- `supabase/tests/payment_proof_admin_alerts.sql` — Resolve fixture setup vs RPC bug in alert outbox claiming, lease recovery, and 5th-attempt dead-lettering.
- `supabase/tests/payment_proof_processing_queue.sql` — Fix budget claim isolation in `claim_payment_proof_maintenance`.
- `supabase/tests/security_handoff_receipts.sql` — Fix duplicate `CREATE POLICY` migration inclusion in test harness setup.
- `tests/unit/evolution-payment-proof-intake.test.ts` — Verify fast admission response without synchronous rendering.
- `tests/unit/payment-proof-alert-policy.test.ts` — Unit tests for cumulative dead letters and secondary alert delivery failure outbox.
- `tests/unit/payment-proof-admin-workflow.test.tsx` — Unit tests for `vendedor` role authorization, proof locks, and UI controls.

---

## 8. SDD Result Contract

```json
{
  "status": "completed",
  "executive_summary": "Exploration repaired: Fully inventoried 11 pgTAP test failures into Unit 1 baseline; marked gate source as unresolved design decision; clarified vendedor least-privilege scope; corrected public.comprovantes legacy table language; sequenced 5 causal invariants with chained PR recommendation (>400 lines).",
  "artifacts": [
    "openspec/changes/canonical-payment-proof-operations/exploration.md"
  ],
  "next_recommended": "proposal",
  "risks": [
    "pgTAP test suite failures in payment_proof_admin_alerts.sql may conceal unresolved product regressions in alert outbox claiming",
    "Transitioning Web and Evolution WhatsApp webhooks to async processing requires strict outbox worker reliability to avoid unacknowledged proof delays",
    "Seller (vendedor) reconciliation access requires strict proof locking to prevent concurrent reconciliation conflicts in Atendimento UI",
    "Durable gate implementation must fail closed under database connectivity or configuration lookup failures"
  ],
  "skill_resolution": "paths-injected"
}
```

## Key Learnings

1. Establishing a green SQL test baseline before feature expansion prevents masking pre-existing database RPC regressions under new business logic.
2. In multi-channel webhook architectures, fast canonical admission paired with async background queueing guarantees HTTP response SLA stability while maintaining audit idempotency.
3. Expanding domain roles like `vendedor` requires explicit least-privilege proof locking and assignment visibility beyond simple role array additions in application guards.
4. Operational feature gates must default to a fail-closed status to guarantee security and data consistency during infrastructure or database lookup failures.
