# Production container verification

Use this runbook to prove the local production topology before deployment. Run commands from the repository root and never append `-v` to a restart used for persistence verification.

## Build and start

```bash
docker compose --progress=plain build --pull --no-cache web
docker compose -f ops/supabase/docker-compose.yml pull
docker compose pull
docker compose -f ops/supabase/docker-compose.yml up -d
docker compose up -d
```

## Health gates

```bash
ops/supabase/verify.sh
npm run integration:verify
curl --fail --silent http://127.0.0.1:3020/api/health/live
curl --fail --silent http://127.0.0.1:3020/api/health/ready
```

The Supabase verifier requires the exact nine-container topology to be healthy. Readiness fails closed if Auth or Evolution is unavailable.

## Persistence gate

Create unique markers in Supabase PostgreSQL, Supabase Storage, Evolution PostgreSQL, Evolution Redis, and `/evolution/store`. Recreate both projects with `docker compose down` and `docker compose up -d`, verify every marker exactly, then remove the markers. Do not use `down -v`.

## Test gates

```bash
npm run test:unit -- --maxWorkers=1
npm run lint
npm audit
npm run test:e2e:production
git diff --check
```

Run the five files in `supabase/tests/` with pgTAP inside `asados-supabase-db`. The production E2E command uses the pinned official Playwright container and requires access to the Docker socket for fixture cleanup.

## Warning gate

After a fresh start, inspect logs from both Compose projects. Treat any unexpected `warn`, `error`, `fatal`, `panic`, `deprecated`, or update-notifier output as a failed gate. Known upstream messages may be filtered only by an exact match with a documented remediation; broad filters are forbidden.

Redis also requires the host setting below, installed by the deployment operator and applied before the container starts:

```text
vm.overcommit_memory = 1
```

This repository's host stores it in `/etc/sysctl.d/99-asados-redis.conf`.
