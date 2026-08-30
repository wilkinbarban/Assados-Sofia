#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

home="${HOME:?HOME must be set}"
workspace="${ASADOS_PREFLIGHT_WORKSPACE:-$home/.cache/asados/workspace}"
min_free_bytes="${ASADOS_PREFLIGHT_MIN_FREE_BYTES:-536870912}"
min_free_inodes="${ASADOS_PREFLIGHT_MIN_FREE_INODES:-10000}"

usage() {
  printf '%s\n' \
    "Usage: $0 check [target]" \
    "       $0 run -- <command...>"
}

tmp_quota_diagnostic() {
  local options
  if command -v findmnt >/dev/null 2>&1; then
    options="$(findmnt -no OPTIONS --target /tmp 2>/dev/null || true)"
    if [[ "$options" =~ (^|,)(usrquota|grpquota|prjquota|quota)(,|$) ]]; then
      printf 'quota-enabled (%s)' "$options"
      return
    fi
  fi
  printf 'quota status unavailable'
}

fail_preflight() {
  local target=$1 reason=$2 mount=$3 tmp_mount=$4 tmp_quota=$5
  printf '%s\n' \
    "Workspace preflight failed for target $target on mount $mount: $reason" \
    "This may be EDQUOT/quota exhaustion even when df shows free space." \
    "Temporary directory mount: $tmp_mount ($tmp_quota)." \
    "Mitigation: free or raise the quota on the target mount, then rerun with a home-backed workspace (ASADOS_PREFLIGHT_WORKSPACE=$home/.cache/asados/workspace)." >&2
  exit 1
}

mount_for() {
  df -Pk "$1" | awk 'END { print $1 " mounted at " $6 }'
}

nearest_existing_ancestor() {
  local path=$1
  while [[ ! -e "$path" ]]; do
    path="$(dirname -- "$path")"
  done
  printf '%s' "$path"
}

check_headroom_and_probe() {
  local target=$1 diagnostic_target=$2 context=$3 blocks inodes mount tmp_mount tmp_quota probe
  mount="$(mount_for "$target")"
  tmp_mount="$(mount_for /tmp)"
  tmp_quota="$(tmp_quota_diagnostic)"

  blocks="$(df -Pk "$target" | awk 'END { print $4 }')"
  inodes="$(df -Pi "$target" | awk 'END { print $4 }')"
  [[ "$blocks" =~ ^[0-9]+$ && "$inodes" =~ ^[0-9]+$ ]] || fail_preflight "$diagnostic_target" "could not read free-space or inode headroom on $context" "$mount" "$tmp_mount" "$tmp_quota"
  (( blocks * 1024 >= min_free_bytes )) || fail_preflight "$diagnostic_target" "free-byte headroom is below $min_free_bytes bytes on $context" "$mount" "$tmp_mount" "$tmp_quota"
  (( inodes >= min_free_inodes )) || fail_preflight "$diagnostic_target" "free-inode headroom is below $min_free_inodes on $context" "$mount" "$tmp_mount" "$tmp_quota"

  probe="$target/.preflight-probe-$$-$RANDOM"
  if [[ "${ASADOS_PREFLIGHT_TEST_FORCE_PARENT_PROBE_FAILURE:-}" == 1 && "$context" == nearest\ existing\ parent* ]] || [[ "${ASADOS_PREFLIGHT_TEST_FORCE_PROBE_FAILURE:-}" == 1 && "$context" == target ]]; then
    fail_preflight "$diagnostic_target" "write and fsync probe failed on $context (test hook)" "$mount" "$tmp_mount" "$tmp_quota"
  fi
  if ! node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const fd = fs.openSync(path, "wx", 0o600);
    try { fs.writeSync(fd, "preflight\\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.unlinkSync(path);
  ' "$probe"; then
    fail_preflight "$diagnostic_target" "write and fsync probe failed on $context" "$mount" "$tmp_mount" "$tmp_quota"
  fi
}

check_target() {
  local target=$1 parent mount tmp_mount tmp_quota target_name
  parent="$(nearest_existing_ancestor "$target")"
  check_headroom_and_probe "$parent" "$target" "nearest existing parent $parent"

  mount="$(mount_for "$parent")"
  tmp_mount="$(mount_for /tmp)"
  tmp_quota="$(tmp_quota_diagnostic)"
  target_name="$(basename -- "$target")"
  if [[ "${ASADOS_PREFLIGHT_TEST_FORCE_MKDIR_FAILURE:-}" == 1 ]] || [[ "${ASADOS_PREFLIGHT_TEST_FORCE_MKDIR_FAILURE_TARGET:-}" == "$target_name" ]] || ! mkdir -p -- "$target"; then
    fail_preflight "$target" "could not create workspace directory from nearest existing parent $parent" "$mount" "$tmp_mount" "$tmp_quota"
  fi
  if [[ "${ASADOS_PREFLIGHT_TEST_FORCE_CHMOD_FAILURE_TARGET:-}" == "$target_name" ]] || ! chmod 0700 -- "$target"; then
    fail_preflight "$target" 'could not set private workspace permissions' "$mount" "$tmp_mount" "$tmp_quota"
  fi

  check_headroom_and_probe "$target" "$target" target
}

case "${1:-}" in
  check)
    [[ $# -le 2 ]] || { usage >&2; exit 2; }
    check_target "${2:-$workspace}"
    ;;
  run)
    [[ "${2:-}" == -- && $# -ge 3 ]] || { usage >&2; exit 2; }
    check_target "$workspace"
    check_target "$workspace/tmp"
    check_target "$workspace/npm-cache"
    export TMPDIR="$workspace/tmp" TMP="$workspace/tmp" TEMP="$workspace/tmp"
    export npm_config_cache="$workspace/npm-cache"
    shift 2
    exec "$@"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
