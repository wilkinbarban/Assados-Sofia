## Verification Report

**Change**: atendimento-global-sofia-status-control
**Version**: N/A
**Mode**: Standard
**Verified at**: 2026-07-11

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 14 |
| Tasks complete | 14 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ✅ Passed
```text
npm run build
Next.js 16.2.10 (Turbopack)
✓ Compiled successfully in 49s
Finished TypeScript in 48s
✓ Generating static pages using 3 workers (16/16)
```

**Tests / checks**: ✅ Passed
```text
npm run test:unit
Test Files 8 passed (8)
Tests 57 passed (57)

npm run lint
eslint exited 0

node --check scripts/test-operator-integration.js
exited 0

node --check scripts/test-webhook-integration.js
exited 0

node scripts/test-operator-integration.js
All Integration & Security Tests Passed (100% SUCCESS)
Test data cleaned up successfully.

node --check scripts/test-webhook-integration.js
exited 0

NEXT_PUBLIC_APP_URL=http://localhost:3020 node scripts/test-webhook-integration.js
All live webhook integration tests passed against confirmed Asados app.
Outbound provider sends were intentionally skipped because RUN_WHATSAPP_OUTBOUND_LIVE was not set.
```

**Coverage**: ➖ Not available / no coverage threshold configured for this verification run.

**Live webhook integration**: ✅ Passed on rerun against confirmed Asados app. `curl http://localhost:3020/login` returned the Asados Sofía page. `NEXT_PUBLIC_APP_URL=http://localhost:3020 node scripts/test-webhook-integration.js` passed handshake/HMAC/idempotency/filter/status checks, closed-conversation reopen, media ingestion, and local 24-hour window rejection checks. The script temporarily forces global Sofia enabled and open business hours for both host/container day boundaries, restores those rows afterward, and leaves real outbound provider sends opt-in behind `RUN_WHATSAPP_OUTBOUND_LIVE=true`.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| bandeja_operador: Global Sofia controls by channel | Independent control per channel | `scripts/test-operator-integration.js` F2/F3; `tests/unit/sofia-global-status-bar.test.tsx` | ✅ COMPLIANT |
| bandeja_operador: Global Sofia controls by channel | Global off overrides local awake state | `tests/unit/sofia-global-config.test.ts`; `tests/unit/webhook-global-gates.test.ts` | ✅ COMPLIANT |
| bandeja_operador: Channel status bar | Green operational state | `tests/unit/sofia-global-status-bar.test.tsx` | ✅ COMPLIANT |
| bandeja_operador: Channel status bar | Yellow paused state | `tests/unit/sofia-global-status-bar.test.tsx`; `tests/unit/sofia-global-config.test.ts` | ✅ COMPLIANT |
| bandeja_operador: Channel status bar | Red globally off state | `tests/unit/sofia-global-status-bar.test.tsx` | ✅ COMPLIANT |
| bandeja_operador: LLM credits indicator | Credits in green range | `tests/unit/llm-credits.test.ts`; `tests/unit/sofia-global-status-bar.test.tsx` | ✅ COMPLIANT |
| bandeja_operador: LLM credits indicator | Credits in yellow and red ranges | `tests/unit/llm-credits.test.ts` | ✅ COMPLIANT |
| bandeja_operador: LLM credits indicator | Provider unavailable | `tests/unit/llm-credits.test.ts`; `tests/unit/sofia-global-status-bar.test.tsx` | ✅ COMPLIANT |
| horario_atendimento: Yellow state uses schedule message only | Out-of-hours response | `tests/unit/webhook-global-gates.test.ts` | ✅ COMPLIANT |
| horario_atendimento: Scheduled pause is distinct from global off | Different colors for different causes | `tests/unit/sofia-global-config.test.ts`; `tests/unit/sofia-global-status-bar.test.tsx` | ✅ COMPLIANT |
| integracoes: Global channel Sofia settings | Persist independent channel settings | `scripts/test-operator-integration.js` F2/F3 | ✅ COMPLIANT |
| integracoes: Telegram global Sofia gate | Telegram global off blocks processing | `tests/unit/webhook-global-gates.test.ts` | ✅ COMPLIANT |
| integracoes: Telegram global Sofia gate | Telegram awake conversation remains blocked globally | `tests/unit/webhook-global-gates.test.ts` | ✅ COMPLIANT |
| integracoes: Provider-neutral LLM credit status | Refreshable credit status | `tests/unit/llm-credits.test.ts` | ✅ COMPLIANT |
| integracoes: Provider-neutral LLM credit status | Unavailable provider | `tests/unit/llm-credits.test.ts` | ✅ COMPLIANT |
| whatsapp_webhook: Global Sofia gate before channel processing | Global off blocks processing | `tests/unit/webhook-global-gates.test.ts` | ✅ COMPLIANT |
| whatsapp_webhook: Global Sofia gate before channel processing | Yellow state sends only schedule message | `tests/unit/webhook-global-gates.test.ts` | ✅ COMPLIANT |
| whatsapp_webhook: Global priority over per-conversation awake state | Awake conversation remains blocked globally | `tests/unit/webhook-global-gates.test.ts` | ✅ COMPLIANT |

