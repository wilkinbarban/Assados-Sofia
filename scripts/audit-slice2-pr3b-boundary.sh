#!/usr/bin/env bash
# Local-only evidence for a dirty workspace; it never stages, commits, or contacts a service.
set -Eeuo pipefail
set +x

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly OUTPUT="${1:-$ROOT/openspec/changes/staging-slice2-receipt-pipeline/pr3b-boundary-evidence.md}"
readonly REFRESH_EPOCH="${SOURCE_DATE_EPOCH:-0}"
[[ "$REFRESH_EPOCH" =~ ^[0-9]+$ ]] || {
  printf '%s\n' 'SOURCE_DATE_EPOCH must be an unsigned integer' >&2
  exit 2
}
readonly REFRESHED_AT="$(date -u -d "@$REFRESH_EPOCH" +'%Y-%m-%dT%H:%M:%SZ')"
readonly OWNED_PATHS=(
  'scripts/validate-slice2-hosted-receipt.sh'
  'ops/systemd/run-slice2-receipt'
  'tests/unit/slice2-hosted-receipt-harness.test.ts'
  'tests/unit/slice2-systemd-receipt-pipeline.test.ts'
  'scripts/audit-slice2-pr3b-boundary.sh'
  'tests/unit/slice2-pr3b-boundary-audit.test.ts'
  'openspec/changes/staging-slice2-receipt-pipeline/design.md'
  'openspec/changes/staging-slice2-receipt-pipeline/tasks.md'
  'openspec/changes/staging-slice2-receipt-pipeline/apply-progress.md'
  'openspec/changes/staging-slice2-receipt-pipeline/pr3b-boundary-evidence.md'
)
readonly HASHED_PATHS=(
  'scripts/validate-slice2-hosted-receipt.sh'
  'ops/systemd/run-slice2-receipt'
  'tests/unit/slice2-hosted-receipt-harness.test.ts'
  'tests/unit/slice2-systemd-receipt-pipeline.test.ts'
  'scripts/audit-slice2-pr3b-boundary.sh'
  'tests/unit/slice2-pr3b-boundary-audit.test.ts'
  'openspec/changes/staging-slice2-receipt-pipeline/design.md'
  'openspec/changes/staging-slice2-receipt-pipeline/tasks.md'
)

is_owned() {
  local candidate=$1 path
  for path in "${OWNED_PATHS[@]}"; do [[ "$candidate" == "$path" ]] && return 0; done
  return 1
}

write_known_paths() {
  local path hash lines
  for path in "${HASHED_PATHS[@]}"; do
    [[ -f "$ROOT/$path" ]] || continue
    hash="$(sha256sum "$ROOT/$path" | cut -d ' ' -f1)"
    lines="$(wc -l <"$ROOT/$path" | tr -d ' ')"
    printf '| `%s` | `%s` | %s |\n' "$path" "$hash" "$lines"
  done
}

write_dirty_paths() {
  local status path
  while IFS= read -r status; do
    path="${status:3}"
    is_owned "$path" || is_owned_container "$path" || printf '| `%s` | `%s` |\n' "${status:0:2}" "$path"
  done < <(git -C "$ROOT" status --porcelain=v1 | LC_ALL=C sort)
  return 0
}

is_owned_container() {
  local candidate=$1 path
  [[ "$candidate" == */ ]] || return 1
  for path in "${OWNED_PATHS[@]}"; do [[ "$path" == "$candidate"* ]] && return 0; done
  return 1
}

write_unclassified_containers() {
  local status path
  while IFS= read -r status; do
    path="${status:3}"
    is_owned_container "$path" && printf '| `%s` | `%s` |\n' "${status:0:2}" "$path"
  done < <(git -C "$ROOT" status --porcelain=v1 | LC_ALL=C sort)
  return 0
}

mkdir -p "$(dirname "$OUTPUT")"
{
  printf '%s\n\n' '# PR3B Non-Commit Boundary Evidence'
  printf '%s\n' 'Generated locally by `scripts/audit-slice2-pr3b-boundary.sh`; no staging, commit, or external operation occurred.'
  printf 'Refreshed at (UTC): `%s`\n' "$REFRESHED_AT"
  printf '%s\n\n' 'No pre-change Git snapshot exists for this audit.'
  printf '%s\n' 'Current line counts are estimates, not a pre-change diff. Hashes identify current bytes only; they cannot prove ownership or reconstruct a delta without the missing snapshot.'
  printf '%s\n\n' 'Limitation: `git diff --no-index` cannot be produced honestly because no externally supplied pre-change directory exists.'
  printf '%s\n%s\n' '## Known PR3A/PR3B Owned Paths' '| Path | SHA-256 | Current lines |'
  printf '%s\n' '|---|---|---:|'
  write_known_paths
  printf '%s\n%s\n' '' '## Unrelated Dirty Workspace Paths'
  printf '%s\n' '| Git status | Path |'
  printf '%s\n' '|---|---|'
  write_dirty_paths
  printf '%s\n%s\n' '' '## Unclassified Dirty Directories'
  printf '%s\n' 'Git reports these as whole untracked directories. They contain declared owned paths but may also contain unrelated files, so this audit does not assign their remaining contents.'
  printf '%s\n' '| Git status | Directory |'
  printf '%s\n' '|---|---|'
  write_unclassified_containers
  printf '%s\n%s\n' '' '## Work-Unit Estimate and Rollback'
  printf '%s\n' '- PR3B-2 is limited to this audit script, its focused test, and this evidence report; expected authored scope is under 400 lines.'
  printf '%s\n' '- Rollback: remove only `scripts/audit-slice2-pr3b-boundary.sh`, `tests/unit/slice2-pr3b-boundary-audit.test.ts`, and this report. Do not alter unrelated workspace paths.'
} >"$OUTPUT"
