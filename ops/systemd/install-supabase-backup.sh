#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

[[ "${1:-}" == "--install" && $# -eq 1 ]] || {
  printf '%s\n' 'Usage: install-supabase-backup.sh --install' >&2
  exit 2
}
[[ "$(id -u)" -eq 0 ]] || exec sudo -- "$0" "$@"

source_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$source_directory/../.." && pwd -P)"
source_service="$source_directory/asados-supabase-backup.service"
source_timer="$source_directory/asados-supabase-backup.timer"
installed_service=/etc/systemd/system/asados-supabase-backup.service
installed_timer=/etc/systemd/system/asados-supabase-backup.timer

[[ -x "$repo_root/ops/supabase/scheduled-backup.sh" ]]
[[ -f "$repo_root/ops/supabase/docker-compose.yml" ]]
[[ -f "$repo_root/ops/supabase/.env" ]]
[[ ! -L "$repo_root" && "$repo_root" = /* ]]

generated_service="$(mktemp --suffix=.service)"
trap 'rm -f -- "$generated_service"' EXIT
sed "s|^ExecStart=.*|ExecStart=$repo_root/ops/supabase/scheduled-backup.sh|" \
  "$source_service" > "$generated_service"

grep -Fqx "ExecStart=$repo_root/ops/supabase/scheduled-backup.sh" "$generated_service"
! grep -Eq '(^|/)\.env([[:space:]]|$)' "$generated_service"
systemd-analyze verify "$generated_service" "$source_timer"

install -d -o root -g root -m 0700 /var/backups/asados/supabase
install -o root -g root -m 0644 "$generated_service" "$installed_service"
install -o root -g root -m 0644 "$source_timer" "$installed_timer"
systemctl daemon-reload
systemd-analyze verify "$installed_service" "$installed_timer"

printf '%s\n' 'Installed but not enabled. Run the documented manual smoke before enabling the timer.'
