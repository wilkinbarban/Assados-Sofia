# Design: deterministic preview and durable Sofia batches

**Decision:** ship the receipt-preview correction independently, then add a database-owned Sofia batch queue driven by an authenticated maintenance route. The queue owns timing, membership, claiming, recovery, and response intent; webhook processes keep their current channel admission work immediate. No browser/server timer is authoritative.

## Quick path

1. **PR 1** makes the operator button choose one authenticated modal path and uses the modal's existing visible error surface.
2. **PRs 2–4** add an inaccessible-by-default queue, then its fenced worker capability, then a disabled maintenance runner; none has a webhook producer or can process live work.
3. **PR 5** changes both webhooks only behind a default-closed batching gate. Live enablement remains a separately authorized operational action after the full chain is merged and deployed.
4. When authorized, the worker freezes message membership at claim, rechecks the channel's existing eligibility, creates one durable response intent, and performs only one delivery attempt for that intent.

## Current-source findings that constrain the design

| Finding | Consequence |
|---|---|
| `OperatorChatConsole.tsx` currently dispatches `asados:open-attachment-preview` even when it also opens `/api/payment-proofs/{id}/preview`. | The button is genuinely double-routed; proof precedence must branch before either action. |
| `ModalVisualizadorComprovante.tsx` already treats non-OK fetches and rendering errors as `erro` and renders it visibly in the dialog. | Reuse this modal for both paths; do not add a second toast/state system. |
| `/api/chat/midia` is authenticated and converts a storage path to a private download, while the payment-proof preview route is separately authenticated. | Pass attachment-only media to the modal, not an unauthenticated URL or inline-card event. |
| Telegram and Evolution dedupe/persist/governance are webhook-specific and both call `processarRagPipeline` asynchronously. Telegram's canonical-proof path and Evolution's canonical-media path can return early from their own intake contracts. | Batching begins only after the accepted inbound message is durably persisted; canonical proof admission stays before it and is never replayed by a batch. |
| `processarRagPipeline` directly calls Telegram/WhatsApp send helpers, which persist only after provider send succeeds; it is not an outbox. `notification_outbox` is for order/payment notifications and its dispatcher also lacks provider idempotency. | Neither current direct path nor `notification_outbox` can promise one physical provider send after a crash. A dedicated Sofia response intent is required, and the design explicitly selects at-most-once *attempt*, not retryable external delivery. |
| Existing maintenance routes are authenticated bearer endpoints with database RPC claims; `ops/*maintenance-scheduler.sh` invokes them in a process loop, currently defaulting to 60 seconds. | Reuse this deployment pattern, but use a dedicated Sofia route and five-second configured invocation. A 60-second poll cannot meet the 5s/20s scheduling contract. |

## Outcome A — exclusive receipt preview

### Resolution helper and UI behavior

Add a small pure helper colocated with `OperatorChatConsole.tsx` (exported for its component test):

```ts
type ReceiptPreviewTarget =
  | { kind: 'payment-proof'; url: string; proofId: string; filename: 'comprovante.png' }
  | { kind: 'attachment'; url: string; filename: string }
  | null

resolveReceiptPreviewTarget({ payment_proof_id, url_anexo }): ReceiptPreviewTarget
```

It returns the payment-proof route when `payment_proof_id` is nonempty, otherwise returns the stored attachment value only when `url_anexo` is nonempty, otherwise `null`. The banner click calls `handleAbrirVisualizador` once with this target. It **never** dispatches `asados:open-attachment-preview`; that event remains only for a user interacting with an inline `AttachmentCard`.

For an attachment target, the modal receives the stored value and follows its existing normalization to `/api/chat/midia?path=…`; for a proof target it receives only `/api/payment-proofs/{id}/preview`. Thus both fetches remain authenticated and no raw attachment key is placed in a new public route or event payload. The modal already displays a visible error panel for fetch/non-OK/PDF/render errors; normalize its copy to the actionable Portuguese text **“Não foi possível carregar a visualização do comprovante. Tente novamente ou abra o comprovante na conversa.”** This replaces no behavior outside the selected modal.

