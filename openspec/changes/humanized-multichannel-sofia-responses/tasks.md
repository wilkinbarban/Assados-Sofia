# Implementation Tasks: Humanized Multichannel Sofia Responses

## Delivery status (reconciled against `main`)

This change is **delivered and merged to `main`**. Implementation spans 12 commits in `a25dcb7..dc9dcec` (`a25dcb7`, `bf4b2e2`, `c93a7ad`, `27db2cd`, `fc15cb4`, `41c007e`, `591c2db`, `f2b0733`, `a792086`, `cbe169a`, `15cdd6a`, `dc9dcec`); `2585a70` in the same range is unrelated to this change. Source edits, migrations, pgTAP suites, and the ops scheduler all landed and are present in the working tree. Apply is **not** blocked; issue **4283** no longer gates this change.

### Timing correction (supersedes PR1 wording)

The artifacts previously recorded "10 seconds of silence / 20-second cap". Delivered reality — deliberately restored by `15cdd6a` and documented as working in `docs/runbooks/sofia-multichannel-status-and-handover.md` — is a **25-second sliding silence window** under a **60-second starvation cap** (`supabase/migrations/20260913010000_sofia_timing_and_pacing_correction.sql`). The PR1 lines below remain checked (they were delivered as `bd275ae`) but their 10 s / 20 s figures are superseded by 25 s / 60 s.

### Remaining incomplete tasks (exactly one, left unchecked)

One design item remains genuinely incomplete and unchecked:

- The deterministic TypeScript pace helper `apps/web/src/lib/sofia/response-pace.ts` (see Finishing design decisions below); pacing lives only in SQL via `sofia_response_pace_minimum_ms`.

The Web atomic insert+attach with a client-generated idempotency key was completed in
`supabase/migrations/20260914010000_sofia_web_atomic_admission.sql` and is checked off under PR5.

---

## PR1 — Timing revision — complete (`bd275ae`)

Retained as merged; the 10 s / 20 s figures are superseded by the 25 s / 60 s correction above.

- [x] Revise batch admission timing to **10 seconds of silence** *(superseded to 25 s sliding silence by `15cdd6a` / `20260913010000_sofia_timing_and_pacing_correction.sql`)*.
- [x] Apply the **20-second cap** from the immutable first-message/admission timing boundary *(superseded to 60 s starvation cap, same correction)*.
- [x] Update the tracked maintenance scheduler to a validated **2-second** interval *(evidence: `ops/sofia-inbound-batch-maintenance-scheduler.sh` defaults and validates `SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS:=2`)*.
- [x] Update the affected migration/test coverage for the timing revision, with historical migrations remaining immutable *(evidence: `20260910010000_sofia_humanized_timing.sql`, `20260913010000_sofia_timing_and_pacing_correction.sql`)*.
- [x] Preserve compatible migration/RPC evolution: forward-only compatible replacements and compatibility wrappers only where signatures require them; the rejected activity migration is not applied *(evidence: `CREATE OR REPLACE FUNCTION` revisions across the sofia migrations)*.

## PR2a — Private inert schema/fencing — delivered

- [x] **RED:** Failing SQL behavioral coverage for private schema constraints, direct privilege revocation, service-only RPCs, explicit null/range TTL, stale `G`/`D` fences, same-batch idempotence, fresh-owner `A` rotation, cross-batch exclusion, adoption correspondence without `attempted`, durable completion continuity, conditional clear, lock ordering, and at-most-one *(evidence: `supabase/tests/sofia_activity_core_a.sql` plan(39), incl. `function_privs_are`, `has_table`, `throws_ok`, and dblink concurrency)*.
- [x] **GREEN:** Private presence ownership with `owner_kind` (`generation`/`delivery`), owner token (`G`/`D`), separate `attempt_id` (`A`), and explicit idle requiring all owner/source fields null; `begin`/`renew`/`adopt`/`clear` contracts *(evidence: `20260911020000_sofia_activity_core_a_corrective.sql` creates `sofia_conversation_presence`, `begin_sofia_batch_activity`, `renew_sofia_owner_activity`, `adopt_sofia_response_activity`, `clear_sofia_batch_activity`)*.
- [x] **TRIANGULATE:** dblink concurrency, stale cleanup, live cross-batch exclusion, adoption preserving outbox `claimed` *(evidence: `sofia_activity_core_a.sql` dblink owner/contender race, lines 36–49; adoption leaves outbox `claimed` per design/worker)*.
- [x] **REFACTOR:** Durable deadline/completion integration kept out of PR2a as its own slice; no automatic slice was added *(evidence: delivered as Core B `20260911030000_sofia_pacing_core_b.sql`, separate from Core A)*.

## PR2b — Worker pacing/renewal — delivered

