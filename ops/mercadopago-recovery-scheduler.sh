#!/bin/sh
set -eu

: "${MERCADO_PAGO_RECOVERY_SECRET:?MERCADO_PAGO_RECOVERY_SECRET is required}"
: "${MERCADO_PAGO_RECOVERY_URL:=http://web:3000/api/internal/mercadopago/recover}"
: "${MERCADO_PAGO_RECOVERY_INTERVAL_SECONDS:=60}"

case "$MERCADO_PAGO_RECOVERY_INTERVAL_SECONDS" in
  *[!0-9]*|'') echo 'MERCADO_PAGO_RECOVERY_INTERVAL_SECONDS must be a positive integer' >&2; exit 64 ;;
esac
[ "$MERCADO_PAGO_RECOVERY_INTERVAL_SECONDS" -gt 0 ] || { echo 'MERCADO_PAGO_RECOVERY_INTERVAL_SECONDS must be positive' >&2; exit 64; }

while :; do
  if ! curl --fail --silent --show-error --request POST \
    --header "Authorization: Bearer ${MERCADO_PAGO_RECOVERY_SECRET}" \
    --connect-timeout 5 --max-time 55 "$MERCADO_PAGO_RECOVERY_URL"; then
    echo "Mercado Pago recovery invocation failed: $MERCADO_PAGO_RECOVERY_URL" >&2
    exit 1
  fi

  date +%s > /tmp/mercado-pago-recovery-last-success
  [ "${MERCADO_PAGO_RECOVERY_RUN_ONCE:-0}" = '1' ] && exit 0
  sleep "$MERCADO_PAGO_RECOVERY_INTERVAL_SECONDS"
done