No target means the banner does not render an actionable preview button (the current surrounding conditional already makes this effectively unreachable); it does not try a fallback route.

## Outcome B — durable batch design

### Access boundary and schema choice

Create these objects in **`public` schema**, consistent with `conversas`, `mensagens`, payment-proof, and notification queue foreign keys. “Public” is PostgreSQL naming, **not public application access**: enable RLS, revoke table privileges from `public`, `anon`, `authenticated`, and `service_role`, and expose only narrowly typed `SECURITY DEFINER` RPCs to `service_role`, with `search_path=''` and fully-qualified references. This is smaller and safer than a new schema because current Supabase migrations, FKs, admin client, and maintenance-RPC convention already use `public`; no REST/table policy exposes batch payloads.

```sql
public.sofia_inbound_batches (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  canal text not null check (canal in ('telegram','whatsapp')),
  first_message_at timestamptz not null,
  latest_message_at timestamptz not null,
  scheduled_process_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','cancelled','failed')),
  attempt integer not null default 0 check (attempt >= 0),
  lease_token uuid,
  claimed_until timestamptz,
  cancelled_reason text,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='processing') = (lease_token is not null and claimed_until is not null)),
  check ((status='completed') = (completed_at is not null)),
  check ((status='cancelled') = (cancelled_reason is not null)),
  check ((status='failed') = (failed_at is not null))
)
public.sofia_inbound_batch_messages (
  batch_id uuid not null references public.sofia_inbound_batches(id) on delete restrict,
  message_id uuid not null references public.mensagens(id) on delete restrict,
  ordinal bigint not null,
  primary key (batch_id, message_id),
  unique (message_id),
  unique (batch_id, ordinal)
)
public.sofia_response_outbox (
  batch_id uuid primary key references public.sofia_inbound_batches(id) on delete restrict,
  conversa_id uuid not null references public.conversas(id) on delete restrict,
  canal text not null check (canal in ('telegram','whatsapp')),
  message_id uuid not null unique references public.mensagens(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','claimed','attempted','failed')),
  lease_token uuid,
  claimed_until timestamptz,
  attempted_at timestamptz,
  failure_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='claimed') = (lease_token is not null and claimed_until is not null)),
  check ((status in ('attempted','failed')) = (attempted_at is not null))
)
```

Indexes: a partial unique index on `sofia_inbound_batches(conversa_id) WHERE status='pending'`; due-work index `(scheduled_process_at,id) WHERE status IN ('pending','processing')`; membership chronology index `(batch_id,ordinal)`; and response-outbox claim index on `batch_id WHERE status IN ('pending','claimed')`.

`ordinal` is a membership fact, not an extra lifecycle flag. Assign it from the persisted message's stable chronological key `(data_criacao, id)` at enqueue (the RPC obtains a per-batch order under the same locked pending row); use it rather than a later unconstrained scan. The `unique(message_id)` constraint proves one accepted delivery cannot enter two batches. It also freezes the claimed batch: a later inbound row cannot be attached once no pending row exists.

### States: only necessary states

| State | Why it is necessary | Exit |
|---|---|---|
| `pending` | Holds the silence/max-wait deadline and is the sole mutable per-conversation batch. | Atomic claim, cancellation. |
| `processing` | Fenced lease prevents two workers from generating one response and makes crash recovery observable. | Completed, cancelled, failed, or lease expiry back to pending. |
| `completed` | A response intent and persisted IA message were committed; it must never be generated again. | Terminal. |
| `cancelled` | Eligibility changed, so audit must distinguish policy suppression from a technical error. | Terminal. |
| `failed` | A nonrecoverable assembly/generation error needs visible operator maintenance evidence rather than retrying indefinitely. | Terminal/manual investigation. |

