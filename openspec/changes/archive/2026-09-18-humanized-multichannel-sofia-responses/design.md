# Design: Humanized Multichannel Sofia Responses

## Decision summary

Extend the existing durable Sofia batch/outbox contract rather than create another queue. This is corrected planning only: PR1 (`bd275ae`) remains complete, while the current uncommitted activity migration is a rejected candidate and must not be applied or paired with a corrective migration. A future replacement requires preserving its snapshot and explicit scope approval. The replacement design changes admission to **10 seconds of silence, capped at 20 seconds**, adds `web` later, and introduces a narrowly fenced activity authority separate from final-message authority.

That separation is necessary because the current worker generates first, completes the batch, and only then calls `begin_sofia_response_delivery`. A typing/presence effect that starts during generation must be authorized before final-send authority exists, but it must never consume or create a second final send attempt.

The design remains default-closed per channel. Meta WhatsApp Cloud and token/partial-response streaming remain excluded. This revision is planning-only: it records the currently approved eight-PR delivery plan and does not authorize apply.

## Current-source constraints

| Current source | Constraint on the change |
| --- | --- |
| `supabase/migrations/20260909010000_sofia_inbound_batch_admission.sql` and `20260909030000_sofia_inbound_batch_attach_message.sql` only accept `telegram`/`whatsapp` and schedule at five seconds. | Revise their functions forward-only; do not modify historical migrations. |
| `20260909020000_sofia_inbound_batch_processing.sql` gives an outbox lease, then `begin_sofia_response_delivery` irreversibly changes it to `attempted`. | Activity must be separately authorized and fenced while the outbox remains `claimed`. |
| `apps/web/src/lib/sofia/inbound-batch-worker.ts` calls `generate`, `complete`, then claims/begins delivery. | The worker needs a generation-activity lifecycle and paced delivery phase, not a second response ledger. |
| `apps/web/src/app/actions/chat.ts` and `components/chat/ChatContainer.tsx` insert Web messages then directly call `processarIaChat`. | Gate-on Web must persist and attach in one server-side transaction/RPC flow and must not call direct RAG. |
| `ChatContainer.tsx` has ephemeral `isIaTyping`. | Replace this Sofia-specific state with durable, conversation-scoped presence readback plus Realtime subscription. |
| `lib/telegram/send.ts` has a reusable authenticated Telegram HTTP helper but no chat-action adapter. | Add `sendChatAction` beside the message adapter and refresh it while activity remains authorized. |
| `lib/whatsapp/evolution.ts` only supplies `options.presence: 'composing'` and `options.delay` on its final `sendText` request. Production runs Evolution **v2.3.7**; public upstream references suggest per-chat presence routes (`/chat/sendPresence/{instance}` and earlier `/message/sendPresence/{instance}`), but the exact v2.3.7 route, request body, authentication, and expiry semantics are unverified. | Do not implement or claim an independent Evolution presence API until a pinned v2.3.7 source review or isolated non-production capability probe verifies that exact contract. |

## Architecture and data flow

```text
admitted inbound (Telegram / Evolution / Web)
  -> canonical message persistence
  -> attach_sofia_inbound_message(message, conversation, customer, channel)
     [one pending batch, trusted database admission timestamps]
  -> 2s maintenance polling from ops/sofia-inbound-batch-maintenance-scheduler.sh
  -> claim_sofia_inbound_batch (generation lease)
  -> policy recheck
  -> begin_sofia_batch_activity (non-message activity authority)
  -> channel activity starts; generate ordered batch context
  -> complete_sofia_inbound_batch (one IA message + one outbox intent)
  -> claim_sofia_response_delivery (delivery lease, still no message effect)
  -> adopt_sofia_response_activity (moves/renews activity fence; not attempted)
  -> wait max(0, minimum(response length) - generation elapsed)
  -> begin_sofia_response_delivery (the only final-message authority)
  -> one final channel send with salvarNoBanco:false
  -> activity clear on terminal outcome
```

The batch owns membership and generation fencing. The response outbox owns exactly one durable final-response intent and at-most-one external final-message attempt. The activity projection is not a message ledger and cannot authorize a message send. Activity authorization is acquired before generation; final-send authority remains a separate, immediately-before-send transition.

## Forward-only database changes

