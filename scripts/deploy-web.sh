#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
state_root="${ASADOS_DEPLOY_STATE_ROOT:-/var/lib/asados/deploy}"
smoke="$root/scripts/smoke-production-readonly.sh"
health_timeout="${ASADOS_WEB_HEALTH_TIMEOUT_SECONDS:-180}"

usage() {
  printf '%s\n' \
    "Usage: $0 deploy <local-immutable-image-ref>" \
    "       $0 rollback"
}

require_immutable_local_image() {
  local ref=$1
  [[ "$ref" != *@* && "$ref" == *:* && "$ref" != *:latest ]] || {
    printf 'An explicit immutable local image tag is required: %s\n' "$ref" >&2
    exit 2
  }
  docker image inspect "$ref" >/dev/null
}

image_id() {
  docker image inspect "$1" --format '{{.Id}}'
}

wait_healthy() {
  local deadline=$((SECONDS + health_timeout))
  while (( SECONDS < deadline )); do
    [[ "$(docker inspect asados-web --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)" == healthy ]] && return 0
    sleep 2
  done
  printf 'Web did not become healthy within %s seconds\n' "$health_timeout" >&2
  return 1
}

recreate_and_verify() {
  local ref=$1 expected_id=$2
  ASADOS_WEB_IMAGE="$ref" docker compose -f "$root/docker-compose.yml" \
    --project-directory "$root" up -d --no-deps --force-recreate web
  wait_healthy
  ASADOS_EXPECTED_IMAGE_ID="$expected_id" "$smoke"
}

write_state() {
  local previous_ref=$1 previous_id=$2 deployed_ref=$3 deployed_id=$4
  local temporary="$state_root/release.env.tmp"
  {
    printf 'PREVIOUS_REF=%q\n' "$previous_ref"
    printf 'PREVIOUS_ID=%q\n' "$previous_id"
    printf 'DEPLOYED_REF=%q\n' "$deployed_ref"
    printf 'DEPLOYED_ID=%q\n' "$deployed_id"
    printf 'RECORDED_AT=%q\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$temporary"
  mv -f -- "$temporary" "$state_root/release.env"
}

load_state() {
  [[ -f "$state_root/release.env" ]] || {
    printf 'No rollback state exists at %s\n' "$state_root/release.env" >&2
    exit 1
  }
  # The file is root/operator-owned and contains only shell-escaped values written above.
  # shellcheck disable=SC1090
  source "$state_root/release.env"
}

mkdir -p -- "$state_root"
chmod 0700 "$state_root"
exec 9>"$state_root/deploy.lock"
flock -n 9 || { printf '%s\n' 'Another Web deployment is active' >&2; exit 1; }

action="${1:-}"
case "$action" in
  deploy)
    [[ $# -eq 2 ]] || { usage >&2; exit 2; }
    candidate_ref=$2
    require_immutable_local_image "$candidate_ref"
    candidate_id="$(image_id "$candidate_ref")"
    current_id="$(docker inspect asados-web --format '{{.Image}}')"
    rollback_ref="asados-web:rollback-${current_id#sha256:}"
    docker image tag "$current_id" "$rollback_ref"
    previous_id="$(image_id "$rollback_ref")"

    if ! recreate_and_verify "$candidate_ref" "$candidate_id"; then
      printf '%s\n' 'Promotion failed; restoring the retained previous image' >&2
      recreate_and_verify "$rollback_ref" "$previous_id"
      exit 1
    fi
    write_state "$rollback_ref" "$previous_id" "$candidate_ref" "$candidate_id"
    printf 'Deployed %s (%s)\n' "$candidate_ref" "$candidate_id"
    ;;
  rollback)
    [[ $# -eq 1 ]] || { usage >&2; exit 2; }
    load_state
    require_immutable_local_image "$PREVIOUS_REF"
    [[ "$(image_id "$PREVIOUS_REF")" == "$PREVIOUS_ID" ]] || {
      printf '%s\n' 'Retained rollback tag no longer matches its recorded image ID' >&2
      exit 1
    }
    started=$SECONDS
    recreate_and_verify "$PREVIOUS_REF" "$PREVIOUS_ID"
    elapsed=$((SECONDS - started))
    (( elapsed < 300 )) || {
      printf 'Rollback exceeded five minutes: %s seconds\n' "$elapsed" >&2
      exit 1
    }
    printf 'Rolled back to %s (%s) in %s seconds\n' "$PREVIOUS_REF" "$PREVIOUS_ID" "$elapsed"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