There is no `scheduled`, `ready`, `responded`, `retrying`, or feature-enabled state: schedule is a timestamp, response existence is the one-to-one outbox row, and retry is represented by a renewed `processing` lease/attempt. The response outbox has a separate status because provider delivery is a distinct external side effect; it is not batch state duplication.

### Atomic database contracts

All RPCs reject non-service-role callers and validate channel, UUIDs, lease duration (10–300 seconds), and fixed error/cancellation tokens.

1. **`enqueue_sofia_inbound_message(...)`** receives the normalized inbound message fields and its channel delivery key, after channel-specific canonical admission. It performs, in one transaction: duplicate binding lookup/insert into `mensagens`; locks/creates the one pending batch; inserts the membership if and only if the message was newly inserted; and calculates `scheduled_process_at = least(now()+interval '5 seconds', first_message_at+interval '20 seconds')`. On a duplicate it returns the original message and makes no membership/schedule change. If the current batch is `processing`, the partial unique index permits a new pending batch; the insert conflict retry is encapsulated in the RPC. This closes the crash gap between message persistence and membership, rather than doing client-side `insert` then `upsert`.

2. **`claim_sofia_inbound_batch(lease_seconds)`** locks one due pending batch (or expired `processing` lease) with `FOR UPDATE SKIP LOCKED`, increments `attempt`, assigns a fresh lease token/expiry, and returns the batch plus its membership rows ordered by `ordinal`. It changes to `processing` before any prompt work. Expired leases are safely reclaimed only while no `sofia_response_outbox` row exists; if a response intent exists, it marks the batch completed instead. This recovery rule is what makes response generation idempotent.

3. **`cancel_sofia_inbound_batch(batch, token, reason)`** and **`fail_sofia_inbound_batch(batch, token, error_token)`** update only the matching live lease. Cancellation tokens are `ia_inactive`, `handoff_or_pause`, `opt_out`, `sleep_or_cooldown`, `global_disabled`, and `outside_business_hours`; failure tokens are bounded operational codes, never prompt or storage content.

4. **`complete_sofia_inbound_batch(...)`** receives the response text only after application-level validation. In one fenced transaction it inserts exactly one `mensagens` row with `remetente='ia'` and `external_id='sofia-batch:' || batch_id`, inserts the one-to-one `sofia_response_outbox` row, and marks the batch `completed`. A unique `external_id` and `PRIMARY KEY(batch_id)` make a replay return the existing response intent only if its immutable conversation/channel/text binding matches; otherwise fail closed with `SOFIA_BATCH_RESPONSE_CONFLICT`.

5. **`claim_sofia_response_delivery`** leases one pending/expired claimed response row. Before making the provider call, **`begin_sofia_response_delivery`** atomically changes its matching lease to `attempted` and records `attempted_at`. The caller then calls the existing channel send adapter with `salvarNoBanco:false`, because the IA message was committed by completion. A provider/network failure is recorded by `record_sofia_response_delivery_failure` as `failed`; it is not retried automatically.

This is the explicit response boundary: one batch produces at most one durable IA response intent and at most one external send attempt. Provider APIs used by the current helpers do not expose an idempotency key, so retrying after a process death between provider acceptance and database completion would violate the requested at-most-one rule. The selected fail-closed tradeoff may lose a delivery after a crash, but it cannot duplicate it; the persisted IA message plus failed/attempted token gives operators an auditable manual recovery path. It is safer than incorrectly claiming exactly-once delivery.

### Webhook and worker data flow