Author a future replacement migration only after implementation-time validation, source-scope/native-authority review, and explicit scope approval. Applying or executing that SQL is a separate database-authorization decision. The current uncommitted `supabase/migrations/20260911010000_sofia_activity_pacing.sql` is rejected/unverified: do not prescribe applying it plus a corrective migration. Preserve its snapshot for review and obtain scope approval before selecting a replacement. Historical migrations remain immutable; old RPC names may remain as compatibility wrappers only where callers still exist.

### Batch and outbox revisions

1. Drop and recreate only the affected check constraints, replacing channel sets with `('telegram', 'whatsapp', 'web')` on `sofia_inbound_batches.canal` and `sofia_response_outbox.canal`.
2. Use `CREATE OR REPLACE FUNCTION` for `enqueue_sofia_inbound_message`, `attach_sofia_inbound_message`, and `claim_sofia_inbound_batch` when their existing argument lists, return types, and OUT-column signatures can remain compatible. The replacement accepts `web` and calculates:

   ```sql
   scheduled_process_at = least(
     v_admitted_at + interval '10 seconds',
     first_message_at + interval '20 seconds'
   )
   ```

   `first_message_at` is immutable for a pending batch; every newly admitted member updates `latest_message_at`. Duplicate attachment does neither. `v_admitted_at = clock_timestamp()` remains authoritative; browser/provider timestamps only remain message chronology.
3. PostgreSQL cannot use `CREATE OR REPLACE FUNCTION` to change a function's input argument types/count, return type, or named OUT-column signature. If adding Web requires any such incompatible signature change, retain the established function as a compatibility wrapper and introduce the smallest explicitly named revision only for that incompatible contract; update callers atomically. Do not create blanket `*_v2` variants merely to revise function bodies or scheduling behavior.
4. Keep the existing partial unique pending-batch index, immutable membership trigger, `SKIP LOCKED` claim behavior, and one-to-one outbox. `web` has no provider delivery key requirement in the attach path because the canonical Web message already exists. The compatible claim replacement returns the Web channel and current policy snapshot; Web eligibility is `conversa.ia_ativa`, conversation fencing/status, customer automation permission, global Web gate/configuration, and runtime business-hours verification, and must not read WhatsApp sleep state.
5. Retain bounded cancel/fail error tokens and add only bounded activity failure tokens. The application never writes tables directly.

### Durable Web presence projection

**Decision 1 — combined renewal:** use `renew_sofia_owner_activity(batch uuid, owner_kind text, owner_token uuid, attemptA uuid, owner_ttl int, activity_ttl int) -> jsonb {attempt_id, owner_expires_at, activity_expires_at} | null`. It atomically renews the live actual owner (`G` or `D`) and matching activity `A`; wrong kind, stale token, or expiry changes neither. Omit returned owner secrets. TTLs are integers 10..300 inclusive; explicit `NULL` is invalid. Defaults are owner 60 seconds/activity 30 seconds; heartbeat is every 10 seconds and serialized/non-overlapping. Stop/await heartbeat before completion or `beginDelivery`; no result is accepted after a lost fence. Cleanup is conditional on batch/`A`; after attempted, the token is cleared and no `D` heartbeat is allowed.

Add private table `public.sofia_conversation_presence`:

```sql
conversa_id uuid primary key references public.conversas(id) on delete cascade,
status text not null check (status in ('idle','composing')),
owner_kind text check (owner_kind in ('generation','delivery')),
    owner_token uuid,
    attempt_id uuid,
source_batch_id uuid references public.sofia_inbound_batches(id) on delete set null,
expires_at timestamptz,
updated_at timestamptz not null default now(),
check (status = 'composing' or (owner_kind is null and owner_token is null and attempt_id is null and source_batch_id is null and expires_at is null)),
    check (status = 'idle' or (owner_kind is not null and owner_token is not null and attempt_id is not null and source_batch_id is not null and expires_at is not null))
```

`owner_kind`/`owner_token` identify generation (`G`) or delivery (`D`); `attempt_id` (`A`) is a separate opaque activity fence. Idle is explicit: all owner/source fields (`owner_kind`, `owner_token`, `attempt_id`, `source_batch_id`, and `expires_at`) are null; boolean equivalence alone is insufficient. A composing row has all fields populated. `attempt_id` is never displayed as a provider, customer, lease, or message identifier. Deleting idle rows is deliberately avoided so clients receive a clear update.

Enable RLS; revoke direct table privileges from `public`, `anon`, `authenticated`, and `service_role`. Do **not** grant browser table writes. Add the table to `supabase_realtime` only after its select policy exists.