- [x] **RED:** Failing behavioral coverage for the 2–6 second formula, activity-before-generation, renewal/lost-fence behavior, adoption, durable crash pacing, gate-off baseline, and exactly one final authority transition *(evidence: `supabase/tests/sofia_pacing_core_b.sql` plan(37))*.
- [x] **GREEN:** Feature-on `complete_sofia_inbound_batch_paced(uuid,uuid,text,integer)->jsonb` plus a DB deadline; baseline three-argument completion remains; `pace_not_before` nullable and baseline-unaffected; DB-derived remaining duration; `milliseconds * interval '1 millisecond'` *(evidence: `20260911030000_sofia_pacing_core_b.sql`)*.
- [x] **TRIANGULATE:** Crash boundaries; recovery never regenerates an intent-backed batch or makes another external attempt *(evidence: worker `inbound-batch-worker.ts` heartbeat/lost-fence handling and `completePaced` precheck for existing intent)*.
- [x] **REFACTOR:** Activity kept distinct from message/outbox authority; no extra counters or authorities *(evidence: separate activity RPCs + `begin_sofia_response_delivery` as the only final-message authority)*.

## PR3 — Telegram delivery — delivered

- [x] Add the narrow `enviarAcaoChatTelegram(conversaId, 'typing')` adapter beside the existing Telegram message adapter, resolving the same chat ID/token authority *(evidence: `apps/web/src/lib/telegram/send.ts`)*.
- [x] Send typing after durable generation activity begins and refresh approximately every 4 seconds while generation or delivery activity remains valid, using a cancellable refresher, stopped before conditional clear *(evidence: `inbound-batch-worker.ts` `startTelegramTyping` with 4_000 ms interval; `dc9dcec` retains typing across generation and delivery)*.
- [x] Treat action failures as structured best-effort activity failures; never regenerate, claim another delivery, bypass `beginDelivery(D)`, or create a second final send *(evidence: `TelegramChatActionReport` outcome classification in `telegram/send.ts`)*.
- [x] Complete worker final sequencing and focused adapter/ordering tests, retaining exactly one final `sendMessage` call after final authority *(evidence: `inbound-batch-worker.ts` claims `beginDelivery` then a single `sendTelegram`)*.

## PR4 — Evolution capability gate and delivery — delivered (capability passed)

- [x] Record isolated, non-production evidence for the exact pinned Evolution **v2.3.7** per-chat composing contract *(evidence: `41c007e feat(sofia): preserve Evolution composing pace (#144)`; capability gate passed)*.
- [x] Narrowly fenced best-effort Evolution composing adapter authorized by `G`, refreshing through generation and the post-generation remainder *(evidence: `apps/web/src/lib/whatsapp/evolution-presence.ts`, `apps/web/src/lib/whatsapp/evolution.ts` `startEvolutionPresence` using `/chat/sendPresence/{instance}`)*.
- [x] Failure branch: if evidence failed/inconclusive, keep the Evolution producer gate closed and do not claim parity *(not triggered — evidence passed; gate remains default-closed at `evolutionInboundBatchEnqueueEnabled`)*.
- [x] Deterministic remainder and zero-retry/fence tests *(evidence: `sendWhatsApp(..., salvarNoBanco:false)` in `inbound-batch-worker.ts`; presence observer emits structured events; remainder covered by `sofia_pacing_core_b.sql`)*.

## PR5 — Web server admission — delivered

- [x] Add the strict-`"true"`, default-closed Web inbound batch producer gate while preserving Telegram/Evolution and processing gates *(evidence: `apps/web/src/lib/sofia/inbound-batch-gates.ts` `webInboundBatchEnqueueEnabled`)*.
- [x] Add or revise the canonical Web admission RPC so message insertion and `web` batch attachment happen in one authorized database transaction. Validate customer ownership, text/attachment input, and a client-generated Web-specific idempotency key/external-ID namespace; retries return the original message/batch without changing the deadline. *(evidence: `supabase/migrations/20260914010000_sofia_web_atomic_admission.sql` revises `enqueue_sofia_inbound_message` to accept `web` and to store the client key as `sofia-web:<chave>` in `mensagens.external_id`; message insert + pending `web` batch attach + membership happen in one transaction under the hashed advisory lock, with `42501`/`22023`/`23505` validation and an unchanged `scheduled_process_at` on replay. `apps/web/src/lib/sofia/inbound-batch-producer.ts` adds `admitSofiaWebInboundMessage`; `apps/web/src/app/actions/chat.ts` adds `admitirMensagemSofiaWeb`, which authorizes the caller and returns the canonical message so the browser no longer inserts before attaching. Verified by `supabase/tests/sofia_web_atomic_admission.sql` plan(24) — 24/24 pass via `scripts/run-local-sofia-sql-tests.sh`, and 2/24 fail against the pre-migration function (RED) — plus 20 Vitest cases in `tests/unit/sofia-web-admission-producer.test.ts` and `tests/unit/sofia-web-atomic-admission.test.ts` (count measured by the parent on 2026-09-18), and 10 in `tests/unit/cliente/chat.test.tsx`.)*
- [x] Update the server action to use durable admission when the Web gate is on and never call `processarIaChat` or `processarRagPipeline` directly on that path; preserve the direct fallback while the gate is off *(evidence: `apps/web/src/app/actions/chat.ts` — `webInboundBatchEnqueueEnabled()` branch calls `attachPersistedSofiaInboundMessage` and returns, else the direct RAG fallback)*.
- [x] Add migration/RPC compatibility coverage and direct-RAG gate-on regression tests; attachments remain canonical metadata only *(evidence: `supabase/tests/sofia_web_inbound_batch_admission.sql` plan(3), `sofia_inbound_batch_attach_message.sql` plan(21); gate-on direct-RAG avoidance enforced by the `chat.ts` branch)*.

