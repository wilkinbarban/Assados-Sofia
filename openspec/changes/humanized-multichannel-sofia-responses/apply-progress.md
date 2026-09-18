# Apply Progress: Humanized Multichannel Sofia Responses

## Delivery status — DELIVERED AND MERGED TO `main`

This change is **delivered and merged to `main`**. Implementation spans 12 commits in `a25dcb7..dc9dcec`: `a25dcb7`, `bf4b2e2`, `c93a7ad`, `27db2cd`, `fc15cb4`, `41c007e`, `591c2db`, `f2b0733`, `a792086`, `cbe169a`, `15cdd6a`, `dc9dcec` (`2585a70` in the same range is unrelated to this change). Source edits, migrations, pgTAP suites, and the ops scheduler all landed and are present in the working tree. Issue **4283** no longer gates this change.

**This file is cumulative, not overwritten.** The earlier planning-only revision is retained verbatim at the bottom under *Superseded planning record*. Its statement that "no source edits occurred" was accurate only for that planning moment and is now **false**; it is corrected, not deleted, by this merge. Task state in `openspec/changes/humanized-multichannel-sofia-responses/tasks.md` (34 checked, 2 unchecked) is the authoritative persisted completion record and is already reconciled against `main`.

## Task completion — 34 of 36

Evidence below is reused from the per-task evidence already recorded in `tasks.md`; no new claims are introduced by this bookkeeping pass.

### PR1 — Timing revision — complete (`bd275ae`)

Retained as merged; the 10 s / 20 s figures are superseded by the 25 s / 60 s correction recorded under *Deviations from design*.

- [x] Revise batch admission timing to **10 seconds of silence** *(superseded to 25 s sliding silence by `15cdd6a` / `20260913010000_sofia_timing_and_pacing_correction.sql`)*.
- [x] Apply the **20-second cap** from the immutable first-message/admission timing boundary *(superseded to 60 s starvation cap, same correction)*.
- [x] Update the tracked maintenance scheduler to a validated **2-second** interval *(evidence: `ops/sofia-inbound-batch-maintenance-scheduler.sh` defaults and validates `SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS:=2`)*.
- [x] Update the affected migration/test coverage for the timing revision, with historical migrations remaining immutable *(evidence: `20260910010000_sofia_humanized_timing.sql`, `20260913010000_sofia_timing_and_pacing_correction.sql`)*.
- [x] Preserve compatible migration/RPC evolution: forward-only compatible replacements and compatibility wrappers only where signatures require them; the rejected activity migration is not applied *(evidence: `CREATE OR REPLACE FUNCTION` revisions across the sofia migrations)*.

### PR2a — Private inert schema/fencing — delivered

- [x] **RED:** Failing SQL behavioral coverage for private schema constraints, direct privilege revocation, service-only RPCs, explicit null/range TTL, stale `G`/`D` fences, same-batch idempotence, fresh-owner `A` rotation, cross-batch exclusion, adoption correspondence without `attempted`, durable completion continuity, conditional clear, lock ordering, and at-most-one *(evidence: `supabase/tests/sofia_activity_core_a.sql` plan(39), incl. `function_privs_are`, `has_table`, `throws_ok`, and dblink concurrency)*.
- [x] **GREEN:** Private presence ownership with `owner_kind` (`generation`/`delivery`), owner token (`G`/`D`), separate `attempt_id` (`A`), and explicit idle requiring all owner/source fields null; `begin`/`renew`/`adopt`/`clear` contracts *(evidence: `20260911020000_sofia_activity_core_a_corrective.sql` creates `sofia_conversation_presence`, `begin_sofia_batch_activity`, `renew_sofia_owner_activity`, `adopt_sofia_response_activity`, `clear_sofia_batch_activity`)*.
- [x] **TRIANGULATE:** dblink concurrency, stale cleanup, live cross-batch exclusion, adoption preserving outbox `claimed` *(evidence: `sofia_activity_core_a.sql` dblink owner/contender race, lines 36–49; adoption leaves outbox `claimed` per design/worker)*.
- [x] **REFACTOR:** Durable deadline/completion integration kept out of PR2a as its own slice; no automatic slice was added *(evidence: delivered as Core B `20260911030000_sofia_pacing_core_b.sql`, separate from Core A)*.

### PR2b — Worker pacing/renewal — delivered

- [x] **RED:** Failing behavioral coverage for the 2–6 second formula, activity-before-generation, renewal/lost-fence behavior, adoption, durable crash pacing, gate-off baseline, and exactly one final authority transition *(evidence: `supabase/tests/sofia_pacing_core_b.sql` plan(37))*.
- [x] **GREEN:** Feature-on `complete_sofia_inbound_batch_paced(uuid,uuid,text,integer)->jsonb` plus a DB deadline; baseline three-argument completion remains; `pace_not_before` nullable and baseline-unaffected; DB-derived remaining duration; `milliseconds * interval '1 millisecond'` *(evidence: `20260911030000_sofia_pacing_core_b.sql`)*.
- [x] **TRIANGULATE:** Crash boundaries; recovery never regenerates an intent-backed batch or makes another external attempt *(evidence: worker `inbound-batch-worker.ts` heartbeat/lost-fence handling and `completePaced` precheck for existing intent)*.
- [x] **REFACTOR:** Activity kept distinct from message/outbox authority; no extra counters or authorities *(evidence: separate activity RPCs + `begin_sofia_response_delivery` as the only final-message authority)*.

