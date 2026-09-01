#!/bin/sh
set -eu

interval=${PAYMENT_PROOF_MAINTENANCE_INTERVAL_SECONDS:-60}
case "$interval" in
  ''|*[!0-9]*) interval=60 ;;
  *)
    # Keep later healthcheck arithmetic within a signed 32-bit shell integer.
    if [ "$interval" -lt 1 ] || [ "$interval" -gt 715827882 ]; then
      interval=60
    fi
    ;;
esac

while :; do
  if curl -fsS -X POST -H "Authorization: Bearer $PAYMENT_PROOF_MAINTENANCE_SECRET" "$PAYMENT_PROOF_MAINTENANCE_URL" >/dev/null; then
    date +%s >/tmp/payment-proof-maintenance-last-success
  fi
  if curl -fsS -X POST -H "Authorization: Bearer $PAYMENT_PROOF_METRICS_SECRET" "$PAYMENT_PROOF_ALERT_URL" >/dev/null; then
    date +%s >/tmp/payment-proof-alert-last-success
  fi
  sleep "$interval"
done
