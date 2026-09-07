#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
compose_file="$root/ops/supabase/docker-compose.yml"
container="asados-supabase-db"
workspace="/tmp/asados-supabase-tests-$$"
database=
test_number=0
postgres_password="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$root/ops/supabase/.env" | head -n 1)"
[ -n "$postgres_password" ] || { echo "Missing POSTGRES_PASSWORD in ops/supabase/.env" >&2; exit 1; }
# The lifecycle harness opens dblink sessions. Its authenticated connection
# string is provided only to the disposable psql session and never echoed.
postgres_password_uri="$(node -p 'encodeURIComponent(process.argv[1])' "$postgres_password")"

cleanup_database() {
  [ -z "$database" ] || docker exec "$container" dropdb -U supabase_admin --if-exists --force "$database" >/dev/null 2>&1 || true
  database=
}

cleanup() {
  cleanup_database
  docker exec "$container" rm -rf "$workspace" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'cleanup; trap - EXIT; exit 129' HUP
trap 'cleanup; trap - EXIT; exit 130' INT
trap 'cleanup; trap - EXIT; exit 143' TERM

[ -f "$compose_file" ] || {
  echo "Missing self-hosted Supabase compose file: $compose_file" >&2
  exit 1
}

docker compose -f "$compose_file" config --quiet
docker compose -f "$compose_file" ps --status running db | grep -q . || {
  echo "Self-hosted Supabase db service is not running. Start it with: docker compose -f ops/supabase/docker-compose.yml up -d" >&2
  exit 1
}

docker inspect --format '{{.State.Running}}' "$container" | grep -qx true || {
  echo "Expected self-hosted database container is not running: $container" >&2
  exit 1
}

docker exec "$container" psql -U supabase_admin -d postgres -Atqc "select 1 from pg_extension where extname = 'pgtap'" | grep -qx 1 || {
  echo "pgTAP extension is unavailable in $container" >&2
  exit 1
}

# Copy the harness workspace once. Each test gets a fresh database because a
# harness may import forward migrations that are intentionally non-reentrant.
docker exec "$container" mkdir -p "$workspace"
docker cp "$root/supabase/." "$container:$workspace"

run_test() {
  test_file="$1"
  test_number=$((test_number + 1))
  database="asados_sql_test_$$_$test_number"
  test_name="$(basename "$test_file")"
  runner="$workspace/run-$test_name"
  conninfo="postgresql://supabase_admin:${postgres_password_uri}@127.0.0.1:5432/${database}"

  # Supabase services keep connections to postgres open, so it cannot be used
  # as a template. Restore a clean clone for this test only. Realtime is omitted
  # because its locked runtime setting cannot be restored by the application role.
  docker exec "$container" createdb -U postgres "$database"
  docker exec "$container" sh -c "pg_dump -U supabase_admin --format=custom --exclude-schema=realtime postgres | pg_restore -U supabase_admin -d '$database' --exit-on-error"
  printf '\\ir tests/%s\n' "$test_name" \
    | docker exec -i "$container" sh -c "cat > '$runner'"
  echo "Running isolated self-hosted SQL test: $test_name"
  docker compose -f "$compose_file" exec -T db \
    psql -qX -U supabase_admin -d "$database" -v ON_ERROR_STOP=1 \
      -v "runtime_dblink_conninfo=$conninfo" \
      -f "$runner"
  cleanup_database
}

if [ "$#" -eq 0 ]; then
  set -- "$root"/supabase/tests/*.sql
fi

for test_file in "$@"; do
  case "$test_file" in
    /*) ;;
    *) test_file="$root/$test_file" ;;
  esac
  case "$test_file" in
    "$root"/supabase/tests/*.sql) ;;
    *) echo "Only files under supabase/tests may be run: $test_file" >&2; exit 2 ;;
  esac
  run_test "$test_file"
done