### PR3 — Telegram delivery — delivered

- [x] Add the narrow `enviarAcaoChatTelegram(conversaId, 'typing')` adapter beside the existing Telegram message adapter, resolving the same chat ID/token authority *(evidence: `apps/web/src/lib/telegram/send.ts`)*.
- [x] Send typing after durable generation activity begins and refresh approximately every 4 seconds while generation or delivery activity remains valid, using a cancellable refresher, stopped before conditional clear *(evidence: `inbound-batch-worker.ts` `startTelegramTyping` with 4_000 ms interval; `dc9dcec` retains typing across generation and delivery)*.
- [x] Treat action failures as structured best-effort activity failures; never regenerate, claim another delivery, bypass `beginDelivery(D)`, or create a second final send *(evidence: `TelegramChatActionReport` outcome classification in `telegram/send.ts`)*.
- [x] Complete worker final sequencing and focused adapter/ordering tests, retaining exactly one final `sendMessage` call after final authority *(evidence: `inbound-batch-worker.ts` claims `beginDelivery` then a single `sendTelegram`)*.

### PR4 — Evolution capability gate and delivery — delivered (capability passed)

- [x] Record isolated, non-production evidence for the exact pinned Evolution **v2.3.7** per-chat composing contract *(evidence: `41c007e feat(sofia): preserve Evolution composing pace (#144)`; capability gate passed)*.
- [x] Narrowly fenced best-effort Evolution composing adapter authorized by `G`, refreshing through generation and the post-generation remainder *(evidence: `apps/web/src/lib/whatsapp/evolution-presence.ts`, `apps/web/src/lib/whatsapp/evolution.ts` `startEvolutionPresence` using `/chat/sendPresence/{instance}`)*.
- [x] Failure branch: if evidence failed/inconclusive, keep the Evolution producer gate closed and do not claim parity *(not triggered — evidence passed; gate remains default-closed at `evolutionInboundBatchEnqueueEnabled`)*.
- [x] Deterministic remainder and zero-retry/fence tests *(evidence: `sendWhatsApp(..., salvarNoBanco:false)` in `inbound-batch-worker.ts`; presence observer emits structured events; remainder covered by `sofia_pacing_core_b.sql`)*.

### PR5 — Web server admission — delivered except atomic idempotent admission

- [x] Add the strict-`"true"`, default-closed Web inbound batch producer gate while preserving Telegram/Evolution and processing gates *(evidence: `apps/web/src/lib/sofia/inbound-batch-gates.ts` `webInboundBatchEnqueueEnabled`)*.
- **INCOMPLETE (not a completed task):** the canonical Web admission RPC item — full verbatim line and reason in *Remaining incomplete tasks* below.
- [x] Update the server action to use durable admission when the Web gate is on and never call `processarIaChat` or `processarRagPipeline` directly on that path; preserve the direct fallback while the gate is off *(evidence: `apps/web/src/app/actions/chat.ts` — `webInboundBatchEnqueueEnabled()` branch calls `attachPersistedSofiaInboundMessage` and returns, else the direct RAG fallback)*.
- [x] Add migration/RPC compatibility coverage and direct-RAG gate-on regression tests; attachments remain canonical metadata only *(evidence: `supabase/tests/sofia_web_inbound_batch_admission.sql` plan(3), `sofia_inbound_batch_attach_message.sql` plan(21); gate-on direct-RAG avoidance enforced by the `chat.ts` branch)*.

### PR6 — Web authorized presence and rollout verification — delivered

- [x] Add authenticated, conversation-authorized presence readback and client expiry rendering; replace ephemeral Sofia `isIaTyping` behavior with durable conversation-scoped composing state *(evidence: `get_sofia_conversation_presence` RPC in `20260912020000_sofia_web_presence.sql`; `obterSofiaPresence` in `chat.ts`; `ChatContainer.tsx` derives `isIaTyping` from `expires_at > Date.now()`)*.
- [x] Add the authorized conversation-filtered readback path (authenticated filtered endpoint plus periodic readback, since the presence table is private); never publish an insecure table *(evidence: `ChatContainer.tsx` polls `obterSofiaPresence` every 5 s and does not subscribe directly to `sofia_conversation_presence`; RLS enabled + privileges revoked in `20260911020000_sofia_activity_core_a_corrective.sql`)*.
- [x] Cover mount/reconnect readback, `expires_at > Date.now()` rendering, local expiry safety-net re-render, RLS isolation, and final-message subscription behavior *(evidence: `ChatContainer.tsx` mount refresh + 5 s interval + expiry safety-net effect; `supabase/tests/sofia_web_presence.sql` plan(6) incl. owner/outsider/expiry RLS isolation)*.
- [x] Add deployment gates, canary entry evidence, observation/stop conditions, verification, and rollback documentation; all producer/runtime gates default-closed *(evidence: `cbe169a` closed-gate canary; `docs/runbooks/sofia-multichannel-status-and-handover.md`)*.

### Finishing design decisions — delivered except the TS pace helper

