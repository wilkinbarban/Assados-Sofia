#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo -- "$0"
fi

source_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_unit="$source_directory/asados-slice2-staging-publishable-bootstrap.service"
source_provisioner="$source_directory/provision-slice2-staging-publishable"
installed_unit=/etc/systemd/system/asados-slice2-staging-publishable-bootstrap.service
installed_provisioner=/usr/local/lib/asados/provision-slice2-staging-publishable
installed_documentation=/usr/local/share/doc/asados/slice2-staging-publishable-bootstrap.md
host_key=/var/lib/systemd/credential.secret

bash -n "$source_provisioner"
install -d -o root -g root -m 0700 /usr/local/lib/asados
install -o root -g root -m 0700 "$source_provisioner" "$installed_provisioner"
systemd-analyze verify "$source_unit"

install -d -o root -g root -m 0755 /usr/local/share/doc/asados
install -o root -g root -m 0644 "$source_directory/slice2-staging-publishable-bootstrap.md" "$installed_documentation"
install -o root -g root -m 0644 "$source_unit" "$installed_unit"

[[ "$(stat -c '%U:%G:%a' "$installed_provisioner")" == root:root:700 ]]
[[ "$(stat -c '%U:%G:%a' "$installed_unit")" == root:root:644 ]]
[[ "$(stat -c '%U:%G:%a' "$installed_documentation")" == root:root:644 ]]

systemctl daemon-reload
systemd-analyze verify "$installed_unit"

if [[ ! -e "$host_key" ]]; then
  systemd-creds setup
fi
[[ -f "$host_key" ]]

printf '%s\n' 'Existing credential remains active until a successful hidden prompt encrypts and publishes its replacement.' >&2
systemctl start asados-slice2-staging-publishable-bootstrap.service
