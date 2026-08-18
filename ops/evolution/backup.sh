#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
destination="${1:-$root/ops/backups/evolution/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$destination"
destination="$(CDPATH= cd -- "$destination" && pwd)"

cd "$root"
restart_api() {
  docker compose up -d evolution-api >/dev/null
}
trap restart_api EXIT

docker compose stop evolution-api >/dev/null
docker compose exec -T evolution-db pg_dump -U evolution --format=custom evolution > "$destination/database.dump"
docker compose exec -T evolution-redis redis-cli SAVE >/dev/null

docker run --rm \
  --volumes-from asados-evolution-redis:ro \
  -v "$destination:/backup" \
  alpine:3.22 tar -C /data -czf /backup/redis.tar.gz .
docker run --rm \
  --volumes-from asados-evolution-api:ro \
  -v "$destination:/backup" \
  alpine:3.22 tar -C /evolution/store -czf /backup/store.tar.gz .

(cd "$destination" && sha256sum database.dump redis.tar.gz store.tar.gz > SHA256SUMS)
chmod -R go-rwx "$destination"
restart_api
trap - EXIT
echo "$destination"