- [x] Combined `renew_sofia_owner_activity(batch uuid,owner_kind text,owner_token uuid,attemptA uuid,owner_ttl int,activity_ttl int)` returning `{attempt_id,owner_expires_at,activity_expires_at}|null`; renews live actual `G`/`D` plus `A` atomically; TTL 10..300 inclusive, NULL invalid, defaults 60/30 seconds; 10-second serialized heartbeat; no result after fence loss *(evidence: `20260911020000_sofia_activity_core_a_corrective.sql`)*.
- **INCOMPLETE (not a completed task):** the ECMAScript-trim / UTF-16-parity boundary-test item — full verbatim line and reason in *Remaining incomplete tasks* below.
- [x] Add nullable `pace_not_before`; paced wrapper calls existing three-argument completion in the same transaction, annotating only a newly created intent; existing `beginDelivery` gets the nullable due predicate and no paced-begin bypass; elapsed bounded integer 0..2147483647; DB returns `remaining_ms` from DB time *(evidence: `20260911030000_sofia_pacing_core_b.sql`)*.
- [x] Use the dedicated hashed advisory activity lock *(evidence: `pg_advisory_xact_lock(hashtextextended('sofia-activity:' || conversa_id, 91022))` in `20260911020000_sofia_activity_core_a_corrective.sql`; empirical dblink concurrent test retained in `sofia_activity_core_a.sql`)*.

### Validated cross-PR invariants

- [x] Preserve one pending batch, immutable membership, `SKIP LOCKED` claims, one-to-one outbox intent, distinct `G`/`A`/`D` fences, and at-most-one final-message authority *(evidence: activity Core A + pacing Core B migrations and their pgTAP suites)*.
- [x] Maintain default-closed producer gates and an independent default-closed runtime gate; processing-enabled alone does not activate the new activity/pacing behavior *(evidence: `inbound-batch-gates.ts` — `webInboundBatchEnqueueEnabled`, `inboundBatchRuntimeEnabled`, per-channel gates all strict `=== "true"`; worker branches on `runtimeEnabled`)*.
- [x] Validate exact RPC signatures/return shapes, TTL null/range behavior, lock hierarchy, deadline placement, JS/SQL length definition, grants/RLS, and concurrency *(evidence: pgTAP `function_privs_are`/`throws_ok`/dblink coverage across the seven sofia suites)*.

### Delivery resolution (supersedes the former planning gates)

The former deferred gates and parent-owned delivery/review gates are resolved: issue 4283 no longer blocks, the ask-on-risk delivery decision was superseded by the merged `main` delivery, and the preliminary size estimates were not a fit guarantee for this already-merged implementation. SQL/database, runtime, channel-activation, deployment/canary, and publication/review authorization were all obtained as part of the 12-commit delivery. This reconciliation is bookkeeping-only and changes no production behavior.

## Remaining incomplete tasks (exactly two)

Both lines below are reproduced **verbatim** from `tasks.md` (lines 61 and 75) and remain genuinely unchecked:

- [ ] Add or revise the canonical Web admission RPC so message insertion and `web` batch attachment happen in one authorized database transaction. Validate customer ownership, text/attachment input, and a client-generated Web-specific idempotency key/external-ID namespace; retries return the original message/batch without changing the deadline. *(INCOMPLETE: `attach_sofia_inbound_message(uuid,uuid,uuid,text)` takes only message id + channel; no `external_id`/idempotency namespace exists in `20260912010000_sofia_web_inbound_batch_admission.sql`; `enqueue_sofia_inbound_message` still accepts only `telegram`/`whatsapp` in that revision — the Web insert+attach is not one atomic transaction and no client idempotency key is stored.)*
- [ ] Implement explicit ECMAScript trim whitespace and UTF-16 SQL parity, including supplementary points >65535, with emoji/combining/NBSP/BOM/ASCII boundary tests. *(INCOMPLETE on the TypeScript side: SQL parity is delivered in `sofia_response_pace_minimum_ms` — exact ECMAScript whitespace trim via `regexp_replace` and UTF-16 unit counting via `octet_length(ch)=4 -> 2` — but the deterministic pure helper `apps/web/src/lib/sofia/response-pace.ts` from the design was never created; pacing lives only in SQL.)*

### Why each is genuinely incomplete (verified this run, read-only)

1. **Web atomic insert+attach with client-generated idempotency.** `grep -n 'external_id\|idempot' supabase/migrations/20260912010000_sofia_web_inbound_batch_admission.sql` returns nothing (exit 1 — no match). That migration defines `attach_sofia_inbound_message(p_message_id uuid, p_conversa_id uuid, p_cliente_id uuid, p_canal text)`, which attaches an **already-inserted** message id to a batch; it accepts no client-generated idempotency key and therefore cannot make Web insert+attach one atomic transaction. The Web `external_id` namespace does not exist there. The pre-existing `enqueue_sofia_inbound_message(uuid,uuid,text,text,text,text,timestamptz)` path — latest revision `20260913010000_sofia_timing_and_pacing_correction.sql` — still rejects `web` (`p_canal not in ('telegram', 'whatsapp')`) and its `'sofia-inbound:' || p_canal || ':' || p_delivery_key` external id is not reachable for the Web channel. Required remaining work: a Web-namespaced idempotency key and a single authorized transaction covering insert and attach.
2. **Deterministic TypeScript pace helper.** `apps/web/src/lib/sofia/response-pace.ts` does not exist; the directory contains only `inbound-batch-gates.ts`, `inbound-batch-producer.ts`, and `inbound-batch-worker.ts`. Pacing lives only in SQL via `public.sofia_response_pace_minimum_ms(text)` in `20260911030000_sofia_pacing_core_b.sql` (retimed by `20260913010000_sofia_timing_and_pacing_correction.sql`). Required remaining work: the ECMAScript-trim / UTF-16-parity pure helper plus its emoji/combining/NBSP/BOM/ASCII boundary tests.

