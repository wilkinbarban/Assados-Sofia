# Apply Progress: Telegram Security Hardening

## Status

- Change: `telegram-security-hardening`
- Artifact store: OpenSpec
- Mode: Standard (`strict_tdd: false` in `openspec/config.yaml`)
- Delivery: Single low-risk PR slice approved from `ask-on-risk`
- Progress: 13/13 tasks complete, plus reviewer follow-ups fixed and rechecked

## Completed Tasks

- [x] 1.1 Confirmed `src/app/api/webhooks/telegram/route.ts` reads `TELEGRAM_WEBHOOK_SECRET_TOKEN` before JSON parsing.
- [x] 1.2 Confirmed inbound and outbound Telegram saves use `telegram:${chatId}:${messageId}` through a shared helper.
- [x] 2.1 Added pre-body webhook secret validation with `X-Telegram-Bot-Api-Secret-Token`.
- [x] 2.2 Switched inbound dedupe to the scoped Telegram message key before inserts.
- [x] 2.3 Updated outbound Telegram persistence to store the same scoped key shape.
- [x] 2.4 Added contact ownership guard requiring `message.contact.user_id === message.from.id` before phone updates.
- [x] 2.5 Persisted unproven contact messages as safe non-linking records without phone binding.
- [x] 3.1 Added Vitest coverage for valid, missing, and mismatched webhook secrets; rejected requests use a body that must not be parsed.
- [x] 3.2 Added Vitest coverage for scoped inbound keys and outbound saved Telegram keys.
- [x] 3.3 Added Vitest coverage that foreign and missing contact ownership do not update `clientes.telefone`.
- [x] 3.4 Skipped Playwright because the existing smoke test covers login, not Telegram webhook ingress.
- [x] 4.1 Added route/test coverage notes explaining pre-body secret validation.
- [x] 4.2 Confirmed no schema migration is needed because `mensagens.telegram_mensagem_id` stores the derived scoped key.

## Implementation Notes

- `TELEGRAM_WEBHOOK_SECRET_TOKEN` is read through `obterConfiguracaoSistema()` before `request.json()`.
- If no secret is configured, the route keeps the design's temporary compatibility behavior and logs a warning.
- If a secret is configured, missing or mismatched headers return `401` without parsing the request body.
- `src/lib/telegram/idempotency.ts` centralizes Telegram message key derivation to avoid coupling outbound send code to the route module.
- Unverified contact messages return `contact_unverified` after storing an audit-safe customer message, and they do not trigger phone updates or RAG processing.

## Fresh Review Result

- Result: FAIL before this follow-up.
- Issue: the in-hours missing-phone text branch for a new client or an existing client with `telefone: null` sent `MENSAGEM_BOAS_VINDAS` and the Telegram contact keyboard without first persisting the inbound `mensagens` row with `telegram_mensagem_id: telegramMessageKey`.
- Impact: a duplicate Telegram retry for the same update could repeat the direct welcome/keyboard sends because the idempotency lookup had no persisted inbound row to find.

## Reviewer Follow-up Fixes

- Fixed the missing-phone text branch to resolve/create the conversation with `resolveTelegramConversation()` and persist the safe inbound customer message before sending `MENSAGEM_BOAS_VINDAS` or the contact keyboard.
- Preserved the no-RAG behavior for the missing-phone prompt branch; it returns after direct prompts and does not call `processarRagPipeline()`.
- Extended the Supabase unit mock so `clientes.maybeSingle()` can return an existing client with `telefone: null` or no client at all, instead of always returning a phone.
- Added Vitest coverage for first webhook behavior in the missing-phone/new-client branch: inbound persistence happens and both direct Telegram messages are sent.
- Added Vitest coverage for duplicate retry behavior with the same update: response is `{ ok: true, status: 'duplicate' }`, `verificarHorarioAtendimento()` is not called again, and direct Telegram messages are not sent again.
- Added Vitest coverage for the existing-client/missing-phone text branch with `telefone: null`.

## Positive Owned-Contact Runtime Coverage

- Added Vitest coverage for an owned Telegram contact where `message.contact.user_id === message.from.id`.
- The test asserts `clientes.update()` includes the normalized phone, contact name, and an ISO-like `data_atualizacao` string.
- The test asserts the safe contact display is inserted into `mensagens` with the scoped `telegram_mensagem_id`.
- The test asserts direct confirmation is sent and `processarRagPipeline('conversation-1', safeContactDisplay, 'telegram')` runs while `ia_ativa` is true.

## Verification

| Command | Result |
|---|---|
| `npm run test:unit -- tests/unit/telegram-webhook-security.test.ts` | Passed: 1 file, 12 tests |
| `npm run test:unit` | Passed: 3 files, 17 tests |
| `npm run lint` | Passed |
| `npm run build` | Passed |

## Deviations

None — implementation follows the design and the reviewer follow-up. Playwright was intentionally not run because the existing smoke test does not exercise Telegram webhook ingress.

## Issues

No implementation issues remain after the follow-up fixes and recheck.

Production rollout warning closed: `TELEGRAM_WEBHOOK_SECRET_TOKEN` is configured in `configuracoes_sistema`, Telegram webhook is registered with the matching `secret_token`, and external checks confirm missing/wrong headers return `401` while the valid secret accepts an inert `{}` webhook payload.
