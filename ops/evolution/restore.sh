#!/bin/sh
set -eu

if [ "$#" -ne 2 ] || [ "$1" != "--confirm" ]; then
  echo "Usage: $0 --confirm <backup-directory>" >&2
  exit 2
fi

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
backup="$(CDPATH= cd -- "$2" && pwd)"
(cd "$backup" && sha256sum -c SHA256SUMS)

cd "$root"
restart_services() {
  docker compose up -d evolution-db evolution-redis evolution-api >/dev/null
}
trap restart_services EXIT

docker compose stop evolution-api >/dev/null
docker compose exec -T evolution-db pg_restore -U evolution --dbname=evolution \
  --clean --if-exists --exit-on-error < "$backup/database.dump"
docker compose stop evolution-redis >/dev/null

docker run --rm \
  --volumes-from asados-evolution-redis \
  -v "$backup:/backup:ro" \
  alpine:3.22 sh -eu -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /data -xzf /backup/redis.tar.gz'
docker run --rm \
  --volumes-from asados-evolution-api \
  -v "$backup:/backup:ro" \
  alpine:3.22 sh -eu -c 'find /evolution/store -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /evolution/store -xzf /backup/store.tar.gz'

restart_services
trap - EXIT
echo "Evolution restore completed from $backup"