## Deviations from design

1. **Timing corrected from 10 s / 20 s to 25 s sliding silence / 60 s starvation cap.** Delivered reality — deliberately restored by `15cdd6a` and documented as working in `docs/runbooks/sofia-multichannel-status-and-handover.md` — is a **25-second sliding silence window** under a **60-second starvation cap** (`supabase/migrations/20260913010000_sofia_timing_and_pacing_correction.sql`). The design/PR1 figures are superseded; PR1 tasks remain checked because they were delivered as `bd275ae`, with their original figures annotated.
2. **Web atomic idempotent admission not delivered** (Remaining task 1 above): design specified one authorized transaction with a client-generated Web-specific idempotency key/external-ID namespace; delivered state attaches a pre-existing message id and stores no client idempotency key.
3. **Design's deterministic TS pace helper not delivered** (Remaining task 2 above): pacing is SQL-only; no `response-pace.ts` parity helper with its boundary tests exists.

## Workload / PR boundary

**This apply run is bookkeeping-only.** The only authored change is this file (`openspec/changes/humanized-multichannel-sofia-responses/apply-progress.md`): a small Markdown diff, well under the 400-line review budget. No production code, migration, SQL, or test was written, deleted, compressed, or restyled in this run. No delivery decision (chain strategy, `auto-chain`, or `size:exception`) is required or requested for this diff. Delivery strategy remains `ask-on-risk` with chaining deferred; the production delivery itself already landed on `main` as the 12 commits listed above, so no further PR slicing is proposed here.

## Structured status consumed

- Native `gentle-ai.sdd-status humanized-multichannel-sofia-responses` v2, schema `gentle-ai.sdd-status`, `artifactStore: openspec`, `planningHome.mode: repo-local`.
- `dependencies`: proposal/specs/design/tasks all `all_done`; `apply: ready`; `verify: ready`; `archive: ready`.
- `taskProgress`: total 36, completed 34, pending 2, `allComplete: false`.
- `applyState: ready`; `nextRecommended: apply`; `blockedReasons: []`.
- `actionContext`: `mode: repo-local`, `workspaceRoot: /home/wilkin/proyectos/CRM_Sofia_Manager`, `allowedEditRoots: ["/home/wilkin/proyectos/CRM_Sofia_Manager"]` (repository root only). The single edited file is inside the authoritative workspace and allowed edit root. No `workspace-planning` mode, so no edit-root restriction applied; no write authority was inferred from status.
- Phase instructions directed resume from this apply-progress locator and implementation of unchecked tasks only, without re-editing `tasks.md`.
- `skill_resolution: paths-injected` (`/home/wilkin/.agents/skills/work-unit-commits/SKILL.md`, read before work).
- Native status grants no writes; explicit human consent in the parent prompt authorized exactly this one documentation edit. No marker was prepared and no persistent authority claimed.

## Strict TDD status

Strict TDD is active for this change (`openspec/config.yaml` sets `strict_tdd: true`; runner `vitest` via `npm test`, wrapping `scripts/workspace-preflight.sh run -- vitest run`). **No RED/GREEN cycle occurred in this run because no production code was written** — the only change is this bookkeeping document. No `TDD Cycle Evidence` table is recorded here, deliberately: fabricating one would misrepresent a documentation-only pass. The RED/GREEN/TRIANGULATE/REFACTOR evidence for the delivered slices is already recorded per-task above and in `tasks.md`.

## Superseded planning record (historical bytes retained — corrected, not overwritten)

> **Correction notice.** The section below was accurate as planning state at the time it was written. It is retained for history and is **not** current. Specifically, its claim that "No runtime-bearing apply occurred. No tests, SQL execution, source edits … occurred" and its claim "No implementation is marked done" and "Issue 4283 remains blocked" are **superseded and false as of the merged delivery**. Its "Remaining tasks" unchecked lines are historical planning items, not the authoritative gaps; the authoritative remaining gaps are the two verbatim `tasks.md` lines above.

### Corrected planning-only revision

No runtime-bearing apply occurred. No tests, SQL execution, source edits, acquire/settle/reset, DB mutation, Git staging/commit, or publication occurred. PR1 remains complete as `bd275ae`; the current uncommitted activity migration is a rejected candidate, not an applied prerequisite. Do not apply it plus a corrective migration: preserve its snapshot and obtain explicit scope approval for a future replacement.

The current approved delivery plan is **eight sequential PRs**, each <=400 code+test changed lines with no exception: PR1, Core A, Core B, Core C, Telegram, Evolution, Web server, and Web presence. The prior seven-PR plan is historical and superseded for current delivery planning; its evidence is preserved. Core A is private activity authorities/fencing/atomic renewal; Core B is durable deadline/completion compatibility/enforcement; Core C is gated worker/pacing. Preliminary, uncertified ranges are A 280–390, B 240–360, and C 290–390. Preserve PR1's five completed tasks and all pending functional work. No implementation is marked done. Issue 4283 remains blocked.