Expose narrow `SECURITY DEFINER`, `search_path=''`, service-role-only RPCs. All TTLs reject explicit `NULL` and values outside a chosen, documented inclusive range:

- `begin_sofia_batch_activity(batch uuid, generation uuid, ttl integer) -> jsonb {attempt_id, expires_at}` validates a live `processing` lease after policy recheck, upserts composing state, and returns `{attempt_id, expires_at}`. It is idempotent only for the same batch/lease.
- `renew_sofia_batch_activity(batch uuid, generation uuid, attempt uuid, ttl integer) -> jsonb {attempt_id, expires_at} | null` extends only the matching, live activity/batch lease. It cannot resurrect an expired/lost lease.
- `adopt_sofia_response_activity(batch uuid, delivery uuid, ttl integer) -> jsonb {attempt_id, expires_at} | null` validates a `claimed` outbox lease and an active activity row for its batch, rotates `attempt_id`, and extends expiry. It leaves outbox status **`claimed`**; it is explicitly not `begin_sofia_response_delivery`.
- `clear_sofia_batch_activity(batch uuid, attempt uuid) -> boolean` changes only the matching row to explicit idle. A stale worker cannot clear a newer batch's indicator.
- `get_my_sofia_conversation_presence(conversa_id)` is callable by authenticated browser users only and performs ownership/staff authorization inside the function before returning `{status, expires_at}`. It returns idle for a valid authorized conversation whose stored composing state has expired.

The client reads presence through this narrow RPC on mount/reconnect and uses a direct table `postgres_changes` subscription only after RLS authorizes its exact conversation. If Supabase Realtime cannot enforce the tenant policy for this new table in the deployed version, use an authenticated, conversation-filtered server endpoint plus periodic readback instead; do not publish an insecure table. This is an implementation-time verification gate, not permission to relax RLS.

## Exact state machines and fencing order

### Batch state

```text
pending --claim(token G)--> processing --complete(G)--> completed
   |                         |--cancel(G)--> cancelled
   |                         |--fail(G)----> failed
   '--due every 2s           '--lease expiry without outbox--> pending/reclaimed
```

A claim freezes membership because new arrivals can only attach to a `pending` row; a post-claim arrival opens/uses a separate pending batch. A lease recovered after an outbox exists is finalized completed, never regenerated.

### Activity state

```text
idle --begin(batch G)--> composing(G, batch, expiry)
composing(G) --renew(G)--> composing(G, batch, later expiry)
composing(G) --adopt(delivery D)--> composing(D, batch, later expiry)
composing(D) --clear(D)--> idle
any composing --expiry--> client-visible idle
```

`G` is the generation lease, `A` the activity attempt fence, and `D` the delivery lease; they are never interchangeable. Same-conversation first creation uses a separate advisory transaction lock on a dedicated hashed activity-key namespace, then locks owner batch/outbox/presence rows as needed. This is serialization, not security authority; hash collisions must fail/serialize and be tested. Old paths never request this new advisory lock. Baseline interaction inspection found completion inserts `mensagens` with FK/triggers that may lock `conversation` after `batch`; therefore conversation→batch→outbox→activity is not claimed compatible. A paced wrapper taking conversation first does not solve the baseline path. This safer design still requires an empirical concurrent test before implementation. Same-live-batch begin is idempotent; a fresh owner rotates `A`. Stale actors cannot renew or clear newer `A`. Adoption requires valid live `D` and pending/completed-generation correspondence, rotates `A`, and preserves outbox `claimed`. Generation renewal cannot renew delivery-owned activity. Terminal clear is conditional on batch and current `A`; expired owners cannot resurrect, and a live `D` may reestablish expired activity only after valid completed-generation correspondence. Live cross-batch exclusion requires concurrency tests. Expiry read semantics are deferred to the later Web slice. Activity never changes outbox status or authorizes final send.

### Outbox state

```text
pending --claim(D)--> claimed --beginDelivery(D)--> attempted --provider failure--> failed
```

Only `beginDelivery(D)` consumes final-message authority. `adopt...activity(D)` preserves `claimed`, so a crash during activity/pacing has no provider-visible final message and may safely recover the delivery lease. Once `attempted`, no automatic reclaim/retry occurs.

### Worker transaction/effect ordering

