#!/bin/sh
set -eu

interval=${NOTIFICATION_OUTBOX_MAINTENANCE_INTERVAL_SECONDS:-60}
case "$interval" in
  ''|*[!0-9]*) interval=60 ;;
  *)
    if [ "$interval" -lt 1 ] || [ "$interval" -gt 715827882 ]; then interval=60; fi
    ;;
esac

while :; do
  if curl -fsS -X POST -H "Authorization: Bearer $NOTIFICATION_OUTBOX_MAINTENANCE_SECRET" "$NOTIFICATION_OUTBOX_MAINTENANCE_URL" >/dev/null; then
    date +%s >/tmp/notification-outbox-maintenance-last-success
  fi
  sleep "$interval"
done