### Recommended finishing decisions and proposed split (planning only)

- Combined `renew_sofia_owner_activity(...)` with owner/activity TTLs 10..300 inclusive, NULL invalid, defaults 60/30 seconds, 10-second serialized heartbeat, exact G/D/A fencing, and no result after lost fence.
- ECMAScript trim plus explicit SQL whitespace/scalar-to-UTF-16 parity; test emoji, combining marks, NBSP, BOM, and ASCII boundaries.
- Nullable `pace_not_before`, same-transaction wrapper around existing three-argument completion, annotate only newly created intents, DB-time `remaining_ms`, and existing beginDelivery due predicate; no paced-begin bypass.
- Dedicated hashed advisory activity lock, not a security authority. Baseline FK/trigger interaction can lock conversation after batch, so the proposed unified order is not proven; an empirical concurrent test remains required.

**Current approved eight-PR split:** PR1 existing; Core A activity authorities/fencing/atomic renewal; Core B durable deadline/completion compatibility/enforcement; Core C gated worker/pacing; then Telegram, Evolution, Web server, and Web presence unchanged. Preliminary ranges A 280–390, B 240–360, C 290–390 are uncertified. This supersedes the seven-PR plan for current delivery planning without deleting its historical evidence. Approval is delivery-plan-only: no reset/native budget increase, source apply, SQL, tests/runtime execution, authority, commit, publication, or deployment. Issue 4283 still blocks apply.

### Unresolved pre-implementation prerequisites

- Validate exact RPC integration, return shapes, schema mechanism, explicit NULL/range TTL behavior, dblink concurrency, and a lock hierarchy against baseline. Do not claim unified lock safety before proof; revalidate predicates after locks and avoid conversation/batch/outbox inversions.
- Presence proposal: `owner_kind` generation/delivery, `owner_token` G/D, separate `attemptA`; idle requires all owner/source fields null, not merely boolean equivalence. Proposed contracts remain review-only: `begin(batch uuid,G uuid,ttl integer)->jsonb{attempt_id,expires_at}`, `renew(batch uuid,G uuid,A uuid,ttl integer)->same/null`, `adopt(batch uuid,D uuid,ttl integer)->same/null`, `clear(batch uuid,A uuid)->boolean`. Same-D idempotent/new-D rotates; expired owners cannot resurrect; live D requires completed-generation correspondence and cannot overwrite another live batch.
- No observed batch/delivery lease renewal RPC exists. This is a required contract gap; choose combined owner-lease-plus-activity renewal atomically if helpful rather than multiplying RPCs automatically.
- Proposed feature-on `complete_sofia_inbound_batch_paced(uuid,uuid,text,integer)->jsonb` must match verified baseline identity/status semantics plus DB deadline; preserve original live-G replay fencing, no repeated deadline reset, and baseline three-argument completion. `pace_not_before` is nullable and baseline unaffected. Delivery requires deadline null or due. Validate elapsed nonnegative/bounded, return DB-derived remaining duration, use `milliseconds * interval '1 millisecond'`, and resolve JS UTF-16 versus SQL `char_length` consistently.

### Planning stop and human gate

Remaining decisions are TTL null/range, combined renewal shape, shared text-length definition, verified lock hierarchy, and feasibility/placement of durable deadline/completion integration. That integration remains bounded to approved Core B and is not implementation authorization; preserve the approved boundaries and add no automatic slice. Leave all tasks unchecked.

### Remaining tasks (historical planning lines — superseded by the verbatim two above)

- [ ] **TRIANGULATE:** Cover crash boundaries, stale fences, adoption without `attempted`, and at-most-one final authority.
- [ ] **REFACTOR:** Keep activity distinct from message/outbox authority; run focused validation only after authorization.
- Parent-owned delivery and review actions remain deferred byte-for-byte.

### Structured status consumed (historical)

- Native 4283 unchanged; no recovery. No source implementation, SQL execution, authority/reset, or runtime mutation occurred.
- Skill resolution: paths-injected.

---

## Apply run — Web atomic idempotent admission (this run, 2026-09-14 workspace clock)

Appended, not overwritten. This run implements **exactly one** of the two remaining incomplete
tasks: item 1 of *Remaining incomplete tasks* above (the canonical Web admission RPC). The
second item (`apps/web/src/lib/sofia/response-pace.ts`) is untouched and remains unchecked.

### Completed task and persisted checkbox update

- `tasks.md` line 61 — `- [ ]` → `- [x]`, keeping the original wording and replacing the
  `*(INCOMPLETE: ...)*` annotation with sibling-style `*(evidence: ...)*`. No other task line
  was edited; the sibling `- [ ]` line (now line 75) is still unchecked.
- Native task progress expected after this run: 35 of 36 complete, 1 pending.

### What was delivered