1. Telegram/Evolution validates and deduplicates delivery exactly as today; canonical payment proof admission remains first and untouched. Do not batch callback/catalog/contact welcome, explicit opt-out confirmation, or interactive action replies because those are distinct immediate product interactions, not Sofia free-text response work.
2. For an eligible ordinary inbound, preserve normal channel policy handling and use the transactional RPC to persist the message and attach it to a batch. Replace only the final `processarRagPipeline(...)` background call. For an ineligible ordinary inbound, preserve message persistence but do not enqueue.
3. The maintenance worker claims batches. It loads current conversation/customer policy at claim time: `conversas.ia_ativa` and status/manual handoff; contact opt-out; global channel config; `verificarHorarioAtendimento`; and for WhatsApp `isWhatsAppInboundEligibleForSofia`/`whatsapp_sofia_states` including cooldown expiry. Telegram uses its existing global/business-hours/contact policies and conversation `ia_ativa`; it must not invent a WhatsApp sleep table. Any false/lookup failure cancels/fails closed before generation.
4. The worker builds one batch input and invokes a new narrow `processarRagBatchPipeline` internal entry point. Refactor the existing pipeline so shared retrieval/generation accepts a customer-input string and a delivery mode; preserve existing safety/tool/financial behavior. The batch entry point must not independently re-persist or send—completion and the response outbox own those effects.
5. It completes the fenced batch, then attempts exactly one response delivery through the existing Telegram/Evolution transport adapters. No batch uses `notification_outbox`, whose aggregate/event schema cannot represent Sofia and whose retry semantics can duplicate provider sends.

### Prompt contract and attachment privacy

The claim result is rendered deterministically, ordered by `(ordinal)`:

```text
MENSAGENS RECEBIDAS NESTE LOTE (ordem cronológica):
[1] Cliente: "primeiro texto"
[2] Cliente: [anexo recebido: imagem; mensagem sem texto]
[3] Cliente: "segue o comprovante" [anexo: comprovante de pagamento recebido]
```

Each member uses persisted `conteudo` plus a safe attachment descriptor derived from message metadata/payment-proof association. It includes no `url_anexo`, storage bucket, object key, signed URL, provider file ID, filename/path, or raw binary. An attachment is context evidence only; the surrounding system prompt retains the existing rule that Sofia cannot approve, reject, reconcile, or confirm payment. Retrieval query text is the bounded concatenation of member text plus descriptors; cap it at the existing LLM input limits and replace excess text with a stable truncation marker, preserving earliest chronological members and never changing attachment order.

### Maintenance invocation

Add `POST /api/internal/sofia/maintenance`, authenticated with a dedicated `SOFIA_BATCH_MAINTENANCE_SECRET` using the existing constant-time Bearer comparison pattern. Its bounded loop claims up to 20 batches, runs eligibility/generation/completion, then separately drains response attempts. It returns only counts (`claimed`, `completed`, `cancelled`, `failed`, `delivery_attempted`) and `Cache-Control: no-store`; it logs structured tokens, not text, identifiers, paths, phone numbers, or LLM output.

Add `ops/sofia-batch-maintenance-scheduler.sh` modeled on the current maintenance scheduler. Its interval is `SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS`, default **5**, validated to 1–60. Wire it into the existing deployment process/container that already runs the payment-proof and notification scheduler scripts; do not create an in-process Next.js loop or a new daemon class. Deployment configuration must provide its URL and secret before enabling enqueueing. The polling cadence plus normal worker availability means the 20-second promise is schedule due-time, not a false real-time guarantee under an unavailable worker.

## File-level plan

| File/path | Change |
|---|---|
| `apps/web/src/components/operator/OperatorChatConsole.tsx` | Add/export deterministic target resolver; replace banner's event+modal double path with one modal open. |
| `apps/web/src/components/comprovantes/ModalVisualizadorComprovante.tsx` | Reuse and normalize visible authenticated preview error wording. |
| `supabase/migrations/<timestamp>_sofia_inbound_batches.sql` | Tables, RLS/revokes, constraints/indexes, RPCs, grants, comments. No existing data rewrite. |
| `apps/web/src/lib/sofia/inbound-batches.ts` | Typed RPC boundary, safe prompt formatter, claim/result validators, and batch worker orchestration. |
| `apps/web/src/lib/ai/openrouter.ts` | Extract shared generation from direct persistence/delivery; add batch-only internal entry without changing financial/tool policy. |
| `apps/web/src/app/api/webhooks/telegram/route.ts` | Substitute only eligible ordinary-message direct RAG dispatch with transactional enqueue. |
| `apps/web/src/app/api/webhooks/evolution/route.ts` | Same substitution after existing canonical intake, dedupe, persistence/governance branches. |
| `apps/web/src/app/api/internal/sofia/maintenance/route.ts` | Authenticated bounded batch/response runner. |
| `ops/sofia-batch-maintenance-scheduler.sh` and existing scheduler deployment manifest/config | Five-second durable invocation using established script lifecycle. |
| focused Vitest and `supabase/tests/sofia_inbound_batches.sql` | Behavior and SQL concurrency/authority coverage. |