## PR6 — Web authorized presence and rollout verification — delivered

- [x] Add authenticated, conversation-authorized presence readback and client expiry rendering; replace ephemeral Sofia `isIaTyping` behavior with durable conversation-scoped composing state *(evidence: `get_sofia_conversation_presence` RPC in `20260912020000_sofia_web_presence.sql`; `obterSofiaPresence` in `chat.ts`; `ChatContainer.tsx` derives `isIaTyping` from `expires_at > Date.now()`)*.
- [x] Add the authorized conversation-filtered readback path (authenticated filtered endpoint plus periodic readback, since the presence table is private); never publish an insecure table *(evidence: `ChatContainer.tsx` polls `obterSofiaPresence` every 5 s and does not subscribe directly to `sofia_conversation_presence`; RLS enabled + privileges revoked in `20260911020000_sofia_activity_core_a_corrective.sql`)*.
- [x] Cover mount/reconnect readback, `expires_at > Date.now()` rendering, local expiry safety-net re-render, RLS isolation, and final-message subscription behavior *(evidence: `ChatContainer.tsx` mount refresh + 5 s interval + expiry safety-net effect; `supabase/tests/sofia_web_presence.sql` plan(6) incl. owner/outsider/expiry RLS isolation)*.
- [x] Add deployment gates, canary entry evidence, observation/stop conditions, verification, and rollback documentation; all producer/runtime gates default-closed *(evidence: `cbe169a` closed-gate canary; `docs/runbooks/sofia-multichannel-status-and-handover.md`)*.

## Finishing design decisions — delivered except the TS pace helper

- [x] Combined `renew_sofia_owner_activity(batch uuid,owner_kind text,owner_token uuid,attemptA uuid,owner_ttl int,activity_ttl int)` returning `{attempt_id,owner_expires_at,activity_expires_at}|null`; renews live actual `G`/`D` plus `A` atomically; TTL 10..300 inclusive, NULL invalid, defaults 60/30 seconds; 10-second serialized heartbeat; no result after fence loss *(evidence: `20260911020000_sofia_activity_core_a_corrective.sql`)*.
- [ ] Implement explicit ECMAScript trim whitespace and UTF-16 SQL parity, including supplementary points >65535, with emoji/combining/NBSP/BOM/ASCII boundary tests. *(INCOMPLETE on the TypeScript side: SQL parity is delivered in `sofia_response_pace_minimum_ms` — exact ECMAScript whitespace trim via `regexp_replace` and UTF-16 unit counting via `octet_length(ch)=4 -> 2` — but the deterministic pure helper `apps/web/src/lib/sofia/response-pace.ts` from the design was never created; pacing lives only in SQL.)*
- [x] Add nullable `pace_not_before`; paced wrapper calls existing three-argument completion in the same transaction, annotating only a newly created intent; existing `beginDelivery` gets the nullable due predicate and no paced-begin bypass; elapsed bounded integer 0..2147483647; DB returns `remaining_ms` from DB time *(evidence: `20260911030000_sofia_pacing_core_b.sql`)*.
- [x] Use the dedicated hashed advisory activity lock *(evidence: `pg_advisory_xact_lock(hashtextextended('sofia-activity:' || conversa_id, 91022))` in `20260911020000_sofia_activity_core_a_corrective.sql`; empirical dblink concurrent test retained in `sofia_activity_core_a.sql`)*.

## Validated cross-PR invariants

- [x] Preserve one pending batch, immutable membership, `SKIP LOCKED` claims, one-to-one outbox intent, distinct `G`/`A`/`D` fences, and at-most-one final-message authority *(evidence: activity Core A + pacing Core B migrations and their pgTAP suites)*.
- [x] Maintain default-closed producer gates and an independent default-closed runtime gate; processing-enabled alone does not activate the new activity/pacing behavior *(evidence: `inbound-batch-gates.ts` — `webInboundBatchEnqueueEnabled`, `inboundBatchRuntimeEnabled`, per-channel gates all strict `=== "true"`; worker branches on `runtimeEnabled`)*.
- [x] Validate exact RPC signatures/return shapes, TTL null/range behavior, lock hierarchy, deadline placement, JS/SQL length definition, grants/RLS, and concurrency *(evidence: pgTAP `function_privs_are`/`throws_ok`/dblink coverage across the seven sofia suites)*.

## Delivery resolution (supersedes the former planning gates)

The former "deferred gates" and "parent-owned delivery and review gates" are resolved: issue 4283 no longer blocks, the ask-on-risk delivery decision was superseded by the merged `main` delivery, and the preliminary size estimates were not a fit guarantee for this already-merged implementation. SQL/database, runtime, channel-activation, deployment/canary, and publication/review authorization were all obtained as part of the 12-commit delivery. This reconciliation is bookkeeping-only and changes no production behavior.