1. **SQL — `supabase/migrations/20260914010000_sofia_web_atomic_admission.sql` (new, forward-only).**
   `create or replace function public.enqueue_sofia_inbound_message(...)` keeps its exact
   signature and now accepts `web`. Message insert, pending-batch selection/creation and batch
   membership happen in **one transaction** under the hashed advisory lock on the idempotency
   key. The client key is stored as the Web-specific namespace `sofia-web:<chave>` in
   `mensagens.external_id` (unique index `mensagens_external_id_key`); Telegram/WhatsApp keep
   `sofia-inbound:<canal>:<chave>`. A replay returns the original `message_id`, `batch_id` and
   `scheduled_process_at` and never touches `latest_message_at`, so the deadline is unchanged.
   Validation: `42501` authority-first, `22023` `SOFIA_BATCH_ADMISSION_INVALID` /
   `SOFIA_BATCH_BINDING_INVALID`, `23505` `SOFIA_BATCH_BINDING_CONFLICT` /
   `SOFIA_BATCH_DELIVERY_CONFLICT`. `security definer set search_path = ''`, re-issued
   `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role`.
   No historical migration was modified.
2. **Typed wrapper — `apps/web/src/lib/sofia/inbound-batch-producer.ts`.**
   `admitSofiaWebInboundMessage` calls that RPC with `p_canal: 'web'` and the client key,
   returns `{admitted, messageId, batchId, duplicate, scheduledAt}`, and fails closed
   (`{admitted:false}`, never throwing) on blank/oversized keys, RPC errors, thrown errors and
   unexpected payloads. `attachPersistedSofiaInboundMessage` is unchanged.
3. **Server action — `apps/web/src/app/actions/chat.ts`.**
   New exported `admitirMensagemSofiaWeb(conversaId, conteudo, idempotencyKey)`: validates
   authentication, business hours, conversation ownership and `ia_ativa`, then performs the
   atomic admission and returns the canonical message. It returns `{success:true, mensagem:null}`
   when the Web gate is not exactly `"true"`, out of hours, or the conversation is inactive, so
   the browser keeps the current direct path byte-for-byte in those cases. The shared
   `carregarConversaAutorizada` helper is now used by both `processarIaChat` and the new action
   (single authorization rule). `processarIaChat` return values and the pre-existing
   gate-on/attach branch are unchanged for backward compatibility.
4. **Client — `apps/web/src/components/chat/ChatContainer.tsx`.**
   Generates the idempotency key (`crypto.randomUUID()`, held in a ref across retries of the
   same attempt, cleared on success) and calls `admitirMensagemSofiaWeb` **before** inserting.
   When the server admits the message, the browser appends the canonical message returned by
   the action and **never inserts into `mensagens`**, removing the cross-transaction
   insert-then-attach sequence. When the action reports a fallback, the pre-existing direct
   insert + `processarIaChat(messageId)` path runs unchanged. A failed admission surfaces an
   error and persists nothing (fail closed).
5. **Tests.** `supabase/tests/sofia_web_atomic_admission.sql` (new, `plan(24)`),
   `tests/unit/sofia-web-admission-producer.test.ts` (new, 8 cases),
   `tests/unit/sofia-web-atomic-admission.test.ts` (new, 10 cases), plus one defensive mock
   export added to `tests/unit/cliente/chat.test.tsx`.

### Files changed

| File | Change |
| --- | --- |
| `supabase/migrations/20260914010000_sofia_web_atomic_admission.sql` | new migration (104 lines) |
| `supabase/tests/sofia_web_atomic_admission.sql` | new pgTAP suite (54 lines) |
| `apps/web/src/lib/sofia/inbound-batch-producer.ts` | + `admitSofiaWebInboundMessage` |
| `apps/web/src/app/actions/chat.ts` | + `admitirMensagemSofiaWeb`, shared authorization helper |
| `apps/web/src/components/chat/ChatContainer.tsx` | client key + atomic admission before insert |
| `tests/unit/sofia-web-admission-producer.test.ts` | new (116 lines) |
| `tests/unit/sofia-web-atomic-admission.test.ts` | new (245 lines) |
| `tests/unit/cliente/chat.test.tsx` | +1 mock export |
| `openspec/.../tasks.md` | line 61 checked with evidence |

### Test commands and exact results

| Command | Result |
| --- | --- |
| `npm test -- tests/unit/sofia-web-admission-producer.test.ts tests/unit/sofia-web-atomic-admission.test.ts` (RED) | 2 files failed, 20 tests failed |
| `npm test -- <two new files> tests/unit/client-role-security-actions.test.ts` (GREEN) | 3 files passed, 33 tests passed |
| `npm test -- tests/unit/cliente/chat.test.tsx <two new files> tests/unit/client-role-security-actions.test.ts` | 4 files passed, 43 tests passed |
| `npm test -- <8 chat/ChatContainer-related suites>` | 8 files passed, 43 tests passed |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | exit 0 |
| `npx eslint apps/web/src/app/actions/chat.ts apps/web/src/lib/sofia/inbound-batch-producer.ts apps/web/src/components/chat/ChatContainer.tsx <two new tests>` | exit 0, no findings |
| `scripts/run-local-sofia-sql-tests.sh supabase/tests/sofia_web_atomic_admission.sql` | **PASS 24/24 assertions**, 0 failed, exit 0 |
| `scripts/run-local-sofia-sql-tests.sh <new suite> supabase/tests/sofia_inbound_batch_admission.sql supabase/tests/sofia_inbound_batch_attach_message.sql` | new suite 4 failed pre-fix (see TDD table); both pre-existing suites PASS (41/41 and 21/21) — no regression in the shared RPC |
| `npm test` (full suite) | 232 passed / 3 failed files, 1537 passed / 10 failed tests, 1 skipped |