## Observability and operations

Use stable tokens: `SOFIA_BATCH_ENQUEUED`, `SOFIA_BATCH_RESCHEDULED`, `SOFIA_BATCH_CLAIMED`, `SOFIA_BATCH_LEASE_RECOVERED`, `SOFIA_BATCH_CANCELLED_<reason>`, `SOFIA_BATCH_FAILED_<token>`, `SOFIA_BATCH_COMPLETED`, `SOFIA_RESPONSE_INTENT_CREATED`, `SOFIA_RESPONSE_DELIVERY_ATTEMPTED`, and `SOFIA_RESPONSE_DELIVERY_FAILED_<token>`. Include channel and opaque batch ID only in restricted server logs; responses expose aggregate counts only. Track pending age, claim lag, batch size, lease recovery, cancellation reason, generation failure, and delivery-attempt/failure counts by channel. Alert on oldest pending age above 30 seconds and any repeated failed delivery intents; do not log prompts, attachments, storage references, customer identifiers, or generated content.

## Migration, rollout, and rollback

1. Release PR 1 first and verify target exclusivity plus visible modal errors.
2. Apply the additive PR 2 migration. It creates inaccessible empty tables/RPCs and is safe with old webhooks because nothing calls them. Do not modify staging or production during design.
3. Deploy worker route/script and configuration, invoke it against an empty queue, and verify authenticated health/counts.
4. Enable Telegram enqueue, observe queue/claim/cancellation for a controlled interval, then enable Evolution. This is a human deployment/authorization gate because it changes live automated customer response behavior.
5. Roll back by stopping the Sofia maintenance invocation first, then reverting webhook enqueue calls. Keep rows and migration for audit; no canonical proof, message ledger, dedupe, opt-out/handoff, payment, or financial record is deleted/replayed. Re-enable only after pending/processing rows are explicitly assessed. Never destructively down-migrate a queue with work.

## Verification plan

| Layer | Named coverage |
|---|---|
| Component | Proof+attachment resolves proof only; attachment-only opens the media modal only; neither identifier yields no target; non-OK/fetch/render failure displays the Portuguese error. Update the existing banner test whose assertion currently expects the old event. |
| SQL RPC | First enqueue creates one batch/member; duplicate delivery does neither; concurrent enqueue has one pending batch and exact memberships; pending arrival preserves first timestamp and recalculates min(5s,20s); arrival after claim creates a new pending batch; two claims yield one lease; expired lease recovers without a response intent; terminal rows never claim. |
| Worker | Ordered text/attachment descriptor shape contains no storage key; both channel eligibility rechecks cancel for every listed gate; proof descriptor cannot trigger financial authority; completion replay creates one IA message and one response intent. |
| Delivery boundary | Claim/attempt races permit one adapter invocation; crash simulation after `attempted` never re-invokes; pre-attempt lease expiry retries safely; provider failure is visible `failed`, not silently retried. |
| Webhooks | Telegram and Evolution preserve their dedupe and canonical intake before enqueue; duplicate channel delivery has no second message/member; immediate opt-out/catalog/contact/interactive branches remain immediate and do not batch. |
| Deployment | Scheduler config invokes authenticated route at 5 seconds; route bounds work to 20 and returns no sensitive payload. Runtime test is N/A until an authorized non-production deployment exists; design must not mutate environments. |