1. Claim batch `G`; re-evaluate all current policy gates before any generation or activity.
2. Begin `G` activity and persist its durable authority before starting the monotonic generation clock. Measure elapsed time immediately around the model call only: start the clock immediately before invoking the model and stop it when generation returns or throws. This measurement is independent of the as-yet-unknown final response length.
3. Begin channel activity after `begin_sofia_batch_activity` and before invoking the model. Telegram `sendChatAction` and a verified Evolution per-chat presence call are non-message activity effects authorized by `G`; Web composing is already durable. If a best-effort channel activity call fails, generation may continue, but it must never create or consume final authority.
4. During long generation, renew durable activity before both the activity expiry and the generation lease expiry; refresh Telegram and, only after the Evolution capability gate passes, Evolution independently. If renewal loses its fence, stop generation result processing, clear only conditionally, and let recovery own the batch. A stale generator can never complete or send.
5. Feature-on completion uses nullable outbox `pace_not_before` and a new paced completion wrapper that calls the existing three-argument `complete_sofia_inbound_batch` in the same transaction. It prechecks under the same batch lock whether the intent existed, calls the baseline, and sets the deadline only for a newly created intent while locks remain held; replay never resets an existing intent or annotates a preexisting baseline intent. Elapsed milliseconds are integer 0..2147483647 from the monotonic model measurement, saturating if necessary. DB computes `clock_timestamp() + remaining_ms * interval '1 millisecond'` and returns `remaining_ms`; no host-clock alignment. Baseline three-argument completion remains. Activity retains durable continuity until an independent delivery process adopts it; completion alone does not clear it. On generation error, fail the batch and conditionally clear `G` activity.
6. Claim delivery `D`, validate correspondence to the completed generation intent, adopt activity with `D` (rotating `A` while preserving outbox `claimed`), calculate remainder from durable data, and maintain activity through only that remainder. Reclaim/adopt cannot restart the full delay.
7. Call the existing `begin_sofia_response_delivery(D)` immediately before the final send, adding its nullable `pace_not_before` due predicate; NULL baseline intents remain unaffected. Do not add a separate paced-begin wrapper, leaving no legacy-RPC bypass. Call the channel adapter exactly once with `salvarNoBanco:false`.
8. Record rejection/provider failure and clear `D` activity in `finally`. A successful send also clears in `finally`; no additional “delivered” state is required for the current at-most-one-attempt contract.

### Crash behavior

| Interruption point | Durable result and recovery |
| --- | --- |
| Before activity begin | Batch lease expires and is reclaimed; no provider effect happened. |
| During generation/activity | Presence expires client-side; lease recovery regenerates only when no outbox exists. Old `G` cannot complete or clear newer presence. |
| After completion before delivery claim | Outbox remains pending; recovery claims it without regenerating. Presence expires/clears. |
| After delivery claim/adoption but before `beginDelivery` | `claimed` lease expires, can be reclaimed; no final send occurred. Presence becomes idle on expiry. |
| After `beginDelivery` before/after provider acceptance | Outbox is attempted and never retried automatically. The IA message and attempt record remain auditable; this deliberately favors no duplicate final send over guaranteed delivery. |

## Humanized pace and channel behavior

### Shared clock

**Decision 2 — canonical text:** use ECMAScript `trim()` with the explicit ECMAScript WhiteSpace + LineTerminator list, then count UTF-16 code units. Supplementary Unicode scalar values count as 2; combining marks count as 1; NBSP and BOM trim as whitespace. Scanning may stop after 500 units. SQL must implement the same whitespace list and supplementary-point `> 65535` adjustment explicitly; do not claim generic SQL `length` parity. Tests must cover emoji, combining marks, NBSP, BOM, and ASCII boundaries.

Create `apps/web/src/lib/sofia/response-pace.ts` with a deterministic pure helper. It derives a monotonic length-based minimum from trimmed final response length, with **2000 ms through 100 trimmed characters**, then **+10 ms per additional character**, capped at **6000 ms at 500 trimmed characters**; it has no jitter. Generation elapsed is subtracted from that minimum, never added after generation.

```ts
const trimmedLength = finalText.trim().length
const pacedLength = Math.min(trimmedLength, 500)
minimumMs = Math.min(6000, 2000 + Math.max(0, pacedLength - 100) * 10)
remainingMs = Math.max(0, minimumMs - generationElapsedMs)
```

