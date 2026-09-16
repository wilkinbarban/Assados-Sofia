# Implementation Tasks: Humanized Multichannel Sofia Responses

## Planning-only status

This is a recovered planning roadmap, not an implementation report. Documentation only: no code, tests, SQL execution, runtime validation, authority/reset, database mutation, Git staging/commit, publication, or review lifecycle occurred in this correction. PR1 (`bd275ae`) remains complete only for the five items explicitly supported by the available design/apply-progress evidence below. The current uncommitted activity migration is a rejected candidate: preserve its snapshot, do not apply it plus a corrective migration, and obtain explicit scope approval before designing a future replacement. Applying or executing SQL requires separate database authorization.

The current approved delivery plan is **eight sequential PRs to `main`**: PR1, Core A, Core B, Core C, Telegram, Evolution, Web server, and Web presence. Each is <=400 code+test changed lines; no exception is approved. This approval changes delivery slicing only. The prior seven-PR plan is historical and superseded for current delivery planning; preserve its evidence and all functional work.

## PR1 — Timing revision — complete (`bd275ae`)

The following five completed items are retained because they are identifiable in `design.md` and `apply-progress.md` as part of the merged PR1 timing revision:

- [x] Revise batch admission timing to **10 seconds of silence**.
- [x] Apply the **20-second cap** from the immutable first-message/admission timing boundary.
- [x] Update the tracked maintenance scheduler to a validated **2-second** interval.
- [x] Update the affected migration/test coverage for the timing revision, with historical migrations remaining immutable.
- [x] Preserve compatible migration/RPC evolution: use forward-only compatible replacements and compatibility wrappers only where signatures require them; do not apply the rejected activity migration.

**Evidence boundary:** `design.md` identifies PR1 as merged as `bd275ae` and lists compatible migration schedule replacements, pgTAP updates, and the tracked scheduler configuration. `apply-progress.md` independently records PR1 as complete. No other completed item is inferred here.

## PR2a — Private inert schema/fencing tests

**Planning status:** Proposed boundary only; unchecked and unexecuted. Default-closed and private/inert.

- [ ] **RED:** Add failing SQL behavioral coverage for private schema constraints, direct privilege revocation, service-only RPCs, explicit null/range TTL, stale `G`/`D` fences, same-batch idempotence, fresh-owner `A` rotation, cross-batch exclusion, adoption correspondence without `attempted`, durable completion continuity, conditional clear, lock ordering, and at-most-one.
- [ ] **GREEN:** Propose private presence ownership with `owner_kind` (`generation`/`delivery`), owner token (`G`/`D`), separate `attempt_id` (`A`), and explicit idle requiring all owner/source fields null. Proposed contracts: `begin(batch uuid,generation uuid,ttl integer)->jsonb {attempt_id,expires_at}`, `renew(batch uuid,generation uuid,attempt uuid,ttl integer)->same/null`, `adopt(batch uuid,delivery uuid,ttl integer)->same/null`, and `clear(batch uuid,attempt uuid)->boolean`. All TTLs explicitly reject `NULL` and enforce a documented range. Missing batch/delivery lease renewal RPC is a required gap; prefer combined owner-lease-plus-activity renewal where useful. Same-D is idempotent/new-D rotates; expired owners cannot resurrect; live D requires completed-generation correspondence and cannot overwrite another live batch. Revalidate predicates after locks; the baseline unified lock hierarchy is not yet proven. This is a plan, not an implementation-ready claim.
- [ ] **TRIANGULATE:** Cover dblink concurrency, stale cleanup, live cross-batch exclusion, and adoption preserving outbox `claimed`.
- [ ] **REFACTOR:** Preserve the seven-PR boundaries. Durable deadline/completion integration is **UNAPPROVED** if it expands inert PR2a; do not add an automatic slice.

**Estimate:** final PR2a estimate **310–470**, excluding **20–35** incremental uncommitted-correction overhead. Runtime sizing remains **330–505** preliminary. These are not measured or a fit guarantee; the upper bound exceeds the 400-line review budget.

## PR2b — Worker pacing/renewal

**Planning status:** Proposed boundary only; unchecked and unexecuted. Independent strict default-closed runtime/activity gate; when off, preserve the existing worker processing path and do not disable the whole worker.

