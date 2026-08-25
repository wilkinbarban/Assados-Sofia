# Evolution API interactive catalog compatibility

## Version policy

- Production must use a pinned stable Evolution API release whose installed
  Swagger exposes `POST /message/sendCarousel/{instance}`.
- As of 2026-08-20, the newest stable public release is `2.3.7` and it does
  not satisfy this requirement.
- `2.4.0-rc2` exposes `sendCarousel`, `sendButtons`, and `sendList`, but it is
  a prerelease and is allowed only in the compatibility laboratory.
- Keep `WHATSAPP_INTERACTIVE_CAROUSEL_ENABLED=false` in production until every
  required check below passes against the exact pinned image.

## Laboratory startup

```bash
EVOLUTION_API_VERSION=2.4.0-rc2 docker compose up -d evolution-api
```

Do not reuse a production WhatsApp instance for this validation.

## Non-emitting contract probe

The probe only reads the OpenAPI document. It never calls a message endpoint:

```bash
EVOLUTION_API_URL=http://127.0.0.1:8086 \
EVOLUTION_API_KEY=redacted \
node scripts/verify-evolution-interactive-contract.mjs
```

Expected endpoints:

- `/message/sendCarousel/{instance}`
- `/message/sendButtons/{instance}`
- `/message/sendList/{instance}`
- `/message/sendText/{instance}`

## Manual delivery matrix

Record the exact image digest, instance integration, test number, timestamp,
message ID, click webhook ID, and evidence link for every row.

| Client | Carousel | Image | Reply | Details | Webhook | Fallback |
|---|---:|---:|---:|---:|---:|---:|
| Android | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| iOS | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| WhatsApp Web | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Desktop | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

Also validate:

- new and existing chats;
- saved and unsaved destination numbers;
- instance reconnect and Evolution restart;
- unavailable product image;
- each forced degradation step: carousel → buttons → list → text;
- opt-in, proactive rate limit, duplicate suppression, scheduled pause, and
  circuit-breaker behavior.

Only after the complete matrix passes may production pin the verified stable
image and enable the carousel flag.