Generation elapsed is measured once immediately around MODEL only and is not reset by completion, delivery claim, typing refresh, network latency, or scheduler work. Persist a DB-time deadline atomically with feature-on completion; `pace_not_before` remains nullable and baseline-unaffected. Proposed `begin_sofia_response_delivery` requires deadline null or due, feature-on only. Return DB-derived remaining duration; do not assume client clock alignment. Use milliseconds * interval '1 millisecond', not unsupported `make_interval(msecs => ...)`. No in-memory `Map` is authority and no persisted monotonic timestamp is valid across processes. Pacing never sleeps before activity authority, and recovery/reclaim never restarts the full delay.

### Telegram

Add `enviarAcaoChatTelegram(conversaId, 'typing')` in `apps/web/src/lib/telegram/send.ts`, resolving the same chat ID/token as `enviarMensagemTelegram` and invoking `sendChatAction`.

Telegram’s typing indication expires provider-side (nominally about five seconds), so use a cancellable refresher: send once after `begin_sofia_batch_activity`, then refresh approximately every **4 seconds** while `G` or later `D` remains valid. Stop it before conditional clear. Refresh failures are structured best-effort activity failures; they do not regenerate, claim another delivery, or bypass `beginDelivery(D)`. The final `sendMessage` remains one call after final authority.

### Evolution WhatsApp — mandatory capability gate

The confirmed product requirement is Evolution composing visible continuously throughout generation, not merely an embedded pre-send delay. Production Evolution is **v2.3.7**. Before implementation, verify the exact v2.3.7 per-chat presence contract by **one** of these isolated, non-production methods:

1. Review a pinned v2.3.7 upstream source/API artifact that establishes the route, request body, authentication, target chat identifier, composing value, and refresh/expiry behavior; or
2. Run a capability probe only against an isolated test instance and disposable test chat, with no Sofia generation, final message, database mutation, or production credential. The probe may issue only the candidate presence request and observe its documented/test-chat effect.

Public upstream references to `/chat/sendPresence/{instance}` and earlier `/message/sendPresence/{instance}` are discovery leads, not an implementation contract. The evidence must select the exact route and body for v2.3.7 and be recorded with the deployment decision.

**Pass:** Add a narrowly fenced, best-effort Evolution composing adapter authorized by `G`, start it before model generation, and refresh it on a documented-safe cadence through generation and the post-generation remainder. Then pass deterministic `remainingMs` to the final Sofia-only `sendText` option, retain final-send `presence:'composing'` where compatible, and keep `evolutionMaxRetries(...salvarNoBanco:false) === 0`. Presence failures never grant final-message authority or cause another final attempt.

**Fail or inconclusive:** Evolution fails this feature's acceptance criterion. Do not activate its producer gate, do not represent embedded final-send presence as parity, and do not substitute a fake preliminary message or an unverified route. Telegram and Web may proceed independently under their own gates; Meta Cloud remains excluded.

### Web

Gate-on Web canonical flow is server-owned:

1. The server action validates the authenticated customer owns the conversation and validates text/attachment input.
2. It calls a **new atomic Web-admission RPC** (or a revised canonical Web message RPC) that inserts `mensagens` and attaches the returned message to the `web` batch inside the same database transaction. It uses a client-generated, validated idempotency key stored as a Web-specific `external_id` namespace; a retry returns the original message/batch and does not alter the deadline.
3. It returns the canonical message to the browser and never invokes `processarIaChat` or `processarRagPipeline` directly when `SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED !== 'true'`? **Correction:** when the gate is `true`, it uses durable admission and no direct RAG. When false, preserve the current direct path unchanged, satisfying default-closed rollout.
4. The browser removes local `isIaTyping` around the action. It reads current durable presence through the authorized RPC, subscribes to its own conversation presence updates, and locally renders composing only while `expires_at > Date.now()`. It schedules a local expiry re-render as a safety net. It continues receiving final `mensagens` through the existing subscription.

The direct browser `insert` cannot atomically attach with the current attach RPC because it crosses transactions. The new Web RPC is required; no client-side insert-then-attach sequence is acceptable. Attachments remain canonical message metadata and batch formatting retains descriptors only—never storage keys, signed URLs, provider IDs, or binary content.

## Gates, scheduler, observability, rollout, rollback

### Gates and scheduler