- [ ] **RED:** Add failing behavioral coverage for the exact 2–6 second formula, activity-before-generation, renewal/lost-fence behavior, adoption, durable crash pacing, gate-off baseline, and exactly one final authority transition.
- [ ] **GREEN:** Proposed feature-on `complete_sofia_inbound_batch_paced(uuid,uuid,text,integer)->jsonb` matches verified baseline identity/status semantics plus a DB deadline; baseline three-argument completion remains. Validate elapsed milliseconds as nonnegative and bounded, compute the deadline atomically only if feasible, and never reset it on replay. `pace_not_before` is nullable and baseline-unaffected; `beginDelivery` requires null or due in feature-on mode only. Return DB-derived remaining duration. Use `milliseconds * interval '1 millisecond'`; do not use unsupported `make_interval(msecs => ...)`. Resolve JS UTF-16 versus SQL `char_length` consistently before implementation.
- [ ] **TRIANGULATE:** Cover every documented crash boundary; recovery never regenerates an intent-backed batch or makes another external attempt.
- [ ] **REFACTOR:** Keep activity distinct from message/outbox authority; no extra counters or authorities.

**Estimate:** PR2b **300–490 preliminary**. It is not measured, a minimum, or a fit guarantee; the upper bound exceeds the 400-line review budget. This historical PR2a/PR2b estimate is superseded by the approved Core A/B/C delivery sequence below; retain these functional obligations within that sequence.

## PR3 — Telegram delivery

**Planning status:** Pending; unchecked and unexecuted. No producer activation is included.

- [ ] Add the narrow `enviarAcaoChatTelegram(conversaId, 'typing')` adapter beside the existing Telegram message adapter, resolving the same chat ID/token authority.
- [ ] Send typing after durable generation activity begins and refresh approximately every 4 seconds while generation or delivery activity remains valid; use a cancellable refresher and stop it before conditional clear.
- [ ] Treat action failures as structured best-effort activity failures; they must not regenerate, claim another delivery, bypass `beginDelivery(D)`, or create a second final send.
- [ ] Complete worker final sequencing and focused adapter/ordering tests, retaining exactly one final `sendMessage` call after final authority.

## PR4 — Evolution capability gate and delivery

**Planning status:** Pending; unchecked and unexecuted. No producer activation is included unless the mandatory capability gate passes.

- [ ] Record isolated, non-production evidence for the exact pinned Evolution **v2.3.7** per-chat composing contract: route, request body, authentication, target chat identifier, composing value, and refresh/expiry behavior. A pinned upstream source/API artifact or an isolated disposable test-chat probe is acceptable; no Sofia generation, final message, database mutation, or production credential may be used.
- [ ] If evidence passes, add only a narrowly fenced best-effort Evolution composing adapter authorized by `G`, refreshing through generation and the post-generation remainder; preserve final-send `presence:'composing'` where compatible and `evolutionMaxRetries(...salvarNoBanco:false) === 0`.
- [ ] If evidence fails or is inconclusive, record acceptance failure, keep the Evolution producer gate closed, and do not claim parity or substitute a fake preliminary message/unverified route.
- [ ] Add deterministic remainder and zero-retry/fence tests. Meta WhatsApp Cloud remains excluded.

## PR5 — Web server admission

**Planning status:** Pending; unchecked and unexecuted. This is the server slice only; client presence remains PR6.

- [ ] Add the strict-`"true"`, default-closed Web inbound batch producer gate while preserving Telegram/Evolution and processing gates.
- [ ] Add or revise the canonical Web admission RPC so message insertion and `web` batch attachment happen in one authorized database transaction. Validate customer ownership, text/attachment input, and a client-generated Web-specific idempotency key/external-ID namespace; retries return the original message/batch without changing the deadline.
- [ ] Update the server action to use durable admission when the Web gate is on and never call `processarIaChat` or `processarRagPipeline` directly on that path. Preserve the existing direct fallback unchanged while the gate is off.
- [ ] Add migration/RPC compatibility coverage and direct-RAG gate-on regression tests. Attachments remain canonical metadata only; never expose storage keys, signed URLs, provider IDs, or binary content.

