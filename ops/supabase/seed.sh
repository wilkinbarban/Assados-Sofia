#!/bin/sh
set -eu

required_argument='--i-understand-this-replaces-data'
required_confirmation='YES_REPLACE_DATA'

if [ "${1:-}" != "$required_argument" ] || \
   [ "${ASADOS_ALLOW_DESTRUCTIVE_RESEED:-}" != "$required_confirmation" ]; then
  cat >&2 <<USAGE
Refusing destructive reseed.
This command replaces application data and is never part of migrate.sh.
To proceed explicitly:
  ASADOS_ALLOW_DESTRUCTIVE_RESEED=$required_confirmation $0 $required_argument
USAGE
  exit 64
fi

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$here"
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "$root/supabase/seed.sql"
echo "Destructive application seed applied"
