# Design: Telegram Security Hardening

## Technical Approach

Harden `/api/webhooks/telegram` at the boundary before JSON parsing, then keep the current Supabase-backed chat flow with safer identifiers and contact ownership checks. The implementation will use the existing `obterConfiguracaoSistema()` pattern so secrets can live in `public.configuracoes_sistema` or server env, and it will reuse `mensagens.telegram_mensagem_id` for a derived idempotency key to avoid a destructive schema change.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Webhook secret source | Read `TELEGRAM_WEBHOOK_SECRET_TOKEN` via `obterConfiguracaoSistema()`, comparing it with `request.headers.get('x-telegram-bot-api-secret-token')` before `request.json()` | Hardcode env-only; require DB-only | Existing Telegram token lookup already supports DB-first with env fallback. Header validation before body parsing satisfies fail-fast processing. |
| Secret rollout | If a secret is configured, missing/mismatched headers return `401` and do no body processing. If no secret is configured, continue temporarily and log a high-severity warning | Always fail when unset | This avoids breaking production before Telegram `setWebhook` is updated. The secure end state is reached by setting the config/env and Telegram webhook secret in the same rollout window. |
| Idempotency representation | Store derived keys in existing `mensagens.telegram_mensagem_id`: `telegram:${chatId}:${messageId}` for inbound and saved outbound Telegram messages | Add `(telegram_chat_id, message_id)` columns and composite unique index | Existing column is already unique and `VARCHAR(100)`, enough for the derived key. Avoids backfilling ambiguous legacy rows that only have `message_id`. |
| Legacy rows | Do not backfill old raw `telegram_mensagem_id` values; leave them valid historical data | Rewrite all raw ids; add compatibility lookup by raw id | Old rows lack reliable chat scope in the column. Rewriting risks corrupting history; raw fallback can falsely suppress a valid same-`message_id` update from another chat. |
| Shared contact ownership | Only link/update `clientes.telefone` when `message.contact.user_id === message.from.id`; otherwise store a safe non-linking audit message | Trust `phone_number`; accept contacts without `user_id`; silently ignore unproven contacts | Telegram shared contacts can represent someone else. Absence or mismatch is not proof of ownership, so the system must not bind the phone; storing a safe message preserves idempotency and traceability. |

## Data Flow

    Telegram POST
      └─ validate configured secret header
          └─ parse update
              └─ derive telegram:${chat.id}:${message_id}
                  └─ check mensagens.telegram_mensagem_id
                      └─ resolve/create cliente by telegram_chat_id
                          ├─ own contact: update phone, save message, continue RAG
                          ├─ foreign/unproven contact: save/ignore without phone update
                          └─ text: existing conversation/RAG flow

## File Changes

| File | Action | Description |
|---|---|---|
| `src/app/api/webhooks/telegram/route.ts` | Modify | Add pre-body secret validation, derived idempotency key, and contact ownership guard. Use the derived key in all inbound `mensagens` inserts. |
| `src/lib/telegram/send.ts` | Modify | Persist outbound Telegram messages with `telegram:${telegramChatId}:${message_id}` to keep the column consistently scoped. |
| `supabase/migrations/*_telegram_security_hardening.sql` | Optional create | Only insert documentation/default metadata if the team wants a `TELEGRAM_WEBHOOK_SECRET_TOKEN` row. No schema change is required. |
| `tests/unit/telegram/webhook-security.test.ts` | Create | Unit coverage for header validation, scoped idempotency, and contact ownership. |

## Interfaces / Contracts

- Config key: `TELEGRAM_WEBHOOK_SECRET_TOKEN`.
- Telegram setup must call `setWebhook` with the same `secret_token` value.
- Derived id format: `telegram:${String(message.chat.id)}:${String(message.message_id)}`.
- Contact ownership predicate: `Boolean(message.contact?.user_id && message.from?.id && message.contact.user_id === message.from.id)`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit / Vitest | Missing/mismatched secret rejects before body processing when configured | Mock `obterConfiguracaoSistema`, pass a `Request` whose `json()` would fail if called. |
| Unit / Vitest | Same `message_id` from different chats produces different derived keys | Mock Supabase query/insert chain and assert `telegram:chatA:id` vs `telegram:chatB:id`. |
| Unit / Vitest | Foreign or missing contact `user_id` never updates `clientes.telefone` | Mock contact updates and assert no `clientes.update({ telefone })` call. |
| E2E / Playwright | No new browser flow | Run existing Playwright smoke only as regression: `npm run test:e2e`. |
| Verification | Full local confidence | `npm run test:unit`, `npm run lint`, and targeted route tests. |

## Migration / Rollout

No required data migration. Existing raw `telegram_mensagem_id` values remain untouched. Deploy code first with warning-only behavior when the secret is unset, configure `TELEGRAM_WEBHOOK_SECRET_TOKEN`, update Telegram webhook with `secret_token`, then verify requests without the header return `401`. After configuration exists, the route fails closed.

## Open Questions

None. Unproven shared contact messages SHALL be stored as safe non-linking audit messages with the derived Telegram id; they MUST NOT link or update phone ownership.
