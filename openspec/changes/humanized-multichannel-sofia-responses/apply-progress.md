# Apply Progress: Humanized Multichannel Sofia Responses

## Corrected planning-only revision

No runtime-bearing apply occurred. No tests, SQL execution, source edits, acquire/settle/reset, DB mutation, Git staging/commit, or publication occurred. PR1 remains complete as `bd275ae`; the current uncommitted activity migration is a rejected candidate, not an applied prerequisite. Do not apply it plus a corrective migration: preserve its snapshot and obtain explicit scope approval for a future replacement.

The current approved delivery plan is **eight sequential PRs**, each <=400 code+test changed lines with no exception: PR1, Core A, Core B, Core C, Telegram, Evolution, Web server, and Web presence. The prior seven-PR plan is historical and superseded for current delivery planning; its evidence is preserved. Core A is private activity authorities/fencing/atomic renewal; Core B is durable deadline/completion compatibility/enforcement; Core C is gated worker/pacing. Preliminary, uncertified ranges are A 280–390, B 240–360, and C 290–390. Preserve PR1's five completed tasks and all pending functional work. No implementation is marked done. Issue 4283 remains blocked.

## Recommended finishing decisions and proposed split (planning only)

- Combined `renew_sofia_owner_activity(...)` with owner/activity TTLs 10..300 inclusive, NULL invalid, defaults 60/30 seconds, 10-second serialized heartbeat, exact G/D/A fencing, and no result after lost fence.
- ECMAScript trim plus explicit SQL whitespace/scalar-to-UTF-16 parity; test emoji, combining marks, NBSP, BOM, and ASCII boundaries.
- Nullable `pace_not_before`, same-transaction wrapper around existing three-argument completion, annotate only newly created intents, DB-time `remaining_ms`, and existing beginDelivery due predicate; no paced-begin bypass.
- Dedicated hashed advisory activity lock, not a security authority. Baseline FK/trigger interaction can lock conversation after batch, so the proposed unified order is not proven; an empirical concurrent test remains required.

**Current approved eight-PR split:** PR1 existing; Core A activity authorities/fencing/atomic renewal; Core B durable deadline/completion compatibility/enforcement; Core C gated worker/pacing; then Telegram, Evolution, Web server, and Web presence unchanged. Preliminary ranges A 280–390, B 240–360, C 290–390 are uncertified. This supersedes the seven-PR plan for current delivery planning without deleting its historical evidence. Approval is delivery-plan-only: no reset/native budget increase, source apply, SQL, tests/runtime execution, authority, commit, publication, or deployment. Issue 4283 still blocks apply.

## Unresolved pre-implementation prerequisites

- Validate exact RPC integration, return shapes, schema mechanism, explicit NULL/range TTL behavior, dblink concurrency, and a lock hierarchy against baseline. Do not claim unified lock safety before proof; revalidate predicates after locks and avoid conversation/batch/outbox inversions.
- Presence proposal: `owner_kind` generation/delivery, `owner_token` G/D, separate `attemptA`; idle requires all owner/source fields null, not merely boolean equivalence. Proposed contracts remain review-only: `begin(batch uuid,G uuid,ttl integer)->jsonb{attempt_id,expires_at}`, `renew(batch uuid,G uuid,A uuid,ttl integer)->same/null`, `adopt(batch uuid,D uuid,ttl integer)->same/null`, `clear(batch uuid,A uuid)->boolean`. Same-D idempotent/new-D rotates; expired owners cannot resurrect; live D requires completed-generation correspondence and cannot overwrite another live batch.
- No observed batch/delivery lease renewal RPC exists. This is a required contract gap; choose combined owner-lease-plus-activity renewal atomically if helpful rather than multiplying RPCs automatically.
- Proposed feature-on `complete_sofia_inbound_batch_paced(uuid,uuid,text,integer)->jsonb` must match verified baseline identity/status semantics plus DB deadline; preserve original live-G replay fencing, no repeated deadline reset, and baseline three-argument completion. `pace_not_before` is nullable and baseline unaffected. Delivery requires deadline null or due. Validate elapsed nonnegative/bounded, return DB-derived remaining duration, use `milliseconds * interval '1 millisecond'`, and resolve JS UTF-16 versus SQL `char_length` consistently.

## Planning stop and human gate

Remaining decisions are TTL null/range, combined renewal shape, shared text-length definition, verified lock hierarchy, and feasibility/placement of durable deadline/completion integration. That integration remains bounded to approved Core B and is not implementation authorization; preserve the approved boundaries and add no automatic slice. Leave all tasks unchecked.

## Remaining tasks

- [ ] **TRIANGULATE:** Cover crash boundaries, stale fences, adoption without `attempted`, and at-most-one final authority.
- [ ] **REFACTOR:** Keep activity distinct from message/outbox authority; run focused validation only after authorization.
- Parent-owned delivery and review actions remain deferred byte-for-byte.

## Structured status consumed

- Native 4283 unchanged; no recovery. No source implementation, SQL execution, authority/reset, or runtime mutation occurred.
- Skill resolution: paths-injected.