## PR6 — Web authorized presence and rollout verification

**Planning status:** Pending; unchecked and unexecuted.

- [ ] Add authenticated, conversation-authorized presence readback and client expiry rendering; replace ephemeral Sofia `isIaTyping` behavior with durable conversation-scoped composing state.
- [ ] Add the authorized conversation-filtered Realtime subscription only after the RLS select policy is verified. If deployed Realtime cannot enforce tenant policy, use the authenticated filtered endpoint plus periodic readback instead; never publish an insecure table.
- [ ] Cover mount/reconnect readback, `expires_at > Date.now()` rendering, local expiry safety-net re-render, RLS isolation, and final-message subscription behavior.
- [ ] Add deployment gates, canary entry evidence, observation/stop conditions, verification, and rollback documentation. Keep all producer/runtime gates default-closed; deploy does not open production behavior automatically. Verify disabled maintenance responses, Telegram typing/stale-clear, Evolution capability evidence if applicable, and Web authorization/readback before any separately authorized gate opening.

## Finishing design decisions (planning only)

- [ ] Use combined `renew_sofia_owner_activity(batch uuid,owner_kind text,owner_token uuid,attemptA uuid,owner_ttl int,activity_ttl int)` returning `{attempt_id,owner_expires_at,activity_expires_at}|null`; renew live actual `G`/`D` plus `A` atomically, wrong/stale/expired changes neither, omit owner secrets. TTL 10..300 inclusive; NULL invalid; defaults 60/30 seconds; heartbeat 10 seconds, serialized/non-overlapping; stop before completion/beginDelivery and accept no result after fence loss.
- [ ] Implement explicit ECMAScript trim whitespace and UTF-16 SQL parity, including supplementary points >65535, with emoji/combining/NBSP/BOM/ASCII boundary tests.
- [ ] Add nullable `pace_not_before`; paced wrapper calls existing three-argument completion in the same transaction, annotating only a newly created intent; existing beginDelivery gets the nullable due predicate and no paced-begin bypass. Elapsed is bounded integer 0..2147483647; DB returns remaining_ms from DB time.
- [ ] Use the dedicated hashed advisory activity lock. Baseline completion may lock conversation after batch through mensagens FK/triggers, so unified conversation→batch→outbox→activity ordering is not claimed; retain an empirical concurrent test obligation.

## Current approved eight-PR delivery sequence

PR1 remains the existing completed PR. The approved sequence is: Core A private activity authorities/fencing/atomic renewal; Core B durable deadline/compatibility/enforcement; Core C gated worker/pacing; Telegram; Evolution; Web server; Web presence. Preliminary, uncertified ranges are A 280–390, B 240–360, and C 290–390. Preserve all remaining functional work as pending and do not mark implementation done. This approval does not authorize new budget, reset/native budget increase, source apply, SQL, authority, commit, publication, or deployment. Issue 4283 still blocks apply.

## Cross-PR invariants and deferred gates

- [ ] Keep all tasks unchecked except the five evidence-backed PR1 items above until implementation-time validation and authorization.
- [ ] Preserve one pending batch, immutable membership, `SKIP LOCKED` claims, one-to-one outbox intent, distinct `G`/`A`/`D` fences, and at-most-one final-message authority.
- [ ] Maintain default-closed producer gates and an independent default-closed runtime gate; processing-enabled alone must not activate new activity/pacing behavior.
- [ ] Validate exact RPC signatures/return shapes, TTL null/range behavior, lock hierarchy, deadline placement, JS/SQL length definition, grants/RLS, and concurrency before implementation claims.
- [ ] Keep issue **4283** as blocked authority context; no supported recovery route, extra authority, or automatic slice is inferred.
- [ ] Obtain separate authorization for SQL/database changes, runtime/environment changes, channel activation, deployment/canaries, and any publication or review lifecycle.

## Parent-owned delivery and review gates

- [ ] Confirm issue authority and the ask-on-risk delivery decision before apply.
- [ ] Do not treat preliminary estimates as a fit guarantee. Both PR2 estimates have an upper bound above 400; stop under `ask-on-risk` if line accounting confirms the risk.
- [ ] Do not claim anything beyond documentation recovery in this planning correction.
