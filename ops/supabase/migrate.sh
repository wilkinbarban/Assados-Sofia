#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$here"

docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

for migration in "$root"/supabase/migrations/*.sql; do
  filename="$(basename "$migration" .sql)"
  version="${filename%%_*}"
  name="${filename#*_}"
  applied="$(docker compose exec -T db psql -U postgres -d postgres -Atc "select 1 from supabase_migrations.schema_migrations where version = '$version'")"
  [ "$applied" = "1" ] && continue
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$migration"
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "insert into supabase_migrations.schema_migrations(version, name, statements) values ('$version', '$name', '{}')"
done

docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$root/supabase/seed.sql"
echo "Application migrations and seed applied"
