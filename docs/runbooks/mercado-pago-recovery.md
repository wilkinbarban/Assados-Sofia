# Mercado Pago durable recovery

`mercado-pago-recovery` invokes the private recovery Route Handler every 60 seconds after `web` is healthy. It is an internal Docker-network consumer, not a host cron job. The endpoint rejects requests unless `Authorization` exactly matches `Bearer $MERCADO_PAGO_RECOVERY_SECRET`.

## Startup

1. Generate a high-entropy secret and set `MERCADO_PAGO_RECOVERY_SECRET` in the deployed `.env`.
2. Run `docker compose config --quiet` and then deploy with `docker compose up -d`.
3. Verify `asados-mercado-pago-recovery` is healthy and its logs contain no invocation failures.

A non-2xx response is logged and terminates the worker. Docker restart policy restarts it; this makes a broken recovery route visible instead of silently treating a failed batch as success.

## Rotation

Set the new value in `.env`, then recreate **both** `web` and `mercado-pago-recovery` together: `docker compose up -d --force-recreate web mercado-pago-recovery`. Mixed values intentionally fail closed with HTTP 401 until both containers use the same secret.

## Terminal queue rows

After the fifth failed delivery the row becomes `dead_letter`. `next_attempt_at` remains non-null as the timestamp of that final decision; claim functions reject `dead_letter`, preserving audit data without scheduling another attempt.