## Exact stacked chain and default-closed delivery gates

The previous design rejected a split because it treated “feature complete” as the only valid PR boundary. That was too broad. The selected **Cadena desactivada** packaging is safe because each slice has a useful, independently testable contract while the producer and runner remain disabled until the final operational authorization. It does **not** claim an incomplete slice delivers batching to customers.

### Shared activation contract

Add one narrowly scoped operational gate module, `apps/web/src/lib/sofia/inbound-batch-gates.ts`, with two independently fail-closed booleans:

- `SOFIA_INBOUND_BATCH_ENQUEUE_ENABLED`: defaults `false`; only webhook integration consults it.
- `SOFIA_INBOUND_BATCH_PROCESSING_ENABLED`: defaults `false`; the maintenance route returns zero work before any claim when closed.

Values must be parsed strictly (`"true"` only); missing, malformed, or unavailable configuration is `false`. This is not persisted batch state and adds no migration flag: it is deployment configuration, necessary to guarantee that source deployment alone cannot change customer-response behavior. The scheduler is not installed/wired until authorization, and the runner gate independently prevents a mistaken authenticated invocation from claiming work before authorization.

### Ordered chain

| Stack position | PR / exact deliverable | Default runtime effect | Tests shipped in the same slice | Rollback boundary | Honest forecast |
|---:|---|---|---|---|---:|
| 1 | **PR 1 — deterministic authenticated receipt preview**: target resolver, exclusive button action, and modal copy. | UI correction only; no Sofia behavior changes. | Existing operator banner test is changed from old custom-event expectation; resolver precedence and media-only/no-target cases; modal non-OK/render error visibility. | Revert `OperatorChatConsole.tsx`, modal copy, and component tests only. | ~120 |
| 2 | **PR 2 — Sofia batch storage and atomic admission contract**: additive migration creates the three inaccessible tables, RLS/revokes/indexes, and *only* `enqueue_sofia_inbound_message`; typed application RPC wrapper. | No producer calls the RPC, therefore no batch row can be created in normal runtime. | SQL authority/RLS tests; first admission; duplicate binding; exact membership; concurrent pending admission; five-second reset and 20-second cap; claimed-batch/new-pending race simulated through database state. | Stop at this migration; leave empty tables/RPC for forward-compatible deployment. No down migration. | ~360 |
| 3 | **PR 3 — fenced claim, completion, and one-attempt response intent contract**: second additive migration adds claim/recovery/cancel/fail/complete and response-delivery RPCs; safe prompt formatter and RPC result validators. | No runner route exists and no scheduler invokes work; queued data, if manually inserted under service role, remains inert. | SQL `SKIP LOCKED` contention, lease fencing/expiry, terminal exclusion, completion replay/conflict, one IA message/intent, and single delivery-attempt transition; formatter chronological ordering and storage-key redaction tests. | Revert application formatter only if needed; retain migration and rows. Do not invoke a runner. | ~390 |
| 4 | **PR 4 — disabled Sofia batch worker and maintenance endpoint**: extract generation-only batch entry from `processarRagPipeline`; add eligibility recheck, worker orchestration, authenticated maintenance route, and scheduler script/config template. | Processing gate is hard default-closed, route claims nothing, and scheduler is neither installed nor enabled. Existing direct RAG calls are unchanged. | Unit tests for Telegram and WhatsApp eligibility cancellation, generation failure, response-intent completion, and adapter one-attempt boundary; route authorization and closed-gate zero-claim tests; shell interval validation. | Remove route/script/application worker; existing queue rows remain inert because no webhook producer exists. | ~395 |
| 5 | **PR 5 — default-closed Telegram and Evolution producers**: replace only eligible ordinary final direct-RAG dispatches with gated transactional enqueue; preserve direct dispatch when the enqueue gate is false. | Gate defaults false, so deployed behavior is byte-for-byte equivalent in outcome: current canonical intake, dedupe, persistence, policy branches, and direct RAG remain active. | Telegram and Evolution gate-off regression tests prove direct path and immediate payment-proof/dedupe remain; gate-on tests prove one transactional member/enqueue and no direct RAG; duplicate delivery, opt-out, catalog/contact, and interactive exceptions remain non-batched. | Set/retain enqueue gate false first, then revert just the two webhook integrations. Existing queue data is retained. | ~380 |

