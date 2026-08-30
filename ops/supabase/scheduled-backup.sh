#!/bin/sh
set -eu

here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
backup_root="${ASADOS_SUPABASE_BACKUP_ROOT:-$here/../backups}"
retention_days="${ASADOS_SUPABASE_BACKUP_RETENTION_DAYS:-14}"
lock_file="$backup_root/.backup.lock"

case "$retention_days" in
  ''|*[!0-9]*)
    printf 'ASADOS_SUPABASE_BACKUP_RETENTION_DAYS must be a non-negative integer\n' >&2
    exit 1
    ;;
esac

mkdir -p "$backup_root"
chmod go-rwx "$backup_root"

# The lock descriptor stays open for the complete backup and retention pass.
exec 9>"$lock_file"
if ! flock -n 9; then
  printf 'Another Supabase backup is already running; skipping this invocation\n' >&2
  exit 0
fi

"$here/backup.sh" "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)"

# Delete only atomically published backups. Partial/unknown directories are retained
# for operator inspection and can never be mistaken for successful recovery points.
find "$backup_root" -mindepth 2 -maxdepth 2 -type f -name .complete \
  -mtime "+$retention_days" -print | while IFS= read -r marker; do
    completed_backup="${marker%/.complete}"
    case "$completed_backup" in
      "$backup_root"/*) rm -rf -- "$completed_backup" ;;
      *) printf 'Refusing unsafe retention path: %s\n' "$completed_backup" >&2; exit 1 ;;
    esac
  done
