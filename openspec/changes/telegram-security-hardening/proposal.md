# Proposal: Telegram Security Hardening

## Intent
Harden Telegram inbound handling so webhook calls are authenticated, inbound events are deduplicated correctly per chat, and shared phone contacts cannot bind another Telegram user's phone to a client record.

## Scope
### In Scope
- Validate Telegram webhook `X-Telegram-Bot-Api-Secret-Token` before processing updates.
- Replace global `message_id` idempotency with a schema-safe composite/derived key, e.g. `telegram:${chatId}:${messageId}`.
- Accept shared contact phone confirmation only when `message.contact.user_id === message.from.id`.

### Out of Scope
- OTP hardening, failed-attempt limits, atomic OTP RPCs, or WhatsApp OTP send/store changes.
- Outbox, ChannelProvider abstraction, WhatsApp provider policy, feedback, memory, and metrics.
- Telegram UX redesign beyond rejection/ignore behavior needed for security.

## Capabilities
### New Capabilities
None.

### Modified Capabilities
- `integracoes`: Telegram webhook authentication, per-chat inbound idempotency, and own-contact validation.

## Approach
Add a configured Telegram webhook secret and reject mismatched requests before reading or acting on the body. Derive idempotency from Telegram chat plus message id, preserving uniqueness even though `message_id` is only unique inside each chat. For contact messages, link/store the phone only when Telegram proves the contact belongs to the sender; otherwise ignore or record a non-linking message without updating `clientes.telefone`.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/integracoes/spec.md` | Modified | Tighten Telegram security/idempotency requirements. |
| `src/app/api/webhooks/telegram/route.ts` | Modified | Webhook secret check, derived idempotency key, contact ownership guard. |
| `public.mensagens.telegram_mensagem_id` | Modified | Store derived Telegram idempotency key or equivalent schema-safe value. |
| Telegram configuration | Modified | Add/consume webhook secret token setting. |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Misconfigured secret blocks valid Telegram updates | Med | Document required env/config and allow safe rollback by restoring previous webhook handling. |
| Existing duplicate detection data uses old keys | Med | Keep compatibility/migration plan for existing `telegram_mensagem_id` rows. |
| Legitimate shared contacts without `user_id` are not linked | Low | Prefer secure rejection over unsafe account linking. |

## Rollback Plan
Revert route and schema/config changes for this child change only, restore previous idempotency lookup, and remove/disable the webhook secret requirement while keeping existing messages and clients intact.

## Dependencies
- Telegram webhook configured with the same secret token stored by the application.
- Current `integracoes` Telegram requirements and `mensagens.telegram_mensagem_id` persistence.

## Success Criteria
- [ ] Requests without the expected secret token are not processed.
- [ ] Identical `message_id` values from different chats do not collide.
- [ ] Shared contact phone updates occur only for the sender's own Telegram contact.
