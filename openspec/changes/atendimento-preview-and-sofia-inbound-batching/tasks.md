# Implementation Tasks: Deterministic Receipt Preview and Durable Sofia Inbound Batching

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1 ~120; PR 2 ~360; PR 3 ~390; PR 4 ~395; PR 5 ~380; chain total ~1,645 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 (Cadena desactivada) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

## Chain Contract and Delivery Boundaries

- Use a five-PR stacked-to-main chain. Each child targets its immediate predecessor and states its base dependency; keep tests and docs/evidence with the slice they verify. Rebase/retarget any polluted diff before review.
- Each forecast includes additions and deletions and remains below the 400-line budget. No `size:exception` is required or inferred. If a measured slice exceeds 400 lines, stop at that slice and report its smallest cohesive count under `ask-on-risk`; do not compress code/tests to fit.
- Add `apps/web/src/lib/sofia/inbound-batch-gates.ts` with strict (`"true"` only) default-false `SOFIA_INBOUND_BATCH_ENQUEUE_ENABLED` and `SOFIA_INBOUND_BATCH_PROCESSING_ENABLED` gates. Missing, malformed, or unavailable configuration is false.
- PR 2 has no producers; PR 3 has no runner; PR 4 has a closed processing gate and uninstalled scheduler; PR 5 preserves the existing direct-RAG behavior while its enqueue gate is false. These are disabled-by-default, API-compatible boundaries and do not ship enabled customer automation.
- Runtime verification remains `N/A — no authorized environment mutation is permitted` until a separately authorized live rollout after the complete chain is merged and deployed.

## PR 1 — Deterministic Authenticated Receipt Preview (~120; base: main)

- [x] **RED:** update `tests/components/operator/OperatorChatConsoleAttachmentBanner.test.tsx` and the concrete modal test target (`tests/components/comprovantes/ModalVisualizadorComprovante.test.tsx` if needed) with failing cases: proof-plus-attachment resolves only `/api/payment-proofs/{id}/preview`; attachment-only resolves authenticated media only; neither value yields no target; the banner emits no `asados:open-attachment-preview`; and non-OK/fetch/render failure visibly shows the required Portuguese message; record focused Vitest command and exact failing result. <!-- sdd-owner: implementation -->
- [x] **GREEN:** in `apps/web/src/components/operator/OperatorChatConsole.tsx`, add/export `resolveReceiptPreviewTarget` and call `handleAbrirVisualizador` exactly once; retain the inline-card event only for direct `AttachmentCard` interaction; in `apps/web/src/components/comprovantes/ModalVisualizadorComprovante.tsx`, retain authenticated failure handling and normalize the visible copy to `Não foi possível carregar a visualização do comprovante. Tente novamente ou abra o comprovante na conversa.`; run focused tests to green. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** add proof-with-unrelated-attachment and attachment-only PDF/image failure fixtures proving no fallback or second route occurs; run focused Vitest with exact result. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** simplify only test-exposed duplication; run focused tests, `npm run test:unit`, and relevant lint; record runtime `N/A` and the rollback boundary limited to the two component files and their tests. <!-- sdd-owner: implementation -->
- [ ] Commit the complete causal unit, including tests, as `fix(atendimento): make receipt preview deterministic`; verify a clean ~120-line diff and independently reversible rollback. <!-- sdd-owner: implementation -->

## PR 2 — Sofia Batch Storage and Atomic Admission (~360; base: PR 1)

- [x] **RED:** create `supabase/tests/sofia_inbound_batches.sql` (or the repository’s concrete SQL-test target) and failing tests for inaccessible table/RPC access, first admission, duplicate delivery binding, exact chronological membership, one pending batch, concurrent admission, silence reset, 20-second cap, and a state-simulated claimed-batch/new-pending race; record focused local Supabase command and exact failing result. <!-- sdd-owner: implementation -->
- [x] **GREEN:** add a forward-only additive `supabase/migrations/<timestamp>_sofia_inbound_batch_storage.sql` containing the three inaccessible queue tables, RLS/revokes, constraints/indexes, comments, and only `enqueue_sofia_inbound_message`; add the typed admission wrapper in `apps/web/src/lib/sofia/inbound-batches.ts`; grant narrowly to service role with `SECURITY DEFINER`, `search_path=''`, and fully-qualified references; run SQL tests to green. Do not add webhook producers. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** add independent concurrent distinct-arrival and duplicate-versus-new-arrival SQL cases; reset the local database and record exact focused test results. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** preserve the inert contract—no producer calls the RPC and no normal runtime batch rows are created; run focused SQL tests, `npm run supabase:test`, and relevant lint; record runtime `N/A` and forward-only rollback boundary: retain the empty migration/tables with no down migration. <!-- sdd-owner: implementation -->
- [ ] Commit storage, admission wrapper, and their SQL tests as one causal unit (for example, `feat(sofia): add inert inbound batch admission`); confirm base PR 1 and a clean ~360-line diff. <!-- sdd-owner: implementation -->

## PR 3 — Fenced Processing and Response-Intent Contract (~390; base: PR 2)

