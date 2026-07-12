# Tasks: Telegram Security Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180-260 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | N/A — single PR |

Decision needed before apply: No — low-risk single PR apply approved
Chained PRs recommended: No
Chain strategy: N/A — single PR
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Harden Telegram boundary handling | PR 1 | Base on current branch; keep auth, idempotency, and contact guard together |
| 2 | Add security regression coverage | PR 1 | Keep unit tests with the behavior they verify; include E2E smoke only if it already covers this route |

## Phase 1: Foundation / Contract Updates

- [x] 1.1 Confirm webhook config access in `src/app/api/webhooks/telegram/route.ts` can read `TELEGRAM_WEBHOOK_SECRET_TOKEN` before JSON parsing.
- [x] 1.2 Confirm id derivation points in `src/app/api/webhooks/telegram/route.ts` and `src/lib/telegram/send.ts` use `telegram:${chatId}:${messageId}` for inbound and outbound saves.

## Phase 2: Core Security Behavior

- [x] 2.1 Add pre-body webhook secret validation in `src/app/api/webhooks/telegram/route.ts` using `X-Telegram-Bot-Api-Secret-Token` and `TELEGRAM_WEBHOOK_SECRET_TOKEN`.
- [x] 2.2 Switch inbound Telegram dedupe in `src/app/api/webhooks/telegram/route.ts` to `telegram:${chatId}:${messageId}` before any message insert.
- [x] 2.3 Update outbound Telegram message persistence in `src/lib/telegram/send.ts` to store the same derived key shape.
- [x] 2.4 Guard contact linking in `src/app/api/webhooks/telegram/route.ts` so only `message.contact.user_id === message.from.id` can update `clientes.telefone`.
- [x] 2.5 Persist unproven contact messages as safe non-linking records without phone binding or ownership inference.

## Phase 3: Testing / Verification

- [x] 3.1 Add Vitest coverage for valid, missing, and mismatched Telegram secret headers with a request body that must not be parsed on failure.
- [x] 3.2 Add Vitest coverage that equal `message_id` values in different chats produce distinct `telegram:${chatId}:${messageId}` keys.
- [x] 3.3 Add Vitest coverage that foreign or missing contact ownership does not call `clientes.update({ telefone })`.
- [x] 3.4 Run existing E2E smoke only if it already exercises Telegram webhook ingress; otherwise keep verification at unit level for this change.

## Phase 4: Cleanup / Rollout Notes

- [x] 4.1 Update any inline route comments or test fixtures to explain why secret validation happens before `request.json()`.
- [x] 4.2 Confirm no schema migration is needed because `mensagens.telegram_mensagem_id` already stores the derived scoped key.