All forecasts include their focused tests and changed-line additions plus deletions. None is forecast above the 400-line budget. If implementation measurement invalidates one forecast, stop at that PR and report its actual smallest cohesive count; do not infer `size:exception`.

### Migration and merge order

1. Merge/deploy PR 1 independently.
2. Merge PR 2 before PR 3: PR 3 functions reference the tables, indexes, membership, and admission invariants established by PR 2.
3. Merge PR 3 before PR 4: the worker only calls already-migrated fenced contracts; no worker code uses ad-hoc table writes.
4. Merge PR 4 before PR 5: the disabled processing capability is deployed and tested before a gated producer can be merged.
5. Merge/deploy PR 5 with **both gates false**. It is compatible with old queue-empty deployments and does not create work unless explicitly enabled.

The migrations are forward-only and additive. PR 2 must not install claim/completion functions that reference future objects, and PR 3 must not alter or replay existing `mensagens`, payment-proof, dedupe, opt-out, handoff, or financial ledgers. Application PRs must tolerate the migration being present but all queue calls disabled; deployment order never permits application code to call absent RPCs.

### Separate operational authorization after the complete chain

After all five PRs are merged and deployed, an authorized operator may perform this explicit, reversible rollout sequence:

1. Confirm PR 2/3 migrations and PR 4 route are present, and verify both gates report closed with zero claims.
2. Provision the dedicated maintenance secret/URL and install the existing-style five-second scheduler script, but keep `SOFIA_INBOUND_BATCH_PROCESSING_ENABLED=false` and `SOFIA_INBOUND_BATCH_ENQUEUE_ENABLED=false`.
3. Authorize a controlled channel rollout: enable processing first, verify no work exists, then enable enqueue for Telegram only. Observe the listed batch tokens and pending-age metric.
4. Enable Evolution enqueue only after Telegram remains healthy. This preserves both channel-specific canonical intake and eligibility behavior.

To roll back live behavior, set the enqueue gate false first, then processing false, and stop the scheduler. Retain batches, memberships, response intents, and the IA message ledger for audit; never delete/replay canonical payment proof, inbound message, dedupe, opt-out/handoff, or financial records. Pending/processing work is assessed explicitly before any later re-enable; no destructive down migration is permitted.

```yaml
change_name: atendimento-preview-and-sofia-inbound-batching
phase: design
status: complete
skill_resolution: paths-injected
artifact_store: openspec
artifacts:
  - openspec/changes/atendimento-preview-and-sofia-inbound-batching/design.md
review_budget: 400
delivery_strategy: ask-on-risk
packaging: cadena-desactivada
exact_stack:
  - pr: 1
    name: deterministic-authenticated-receipt-preview
    forecast_changed_lines: 120
    activation: active-ui-correction-only
  - pr: 2
    name: sofia-batch-storage-and-atomic-admission
    forecast_changed_lines: 360
    activation: inert-no-producers
  - pr: 3
    name: sofia-batch-fenced-processing-contract
    forecast_changed_lines: 390
    activation: inert-no-runner
  - pr: 4
    name: sofia-batch-disabled-worker-and-maintenance-capability
    forecast_changed_lines: 395
    activation: processing-gate-default-closed-and-scheduler-uninstalled
  - pr: 5
    name: sofia-batch-default-closed-channel-producers
    forecast_changed_lines: 380
    activation: enqueue-gate-default-closed
size_exception: none-inferred
human_gates:
  - Authorize live scheduler installation and maintenance secret provisioning after the full chain is deployed.
  - Authorize each channel gate enablement after operational verification.
```