Full-suite failures are **not** caused by this change: `tests/unit/roles-authentication-e2e.test.ts`
(5) and `tests/unit/web-client-operator-cart-flow.test.ts` (2) are exactly the two service-backed
suites that require a live local Supabase stack, and `tests/unit/payment-proof-processing-worker.test.ts`
(3, `PAYMENT_PROOF_RENDER_FAILED`) reproduces **identically with this change stashed**
(`git stash push -u -- apps/web/src tests/unit/sofia-* supabase/*/20260914*` → same 3 failures), then
the stash was popped and `git status` confirmed all four files restored. The first full run under
parallel load also showed 4 additional flaky file failures that did not reproduce.

### Strict TDD — Cycle Evidence

| Cycle | Step | Test / command | Evidence |
| --- | --- | --- | --- |
| C1 | RED (TS) | wrote `tests/unit/sofia-web-admission-producer.test.ts` + `tests/unit/sofia-web-atomic-admission.test.ts` before any production code | `npm test -- <both>` → 2 files / 20 tests failed: `admitSofiaWebInboundMessage is not a function`, `admitirMensagemSofiaWeb is not a function` |
| C2 | GREEN (TS) | implemented wrapper + action | `npm test -- <both> tests/unit/client-role-security-actions.test.ts` → 33/33 passed |
| C3 | TRIANGULATE (TS) | added replay/duplicate, attachment-only, blank key, RPC error, thrown error, unexpected payload, single-object payload, gate-off table, admission rejection, key required, out-of-hours, inactive conversation, unauthenticated, non-owner, readback failure | 18 of the 33 cases are triangulation cases; all pass; the 1 initial failure was a test-authoring defect (fixture returned the caller's own client id for the non-owner case) and was fixed in the fixture, not by weakening the assertion |
| C4 | REFACTOR (TS) | extracted `carregarConversaAutorizada` and reused it in `processarIaChat` and the new action | focused re-run → 33/33 passed; the 4 pre-existing `client-role-security-actions` gate/authorization tests still pass, confirming behavior preservation |
| C5 | RED (SQL) | pgTAP suite authored alongside the migration; migration withheld from the chain and its `\ir` line removed, then restored byte-identically (sha256 verified) | `FAIL sofia_web_atomic_admission.sql (assertions=7 failed=2)` → `not ok 5 the canonical admission RPC accepts the Web channel`, `not ok 6 ... Web-specific external-id namespace`, psql aborted at the first Web admission call |
| C6 | GREEN (SQL) | migration restored | first run 4 failed assertions — a defect in **my test** (four `throws_ok` calls omitted the required 6th argument `p_url_anexo`, so PostgreSQL raised "function does not exist" instead of the expected token); fixed the test calls, not the migration → re-run **PASS 24/24** |
| C7 | REGRESSION | the two pre-existing sofia admission suites | `PASS 41/41`, `PASS 21/21` — the revised `enqueue_sofia_inbound_message` keeps the pinned 25 s ×2 / 60 s intervals, privileges, `security definer` and empty `search_path` |

### Deviations from design

1. **Reused the canonical RPC instead of adding a new one.** The design allows "a new atomic
   Web-admission RPC **or** a revised canonical Web message RPC"; the Web channel was added to
   `enqueue_sofia_inbound_message`, which already implemented insert+attach in one transaction
   with `external_id` idempotency. This avoids a second near-duplicate function.
2. **`ChatContainer` edit is slightly wider than "only the idempotency key".** The parent
   surface note allowed the client-generated key; enforcing the design's "no client-side
   insert-then-attach sequence is acceptable" additionally required branching around the direct
   insert. The branch reuses the existing code unchanged for the fallback.
3. **Known cost:** while the Web gate is closed (current production state), a sending customer
   now incurs one extra server-action round trip before the unchanged direct insert, because the
   browser cannot read the server-side gate. No gate was enabled and no production behavior was
   turned on.
4. **Attachment messages keep today's eligibility.** The client only routes text-only messages
   (the same condition that already triggered `processarIaChat`) into atomic admission, so
   attachment messages behave exactly as before (inserted client-side, never batched). The RPC
   itself accepts attachment-only admissions and this is covered by pgTAP.
5. **Legacy gate-on attach branch retained** in `processarIaChat` for backward compatibility and
   existing tests, with an explanatory comment; the Web UI path no longer reaches it.
6. **`tasks.md` prose is stale where the parent restricted edits.** The PR5 heading still reads
   "delivered except atomic idempotent admission" and the summary still says "exactly two"
   remain. Only line 61 was allowed to change, so those sentences are now inaccurate and should
   be reconciled in the slice-2 run.
7. **The new pgTAP suite is not in the harness default list.** `scripts/run-local-sofia-sql-tests.sh`
   was outside the allowed edit surface, so its `default_suites` array does not include
   `supabase/tests/sofia_web_atomic_admission.sql`; it must be passed explicitly (or added later).

### Remaining tasks (verbatim from `tasks.md`)

- [ ] Implement explicit ECMAScript trim whitespace and UTF-16 SQL parity, including supplementary points >65535, with emoji/combining/NBSP/BOM/ASCII boundary tests. *(INCOMPLETE on the TypeScript side: SQL parity is delivered in `sofia_response_pace_minimum_ms` — exact ECMAScript whitespace trim via `regexp_replace` and UTF-16 unit counting via `octet_length(ch)=4 -> 2` — but the deterministic pure helper `apps/web/src/lib/sofia/response-pace.ts` from the design was never created; pacing lives only in SQL.)*

### Workload / PR boundary — MEASURED OVER BUDGET

Authored lines this run (additions + deletions, excluding the parent's pre-existing
reconciliation diff in `tasks.md`/`apply-progress.md`):

| Work unit | Lines |
| --- | ---: |
| SQL migration + pgTAP suite | 158 |
| Server wiring (`inbound-batch-producer.ts` + `chat.ts` + its 245-line test) | 498 |
| Browser wiring (`ChatContainer.tsx` + client mock) | 41 |
| TS wrapper test | 116 |
| `tasks.md` line 61 | 2 |
| this apply-progress append (this file, 177 lines) | 177 |
| **Total (implementation + tests = 815; + openspec record = 992)** | **992** |

This slice **cannot land under the 400-line review budget as one cohesive work unit**. The
smallest cohesive units are SQL (158) and browser wiring (41) — both fit — but the server
admission unit alone (wrapper + action + its test) is 498 lines, and the action test cannot be
split further without deleting coverage. No comments, blank lines, docs or tests were removed or
compressed to reach the number, and no further shrinking was attempted per the budget rule.
Under `ask-on-risk` this requires an explicit human delivery decision (`size:exception`
acceptance for a single PR, or a re-slice approved by the parent); no chain strategy and no
exception were assumed. The code is complete and verified in the working tree and is **not
committed**.

### Structured status consumed / produced

- Consumed native `gentle-ai.sdd-status` v2 for this change: `applyState: ready`,
  `nextRecommended: apply`, `taskProgress 34/36`, `dependencies.proposal/specs/design/tasks:
  all_done`, `apply: ready`, `verify: ready`, `archive: ready`, `blockedReasons: []`.
- `actionContext`: `mode: repo-local`, `workspaceRoot /home/wilkin/proyectos/CRM_Sofia_Manager`,
  `allowedEditRoots: ["/home/wilkin/proyectos/CRM_Sofia_Manager"]` — every file written is inside
  that root; no `workspace-planning` restriction applied. Status granted no writes; the explicit
  parent prompt authorized exactly this task's files. No migration was executed against any
  remote or production database: only the disposable local harness described above.
- Not committed, by instruction. `skill_resolution: paths-injected`
  (`/home/wilkin/.agents/skills/work-unit-commits/SKILL.md`, read before work).
- Delivery status after this run: **paused on the size/`size:exception` decision**, not on
  readiness; implementation evidence is complete.

## Run 3 — Web atomic admission (slice 1 of 2 for the remaining gaps)

Implements `tasks.md` line 61 only: the canonical Web admission RPC now inserts the message and
attaches it to the `web` batch in one authorized transaction, with the client-generated idempotency
key stored as `sofia-web:<chave>` in `mensagens.external_id`.

Artifacts: `supabase/migrations/20260914010000_sofia_web_atomic_admission.sql` (new),
`supabase/tests/sofia_web_atomic_admission.sql` (new, plan 24),
`apps/web/src/lib/sofia/inbound-batch-producer.ts`, `apps/web/src/app/actions/chat.ts`,
`apps/web/src/components/chat/ChatContainer.tsx`,
`tests/unit/sofia-web-admission-producer.test.ts` (new),
`tests/unit/sofia-web-atomic-admission.test.ts` (new), `tests/unit/cliente/chat.test.tsx`.

### Review workload and the accepted exception

Measured by the parent on 2026-09-18: **813 authored implementation + test lines** (migration 104,
pgTAP 54, new Vitest 361, wiring ~294), excluding the OpenSpec record. That is roughly twice the
400-line review budget, so `sdd-apply` returned `blocked` under `ask-on-risk` instead of exceeding
the budget silently.

**The user explicitly accepted `size:exception` for this slice.** It is one coherent unit — a single
forward-only migration, its pgTAP suite, and the wiring that consumes it — and roughly half the diff
is new test evidence that strict TDD requires. Splitting it after implementation would mean redoing
the work and repaying verification, and the smallest cohesive sub-unit the agent could isolate is
still 498 lines, so chaining would not bring it under budget without deleting coverage.

### Verification evidence (independent, run by the parent)

- `npx vitest run tests/unit/sofia-web-admission-producer.test.ts tests/unit/sofia-web-atomic-admission.test.ts` → 20 passed / 2 files.
- `npx vitest run tests/unit/cliente/chat.test.tsx` → 10 passed / 1 file.
- `tasks.md` line 61 is `- [x]` with evidence; line 75 remains `- [ ]`.
- Reported by the apply agent and not re-run by the parent: pgTAP `plan(24)` 24/24 via
  `scripts/run-local-sofia-sql-tests.sh`, `tsc --noEmit` clean, `eslint` clean.

### Corrections applied by the parent to the apply record

The apply agent's envelope reported "43 focused Vitest cases", and `tasks.md` was annotated with "33
Vitest cases". Neither is reproducible: the measured count across the named files is 20 + 10 = 30.
The annotation now records the measured number. The stale "exactly two" summary and the
`## PR5` heading were also corrected to reflect one remaining task.