Add strict-`"true"` `webInboundBatchEnqueueEnabled` to `apps/web/src/lib/sofia/inbound-batch-gates.ts`. Keep existing Telegram/Evolution producer gates and `SOFIA_INBOUND_BATCH_PROCESSING_ENABLED`; all producer gates default false. Because production processing is currently true, require a separate strict-`"true"`, default-closed feature gate (for example `SOFIA_INBOUND_BATCH_RUNTIME_ENABLED`) for the new activity/pacing behavior only. When that feature gate is off, preserve the existing worker processing path unchanged; it must not gate all worker claims or effects. Existing producer and processing gates remain authoritative for their respective paths, and processing-enabled alone must not activate the new activity/pacing behavior.

Update the tracked deployment scheduler at `ops/sofia-inbound-batch-maintenance-scheduler.sh` to default and validate a **2-second** interval. The existing authenticated `apps/web/src/app/api/internal/sofia/inbound-batches/maintenance/route.ts` remains bounded to 20 total pieces of work and returns zero before any claim when processing is closed. The two-second cadence is due-work inspection cadence, not an availability guarantee.

### Observability

Emit structured restricted logs/counters with opaque batch ID and channel only:

- `SOFIA_BATCH_RESCHEDULED_10S`, `SOFIA_BATCH_CLAIMED`, `SOFIA_BATCH_LEASE_RECOVERED`;
- `SOFIA_ACTIVITY_STARTED`, `SOFIA_ACTIVITY_RENEWED`, `SOFIA_ACTIVITY_ADOPTED`, `SOFIA_ACTIVITY_EXPIRED`, `SOFIA_ACTIVITY_CLEARED`;
- `SOFIA_TELEGRAM_TYPING_SENT` / `_FAILED` and `SOFIA_EVOLUTION_COMPOSING_EMBEDDED`;
- `SOFIA_PACE_MINIMUM_MS`, `SOFIA_PACE_GENERATION_ELAPSED_MS`, `SOFIA_PACE_REMAINDER_MS` as numeric metrics, not response text;
- existing completion/cancellation/delivery attempt/failure tokens, now channel-labelled including `web`.

Track queue age, due-to-claim lag, batch size, lease recovery, activity expiry-before-clear, presence readback/subscription failures, paces, and provider failures. Never log prompts, generated text, attachment locator, raw customer identifier, or opaque attempt ID to browser telemetry.

### Rollout and rollback

1. Apply additive/revision migration with all gates closed. Validate SQL contracts and RLS without live routing.
2. Deploy pacing/activity worker capability with processing closed; verify empty/disabled maintenance responses.
3. Enable Telegram producer only after authorized operational approval; observe typing refresh, stale-clear, delivery attempt, and pending-age metrics.
4. Enable Evolution only after the mandatory v2.3.7 capability gate passes and test evidence proves separately fenced composing refresh remains visible throughout generation plus the computed remainder, while preserving no-retry/duplicate behavior. A failed or inconclusive probe is an acceptance failure and leaves the Evolution producer gate closed.
5. Enable Web only after RLS/Realtime authorization and reconnect readback are verified with the actual Supabase deployment.

Rollback closes the affected producer gate first, then processing gate if necessary, and stops the scheduler only through an authorized operational change. Do not down-migrate, delete batches/presence/outbox rows, replay attempts, or touch canonical messages, payment proofs, opt-out/handoff state, or financial records. Existing direct Web/RAG fallback remains available only while Web gate is closed; do not flip it back after a durable `attempted` intent without assessing pending/claimed work.

## Pre-implementation validation gates

Exact RPC integration and DB schema mechanism remain unresolved prerequisites unless proven by repository/deployment evidence before implementation. Validate signatures/return shapes, lock ordering against the baseline (without claiming a safe unified hierarchy yet), grants, explicit null/range TTL behavior, owner rotation/exclusion, and durable completion pacing before the private inert PR2a slice. Durable deadline/completion integration is UNAPPROVED if it expands inert PR2a; preserve the approved PR2a boundary and do not add an automatic slice. Deployed Realtime/RLS checks and authenticated Web readback are later Web-slice gates, not blockers for PRIVATE inert PR2a. Authoring replacement SQL requires source scope and native authority; applying/executing it requires separate database authorization. Do not present the rejected candidate SQL as complete. Link issue **4283** as the blocked authority context; no supported recovery route has been identified. Do not persist authority tokens/counters as new authority or claim an eligible route.

## State and test matrix

