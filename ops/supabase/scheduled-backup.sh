#!/bin/sh
set -eu

here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
backup_root="${ASADOS_SUPABASE_BACKUP_ROOT:-$here/../backups}"
retention_days="${ASADOS_SUPABASE_BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$backup_root"
"$here/backup.sh" "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)"
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime "+$retention_days" -exec rm -rf -- {} +