**Compliance summary**: 18/18 scenarios compliant with runtime evidence.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Global config keys and defaults | ✅ Implemented | `src/lib/config/sistema.ts` defines typed keys/default boolean parsing; migration `20260710155007_sofia_global_status.sql` seeds enabled defaults idempotently. |
| Permission model | ✅ Implemented | `src/app/actions/atendimento.ts` allows status read for operator roles and restricts global toggles to `admin`/`supervisor`; operator integration verifies denial for `vendedor`. |
| Webhook gates | ✅ Implemented | WhatsApp, Evolution, and Telegram routes check global channel config before RAG/LLM paths and preserve inbound persistence. |
| Operator UI | ✅ Implemented | `/atendimento` preloads status and `OperatorInboxContainer` refreshes status after toggles; `SofiaGlobalStatusBar` renders per-channel state and credit status. |
| Credit provider abstraction | ✅ Implemented | `src/lib/ai/credits.ts` supports OpenRouter and direct DeepSeek USD balances, stale/unknown states, color mapping, and no CNY conversion. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Store global state in `configuracoes_sistema` | ✅ Yes | Config helpers and migration use `SOFIA_GLOBAL_WHATSAPP_ENABLED` and `SOFIA_GLOBAL_TELEGRAM_ENABLED`. |
| Global OFF before schedule and local awake state | ✅ Yes | Unit coverage verifies global-off precedence; webhook tests verify RAG/schedule skips. |
| Yellow derived from schedule only | ✅ Yes | Availability derivation returns `scheduled_pause` only when enabled and outside business hours. |
| Provider-neutral credit status | ✅ Yes | OpenRouter/DeepSeek helpers return USD/freshness/stale/unknown status without blocking chat. |
| Compact `/atendimento` status bar | ✅ Yes | Status bar is server-preloaded and client-refreshed after successful toggle actions. |

### Issues Found
**CRITICAL**: None.

**WARNING**:
- Real outbound WhatsApp provider sends are not part of the default live webhook verification because the active Evolution URL is Docker-internal from host-run scripts. They can be tested explicitly with `RUN_WHATSAPP_OUTBOUND_LIVE=true`.

**SUGGESTION**:
- Keep `NEXT_PUBLIC_APP_URL` explicit when running live webhook verification so the script never falls back to another local app on `localhost:3000`.

### Verdict
PASS WITH WARNINGS

All tasks are complete, full unit/lint/build checks passed in the previous verification, and live webhook verification passed against the confirmed Asados app. The remaining warning is limited to external outbound provider sends being opt-in, not to webhook ingestion or Sofia global gate behavior.