| Boundary | Required invariant | Planned evidence |
| --- | --- | --- |
| First creation / cross-batch | Serialized same-conversation creation and live exclusion | dblink/SQL concurrency tests |
| Begin / renew / clear | Same-live-batch idempotence; fresh owner rotates `A`; stale owners cannot renew/clear newer `A` | RPC behavioral tests |
| Completion / adoption | Durable pace continuity; valid `D` plus generation correspondence rotates `A` and keeps outbox `claimed` | crash-before/after tests |
| Delivery | `G`, `A`, and `D` remain distinct; only `beginDelivery(D)` authorizes provider send | worker ordering/at-most-one tests |
| TTL / expiry | Explicit null/range validation; expired authority cannot resurrect | SQL validation tests; Web expiry read deferred |
| Pace / recovery | Exact formula, one elapsed measurement, no full-delay restart after reclaim | hermetic fake-clock tests |

## File and test plan

| Path | Planned change |
| --- | --- |
| `supabase/migrations/<timestamp>_humanized_sofia_multichannel.sql` | Forward-only channel constraint changes; compatible `CREATE OR REPLACE` admission/attach/claim RPC revisions (with a wrapper/new name only for a signature-incompatible change); Web atomic admission RPC; durable presence table/RLS/Realtime/RPCs; activity fencing. |
| `supabase/tests/sofia_humanized_multichannel.sql` | pgTAP timing, Web atomic admission/dedupe, channel checks, activity/outbox fence contention, expiry, tenant/RLS and no direct privilege coverage. |
| `apps/web/src/lib/sofia/inbound-batch-gates.ts` | Strict default-closed Web producer gate. |
| `apps/web/src/lib/sofia/inbound-batch-producer.ts` | Typed Web atomic-admission and revised attach RPC wrappers. |
| `apps/web/src/lib/sofia/inbound-batch-worker.ts` | Generation activity authority, renewal, clock/remainder, adoption, conditional clear, Telegram refresh lifecycle, safe final-send ordering. |
| `apps/web/src/lib/sofia/response-pace.ts` | Deterministic 2–6 second response-length pace helper. |
| `apps/web/src/lib/telegram/send.ts` | Narrow `sendChatAction` adapter. |
| `apps/web/src/lib/whatsapp/evolution.ts` and `apps/web/src/lib/whatsapp/delays.ts` | Sofia-only deterministic embedded composing delay; preserve non-Sofia jitter behavior and zero retry for durable sends. |
| `apps/web/src/app/actions/chat.ts` | Gate-on authorized Web atomic admission; remove direct generation from that path. |
| `apps/web/src/components/chat/ChatContainer.tsx` | Durable presence readback, authorized Realtime subscription, expiry rendering; remove ephemeral Sofia action typing. |
| `apps/web/src/app/api/internal/sofia/inbound-batches/maintenance/route.ts` | Revised worker dependencies/counters only; retain auth/bounds/closed gate. |
| `ops/sofia-inbound-batch-maintenance-scheduler.sh` | Two-second interval validation/configuration. |
| `apps/web/src/**/__tests__/...` or repository Vitest convention | Unit tests for pace, worker ordering/crashes, adapters, Web action, and client presence state. |

Test cases must cover 10-second reset, 20-second cap, every channel's durable batching semantics, post-claim isolation, two-worker claims, activity cannot begin with stale `G`, adoption does not set `attempted`, only begin-delivery permits final send, crash points in the table above, slow-generation zero remainder, exact fast-generation remainder, 4-second Telegram refresh, the recorded Evolution v2.3.7 capability-pass contract and zero-retry composing refresh plus embedded remainder, Evolution gate-closed behavior when that evidence is absent/inconclusive, Web no-direct-RAG gate-on, reconnect readback/expiry, RLS isolation, and absence of token chunks.

## Current approved delivery plan (all <=400 changed lines)

The current approved strategy is **eight sequential PRs to `main`**, each independently gated and at or below 400 code+test changed lines; no `size:exception` is approved. This approval changes delivery slicing only: it does not authorize source apply, SQL/database changes, runtime/native budget changes, authority/reset, commits, publication, or deployment. Issue 4283 remains blocked. The prior seven-PR plan is historical context only; its evidence and sizing are preserved in this artifact. PR1 is preserved complete. PR2a is **PRIVATE inert activity schema/RPC fencing plus behavioral tests only**: no Web authenticated readback, RLS `SELECT`, Realtime publication, or adapters. PR2b is an independent strict default-closed feature gate and activity lifecycle/pacing slice; when off it preserves the existing processing path and does not disable the whole worker. Cumulative execution costs (RED additions/deletions, corrections, and rejected candidates) are separate from final PR budgets; the forecasts below are provisional, not verified for corrected full scope. Estimate the execution budget only after line-accounting the full design and ask authorization through the supported provider route; do not invent a new numeric authorized limit.

