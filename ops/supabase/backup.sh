#!/bin/sh
set -eu

here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
destination="${1:-$here/../backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$destination"
destination="$(CDPATH= cd -- "$destination" && pwd)"

cd "$here"
docker compose exec -T db pg_dump -U supabase_admin --format=custom \
  --schema=public --schema=auth --schema=storage --schema=supabase_migrations \
  postgres > "$destination/database.dump"
docker compose exec -T db pg_dumpall -U supabase_admin --globals-only > "$destination/globals.sql"

if [ -d volumes/storage ]; then
  tar -C volumes -czf "$destination/storage.tar.gz" storage
else
  tar -czf "$destination/storage.tar.gz" --files-from /dev/null
fi

(cd "$destination" && sha256sum database.dump globals.sql storage.tar.gz > SHA256SUMS)
chmod -R go-rwx "$destination"
echo "$destination"
