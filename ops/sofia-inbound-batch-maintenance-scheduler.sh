#!/bin/sh
set -eu

: "${SOFIA_BATCH_MAINTENANCE_SECRET:?SOFIA_BATCH_MAINTENANCE_SECRET is required}"
: "${SOFIA_BATCH_MAINTENANCE_URL:=http://web:3000/api/internal/sofia/inbound-batches/maintenance}"
: "${SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS:=60}"

case "$SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS" in
  *[!0-9]*|'') echo 'SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS must be a positive integer' >&2; exit 64 ;;
esac
[ "$SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS" -gt 0 ] || {
  echo 'SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS must be positive' >&2
  exit 64
}
[ "$SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS" -le 715827882 ] || {
  echo 'SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS is too large' >&2
  exit 64
}

while :; do
  if curl --fail --silent --show-error --request POST \
    --header "Authorization: Bearer ${SOFIA_BATCH_MAINTENANCE_SECRET}" \
    --connect-timeout 5 --max-time 55 "$SOFIA_BATCH_MAINTENANCE_URL"; then
    date +%s > /tmp/sofia-inbound-batch-maintenance-last-success
  fi
  sleep "$SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS"
done
