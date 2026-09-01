#!/bin/sh
set -eu

here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
destination="${1:-$here/../backups/$(date -u +%Y%m%dT%H%M%SZ)}"
parent="$(dirname "$destination")"
name="$(basename "$destination")"

mkdir -p "$parent"
parent="$(CDPATH= cd -- "$parent" && pwd)"
destination="$parent/$name"
work_directory="$parent/.partial.$name.$$"

if [ -e "$destination" ] || [ -e "$work_directory" ]; then
  printf 'Backup destination already exists: %s\n' "$destination" >&2
  exit 1
fi

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ -d "$work_directory" ]; then
    rm -rf -- "$work_directory"
  fi
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

mkdir -m 700 "$work_directory"
cd "$here"

docker compose exec -T db pg_dump -U supabase_admin --format=custom \
  postgres > "$work_directory/database.dump"
docker compose exec -T db pg_dumpall -U supabase_admin --globals-only \
  > "$work_directory/globals.sql"

# Validate the custom archive with the matching PostgreSQL tool in the DB image.
docker compose exec -T db pg_restore --list \
  < "$work_directory/database.dump" > /dev/null

if [ ! -d volumes/storage ]; then
  printf 'Supabase Storage volume is missing: %s\n' "$here/volumes/storage" >&2
  exit 1
fi
tar -C volumes -czf "$work_directory/storage.tar.gz" storage

(
  cd "$work_directory"
  sha256sum database.dump globals.sql storage.tar.gz > SHA256SUMS
  sha256sum -c SHA256SUMS > /dev/null
  : > .complete
)
chmod -R go-rwx "$work_directory"
mv "$work_directory" "$destination"
trap - EXIT HUP INT TERM
printf '%s\n' "$destination"
