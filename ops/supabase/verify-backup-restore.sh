#!/bin/sh
set -eu

usage() {
  printf 'Usage: %s [--email <exact-email>]... [--phone <exact-phone>]... <backup-directory>\n' "$0" >&2
  exit 2
}

[ "$#" -ge 1 ] || usage

emails_file="$(mktemp)"
phones_file="$(mktemp)"
backup_argument=''
database="asados_restore_drill_$(date -u +%Y%m%d%H%M%S)_$$"
here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
created=false

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  rm -f -- "$emails_file" "$phones_file"
  if [ "$created" = true ]; then
    cd "$here"
    docker compose exec -T db dropdb -U supabase_admin --if-exists "$database" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --email)
      [ "$#" -ge 2 ] || usage
      printf '%s\n' "$2" >> "$emails_file"
      shift 2
      ;;
    --phone)
      [ "$#" -ge 2 ] || usage
      printf '%s\n' "$2" >> "$phones_file"
      shift 2
      ;;
    --*) usage ;;
    *)
      [ -z "$backup_argument" ] || usage
      backup_argument=$1
      shift
      ;;
  esac
done

[ -n "$backup_argument" ] || usage
[ -d "$backup_argument" ] || { printf 'Backup directory does not exist: %s\n' "$backup_argument" >&2; exit 1; }
backup="$(CDPATH= cd -- "$backup_argument" && pwd)"
[ -f "$backup/.complete" ] || { printf 'Backup is not marked complete: %s\n' "$backup" >&2; exit 1; }
(cd "$backup" && sha256sum -c SHA256SUMS >/dev/null)

cd "$here"
docker compose exec -T db createdb -U supabase_admin --template=template0 "$database"
created=true
# The full logical archive must create its extensions, schemas, and dependencies
# inside this empty disposable database without modifying the active database.
docker compose exec -T db pg_restore -U supabase_admin --dbname="$database" \
  --exit-on-error < "$backup/database.dump"

verify_selector() {
  kind=$1
  selector=$2
  case "$kind" in
    email) query="select count(*) from auth.users where lower(email) = lower(:'selector');" ;;
    phone) query="select count(*) from public.clientes where telefone = :'selector';" ;;
    *) return 2 ;;
  esac
  count="$(printf '%s\n' "$query" | docker compose exec -T db psql -U supabase_admin \
    --dbname="$database" -v ON_ERROR_STOP=1 -v selector="$selector" -At)"
  if [ "$count" != 1 ]; then
    printf 'Expected exactly one %s identity for %s, found %s\n' "$kind" "$selector" "$count" >&2
    return 1
  fi
  printf 'Verified %s identity: %s\n' "$kind" "$selector"
}

while IFS= read -r email; do
  [ -n "$email" ] && verify_selector email "$email"
done < "$emails_file"
while IFS= read -r phone; do
  [ -n "$phone" ] && verify_selector phone "$phone"
done < "$phones_file"

printf 'Disposable restore drill passed for %s\n' "$backup"