| Slice | Scope and dependency | Forecast |
| --- | --- | ---: |
| 1. Timing revision | Compatible migration schedule replacements plus pgTAP updates and the tracked scheduler two-second configuration. No producer activation. **Merged as `bd275ae`; complete.** | 240–360 |
| Core A | Private activity authorities, fencing, atomic owner/activity renewal, and SQL behavioral tests. Depends on PR1; default-closed and inert. | 280–390 preliminary, uncertified |
| Core B | Durable deadline, completion compatibility, and enforcement/parity/security/replay tests. Depends on Core A; baseline NULL behavior remains inert. | 240–360 preliminary, uncertified |
| Core C | Independent strict default-closed gate, helper/heartbeat worker lifecycle, pacing, and unit/crash tests. Depends on Core B; gate-off preserves the existing processing path. | 290–390 preliminary, uncertified |
| 3. Telegram delivery | Telegram action refresh, worker final sequencing, and focused adapter tests. No producer activation. | 240–360 |
| 4. Evolution capability and delivery | First record isolated/pinned v2.3.7 capability evidence; only on pass add the separately fenced composing refresher, embedded remainder, and tests. On fail/inconclusive, record acceptance failure and retain gate closed with no adapter activation. | 220–390 |
| 5. Web migration: server admission | Web channel/RPC revision, gate, action rewrite, direct-RAG gate-on regression tests. **This is separate because the forward migration/RPC revision cannot safely fit with client Realtime work under 400 lines.** | 300–395 |
| 6. Web migration: client presence | ChatContainer durable readback/subscription/expiry UI and client tests, after Slice 5 schema/API exists. No streaming. | 260–390 |

PR2a and PR2b are both independently deployable with their gates closed. The runtime gate is separate from `SOFIA_INBOUND_BATCH_PROCESSING_ENABLED` and remains default-closed even when production processing is true. Component estimate: PR2a migration 120–170 + compatibility 35–60 + assertions 120–180 + concurrency 35–60 + correction overhead 20–35 = 330–505; PR2b 25–45 + 25–40 + 100–155 + 35–65 + 90–140 + 25–45 = 300–490. Preliminary sizing risk only: not measured, minimum, or implementation-ready. Distinguish final base-to-PR diff including new files from incremental replacement overhead against the rejected uncommitted candidate; correction overhead is not inherently final-PR charge. Both exceed the 400-line upper bound; stop before apply under `ask-on-risk`, with no source implementation needed to discover the risk.

### Finishing decisions and proposed split (planning only)

**Recommended decisions:** use the combined renewal contract, explicit ECMAScript/SQL parity, nullable `pace_not_before` through the existing completion and begin-delivery contracts, and the dedicated advisory activity lock. Keep the heartbeat serialized, stop/await it before completion and final irreversible delivery, and reject results after fence loss.

**Approved delivery slicing:** PR1 existing; Core A private activity authorities/fencing/atomic renewal; Core B durable deadline/completion compatibility/enforcement; Core C gated worker/pacing; then Telegram, Evolution, Web server, and Web presence. Preliminary, uncertified ranges are A 280–390, B 240–360, and C 290–390. This does not authorize new budget, reset/replace source, or apply. Issue 4283 still blocks apply.

```yaml
change_name: humanized-multichannel-sofia-responses
phase: design
status: complete
skill_resolution: paths-injected
artifact_store: openspec
artifact: openspec/changes/humanized-multichannel-sofia-responses/design.md
review_budget: 400
delivery_strategy: ask-on-risk
migration_strategy: forward-only-rpc-revisions
channels: [telegram, whatsapp-evolution, web]
producer_gates: default-closed
processing_gate: default-closed
    runtime_gate: independent-default-closed-even-when-production-processing-is-true
    pr_chain: eight-sequential-to-main
web_migration: explicitly-split-into-server-and-client-slices
meta_whatsapp_cloud: excluded
streaming: excluded
runtime_db_env_container_github_mutation: none
```
