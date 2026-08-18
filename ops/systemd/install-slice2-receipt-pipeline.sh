#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
readonly APPROVED_REF=mhoqwjatrendnhfnwewv
readonly APPROVAL_ARGUMENT=--approve-staging-ref=mhoqwjatrendnhfnwewv
readonly SYSTEMD_UNITS=(
  asados-slice2-receipt.service
  asados-slice2-manifest.service
  asados-slice2-retention.service
  asados-slice2-manifest.timer
  asados-slice2-retention.timer
)
[[ "${1:-}" == "$APPROVAL_ARGUMENT" && $# -eq 1 ]] || { printf '%s\n' 'staging approval required' >&2; exit 1; }
[[ "$(id -u)" -eq 0 ]] || exec sudo -- "$0" "$@"
source_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"; source_root="$(cd "$source_directory/../.." && pwd)"; installed_root=/usr/local/lib/asados/repo
install -d -o root -g root -m 0700 "$installed_root" /var/lib/asados/slice2/{receipts,locks,state}
for path in ops/systemd/run-slice2-receipt scripts/validate-slice2-hosted-receipt.sh supabase/migrations/{20260703210000_epica1_auth_otp.sql,20260704140000_epica2_client_chat.sql,20260704170000_epica6_crm_sales.sql,20260705010000_epica8_dashboard_improvements.sql,20260708000000_estoque_horarios.sql,20260708160000_produto_imagens_public.sql,20260711144706_admin_products_inventory_hardening.sql,20260712164546_admin_products_authenticated_inventory_rpc.sql,20260713110019_admin_product_image_lifecycle.sql} apps/web/src/app/actions/estoque.ts tests/unit/slice2-hosted-receipt-harness.test.ts; do install -D -o root -g root -m 0700 "$source_root/$path" "$installed_root/$path"; done
bash -n "$source_directory/prune-slice2-receipts" && install -o root -g root -m 0700 "$source_directory/prune-slice2-receipts" /usr/local/lib/asados/prune-slice2-receipts
for file in "${SYSTEMD_UNITS[@]}"; do systemd-analyze verify "$source_directory/$file" && install -o root -g root -m 0644 "$source_directory/$file" "/etc/systemd/system/$file"; done
install -d -o root -g root -m 0755 /usr/local/share/doc/asados; install -o root -g root -m 0644 "$source_directory/slice2-receipt-pipeline.md" /usr/local/share/doc/asados/
[[ -f /etc/credstore.encrypted/asados.slice2.staging-secret.cred && -f /etc/credstore.encrypted/asados.slice2.staging-publishable.cred ]] || { printf '%s\n' 'missing encrypted staging credentials' >&2; exit 1; }
systemctl daemon-reload
systemd-analyze verify "${SYSTEMD_UNITS[@]/#//etc/systemd/system/}"
systemd-analyze security --offline=yes /etc/systemd/system/asados-slice2-receipt.service >/dev/null
