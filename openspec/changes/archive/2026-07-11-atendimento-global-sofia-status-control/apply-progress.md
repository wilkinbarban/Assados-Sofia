# Apply Progress: Atendimento Global Sofia Status Control

## Current Slice

- PR slice: PR 4 verification/rollout only
- Delivery strategy: ask-on-risk
- Chain strategy: stacked-to-main
- Mode: Standard (OpenSpec config has `testing.strict_tdd: false`)

## Completed Tasks

### Phase 1: Foundation

- [x] 1.1 Added typed global Sofia config helpers for WhatsApp and Telegram keys.
- [x] 1.2 Added provider-neutral LLM credit status helpers for OpenRouter and direct DeepSeek, detected from the same Sofia runtime key rules, with 30-minute freshness metadata.
- [x] 1.3 Extended atendimento server actions with status read and global toggle actions; updates are restricted to admin/supervisor while vendedor can read.
- [x] 1.4 Added an idempotent Supabase migration/seed for both global Sofia keys with enabled defaults.

### Phase 2: Webhook Gates

- [x] 2.1 Gated Meta WhatsApp webhook on `SOFIA_GLOBAL_WHATSAPP_ENABLED`; global off persists inbound only, and schedule-yellow persists inbound then sends only the configured schedule message.
- [x] 2.2 Gated Evolution webhook on the shared WhatsApp global key; global off preserves inbound persistence and skips schedule/RAG, while schedule-yellow persists inbound before sending the configured schedule message.
- [x] 2.3 Gated Telegram webhook on `SOFIA_GLOBAL_TELEGRAM_ENABLED`; global off persists safe inbound content and skips schedule, direct replies, RAG, and LLM work.
- [x] 2.4 Added targeted webhook unit coverage for global-off override and schedule-yellow priority across Meta WhatsApp, Evolution, and Telegram paths.

### Phase 3: Operator UI

- [x] 3.1 `/atendimento` now fetches initial Sofia channel, schedule, runtime, permission, and credit status server-side and passes it into the inbox container.
- [x] 3.2 Added `SofiaGlobalStatusBar` with separate WhatsApp/Telegram green-yellow-red badges, binary enabled/off toggles, provider/model display, and neutral stale/unknown USD credit handling.
- [x] 3.3 `OperatorInboxContainer` now owns Sofia status state, refreshes it after successful global toggle actions, and blocks vendedor/global unauthorized toggles in the client UI.

### Phase 4: Verification

- [x] 4.1 Added unit tests for boolean config parsing, availability ordering where global off wins before schedule-yellow, LLM credit color thresholds, and stale/unknown credit state handling.
- [x] 4.2 Extended the operator integration script to verify vendedor read-only behavior, admin/supervisor global toggle permissions, independent WhatsApp/Telegram persistence, and safe restoration of global config.
- [x] 4.3 Added rollout notes and updated integration scripts for the global gate/status-bar rollout scenarios across `bandeja_operador`, `horario_atendimento`, `integracoes`, and `whatsapp_webhook`.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `src/lib/config/sistema.ts` | Modified | Exported pure availability derivation alongside boolean parsing so PR4 can unit-test global-off precedence without invoking Server Actions. |
| `src/app/actions/atendimento.ts` | Modified | Uses the shared availability derivation helper; no behavior change. |
| `tests/unit/sofia-global-config.test.ts` | Created | Covers boolean parsing defaults and availability ordering. |
| `tests/unit/llm-credits.test.ts` | Modified | Adds stale refresh coverage that clears current balance and uses neutral color after provider failure. |
| `tests/unit/sofia-global-status-bar.test.tsx` | Modified | Adds stale credit UI coverage so old numeric values are not shown as current. |
| `tests/unit/operator-inbox-sofia-status.test.tsx` | Created | Covers the `OperatorInboxContainer` refresh flow after a successful global toggle action. |
| `scripts/test-operator-integration.js` | Modified | Adds global Sofia role/persistence checks, supervisor coverage, Next cache mock wiring, and safe config restoration. |
| `scripts/mock-next-cache.js` | Created | Provides a no-op `revalidatePath` mock for Node-based Server Action integration scripts. |
| `scripts/test-webhook-integration.js` | Modified | Adds global Sofia config preflight and jiti loading for the TypeScript WhatsApp send utility. |
| `openspec/changes/atendimento-global-sofia-status-control/rollout.md` | Created | Documents rollout preflight, scenario coverage, verification commands, and rollback. |
| `openspec/changes/atendimento-global-sofia-status-control/tasks.md` | Modified | Marked Phase 4 tasks 4.1-4.3 complete. |
| `openspec/changes/atendimento-global-sofia-status-control/apply-progress.md` | Modified | Merged PR1-PR3 progress with PR4 verification/rollout results. |

## Verification

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/sofia-global-config.test.ts tests/unit/llm-credits.test.ts tests/unit/operator-inbox-sofia-status.test.tsx tests/unit/sofia-global-status-bar.test.tsx tests/unit/webhook-global-gates.test.ts` | Passed: 5 files, 40 tests. |
| `npm run test:unit` | Passed: 8 files, 57 tests. |
| `npm run lint` | Passed. |
| `npm run build` | Passed. |
| `node --check scripts/test-operator-integration.js && node --check scripts/test-webhook-integration.js` | Passed syntax checks. |
| `node scripts/test-operator-integration.js` | Passed against the reachable local Supabase stack. |
| `NEXT_PUBLIC_APP_URL=http://localhost:3020 node scripts/test-webhook-integration.js` | Passed against confirmed Asados app after making the script deterministic for host/container day boundaries and keeping external outbound provider sends opt-in with `RUN_WHATSAPP_OUTBOUND_LIVE=true`. |

## Deviations

None — PR4 stayed within verification and rollout support. The only production-code change extracted existing availability derivation into a pure helper for deterministic unit coverage; webhook/UI behavior was not changed.

## Remaining Tasks

- [x] Fix live webhook verification warning by forcing deterministic operational preconditions during the script and restoring them afterward.
- [x] Re-run `NEXT_PUBLIC_APP_URL=http://localhost:3020 node scripts/test-webhook-integration.js` against confirmed Asados app.

## Risks

- The live webhook integration script is environment-sensitive and must be run with explicit `NEXT_PUBLIC_APP_URL`; do not interpret runs against the wrong app on `localhost:3000`.
- Real outbound provider sends remain opt-in via `RUN_WHATSAPP_OUTBOUND_LIVE=true`.
- Local Supabase config keys were restored by the operator integration script after successful role/persistence checks.