- [x] **RED:** extend `supabase/tests/sofia_inbound_batches.sql` with failing `SKIP LOCKED` contention, lease fencing/expiry, terminal exclusion, cancel/fail tokens, completion replay/conflict, one IA message/response intent, and one delivery-attempt-transition cases; add failing Vitest cases for chronological safe prompt formatting and redaction of URLs, storage keys, provider IDs, paths, filenames, and raw binary. <!-- sdd-owner: implementation -->
- [x] **GREEN:** add forward-only `supabase/migrations/<timestamp>_sofia_inbound_batch_processing.sql` with claim/recovery/cancel/fail/complete and response-delivery RPCs; extend `apps/web/src/lib/sofia/inbound-batches.ts` with typed claim/result validators and safe formatter. Preserve at-most-one durable intent and at-most-one provider-attempt transition; run focused SQL/Vitest tests to green. Do not create a runner or scheduler. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** prove expired lease behavior differs correctly with and without response intent, and prove response binding conflicts fail closed; run focused SQL and formatter tests with exact results. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** preserve inert runtime behavior even for manually inserted service-role rows because no runner exists; run focused tests, `npm run supabase:test`, `npm run test:unit`, and lint; record runtime `N/A` and rollback boundary: retain migration/rows, reverting only formatter code if necessary. <!-- sdd-owner: implementation -->
- [ ] Commit fenced database contract, formatter, and tests as one causal unit (for example, `feat(sofia): fence batch response intents`); confirm base PR 2 and a clean ~390-line diff. <!-- sdd-owner: implementation -->

## PR 4 — Disabled Worker and Maintenance Capability (~395; base: PR 3)

- [x] **RED:** add failing tests for `apps/web/src/lib/sofia/inbound-batch-gates.ts` strict default-closed parsing; add focused worker tests for Telegram and WhatsApp eligibility cancellation, generation failure, response-intent completion, and exactly one adapter attempt; add route authorization/closed-gate zero-claim tests and scheduler interval validation tests. <!-- sdd-owner: implementation -->
- [x] **GREEN:** refactor `apps/web/src/lib/ai/openrouter.ts` to expose batch-only generation without independent persistence/send; implement worker orchestration in `apps/web/src/lib/sofia/inbound-batches.ts`; add `apps/web/src/app/api/internal/sofia/maintenance/route.ts`, `ops/sofia-batch-maintenance-scheduler.sh`, and configuration template using the dedicated secret, 1–60 interval defaulting to five seconds, max 20 claims, no-store aggregate counts, and safe structured tokens. Keep processing gate false and do not install/wire the scheduler. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** test missing/malformed gate values, a mistaken authenticated maintenance invocation while closed, all listed eligibility cancellation gates, pre-attempt lease recovery, and provider failure recorded without automatic retry; run focused tests with exact results. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** preserve existing direct webhook RAG calls and the closed processing gate; run focused tests, `npm run test:unit`, `npm run supabase:test`, and lint; record runtime `N/A` and rollback boundary: remove route/script/worker only, leaving queue rows inert because no producer exists. <!-- sdd-owner: implementation -->
- [ ] Commit gate module, worker, route/script capability, and their tests as one causal unit (for example, `feat(sofia): add disabled batch maintenance worker`); confirm base PR 3 and a clean ~395-line diff. <!-- sdd-owner: implementation -->

## PR 5 — Default-Closed Telegram and Evolution Producers (~380; base: PR 4)

- [x] **RED:** add failing focused tests for `apps/web/src/app/api/webhooks/telegram/route.ts` and `apps/web/src/app/api/webhooks/evolution/route.ts`: gate-off preserves direct RAG and immediate canonical intake/dedupe/persistence; gate-on enqueues one transactional member and skips direct RAG; duplicate delivery, proof admission, opt-out, catalog/contact, and interactive branches retain current behavior. <!-- sdd-owner: implementation -->
- [x] **GREEN:** update only eligible ordinary final direct-RAG dispatches in both webhook routes to consult the strict enqueue gate and use transactional enqueue when true; retain direct RAG when false, preserve existing channel-specific canonical payment-proof admission/dedupe/policy ordering, and do not enable either gate. Run focused webhook tests to green. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** add duplicate channel-delivery and payment-proof fixtures under both gate values, proving no duplicate canonical intake/message/membership or separate response; run named Telegram/Evolution tests with exact results. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** run focused webhook tests, `npm run test:unit`, `npm run supabase:test`, and lint; record runtime `N/A` and rollback boundary: set/retain enqueue false, then revert only the two webhook integrations while retaining audit records. <!-- sdd-owner: implementation -->
- [ ] Commit both gated producers and their tests as one causal unit (for example, `feat(sofia): add default-closed batch producers`); confirm base PR 4 and a clean ~380-line diff. <!-- sdd-owner: implementation -->

## Parent-Controlled Issue, Review, and Rollout Gates

- [ ] Verify an existing target-host issue or obtain direct human instruction to create one through the repository YAML Issue Form; perform required duplicate search and capability/approval checks before any issue mutation, and do not infer protected-label authority. <!-- sdd-owner: parent -->
- [ ] Start or reuse bounded review for each PR in order; each PR description must name its immediate base/dependency, current stack position, disabled/default runtime state, focused evidence, rollback boundary, and follow-up PR. <!-- sdd-owner: parent -->
- [ ] After all five PRs are merged and deployed, obtain explicit operational authorization before provisioning the maintenance secret/URL or installing the five-second scheduler; verify both gates are closed and maintenance returns zero claims before any enablement. <!-- sdd-owner: parent -->
- [ ] Require explicit authorization for controlled rollout: enable processing first while enqueue remains false, then enable Telegram enqueue and observe metrics/tokens, then authorize Evolution only after healthy Telegram operation; do not mutate any environment during implementation. <!-- sdd-owner: parent -->
- [ ] For any rollout anomaly, set enqueue false first, then processing false, stop the scheduler, assess pending/processing records, and retain batches, memberships, intents, messages, canonical intake, dedupe, opt-out/handoff, and financial records without destructive down migration. <!-- sdd-owner: parent -->
