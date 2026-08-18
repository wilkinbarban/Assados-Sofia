#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'precondition-failed:%s\n' "$1" >&2
  exit 1
}

repo='' recovery='' remote='' refspec='' owner='' authorization='' action='preflight'
while (($#)); do
  case "$1" in
    --repo|--recovery|--remote|--refspec|--owner|--authorization|--action)
      (($# >= 2)) || fail 'invalid-arguments'
      case "$1" in
        --repo) repo=$2 ;;
        --recovery) recovery=$2 ;;
        --remote) remote=$2 ;;
        --refspec) refspec=$2 ;;
        --owner) owner=$2 ;;
        --authorization) authorization=$2 ;;
        --action) action=$2 ;;
      esac
      shift 2
      ;;
    *) fail 'invalid-arguments' ;;
  esac
done

[[ "$repo" = /* ]] || fail 'repository-not-canonical'
canonical_repo=$(realpath -e -- "$repo" 2>/dev/null) || fail 'repository-not-canonical'
[[ "$canonical_repo" == "$repo" ]] || fail 'repository-not-canonical'
git_root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) || fail 'repository-invalid'
[[ "$git_root" == "$repo" ]] || fail 'repository-not-canonical'

[[ "$recovery" = /* ]] || fail 'recovery-not-canonical'
canonical_recovery=$(realpath -e -- "$recovery" 2>/dev/null) || fail 'recovery-incomplete'
[[ "$canonical_recovery" == "$recovery" ]] || fail 'recovery-not-canonical'
[[ $(stat -c '%u' "$recovery") == "$(id -u)" ]] || fail 'recovery-owner-invalid'
mode=$(stat -c '%a' "$recovery")
(( (8#$mode & 077) == 0 )) || fail 'recovery-permissions-invalid'

required=(inventory.txt staged.patch unstaged.patch untracked.tar.gz untracked.manifest repository.bundle QUARANTINE.txt SHA256SUMS clean-worktree)
for artifact in "${required[@]}"; do
  [[ -e "$recovery/$artifact" ]] || fail 'recovery-incomplete'
done
(cd "$recovery" && sha256sum --status -c SHA256SUMS) || fail 'checksum-invalid'
git -C "$repo" bundle verify "$recovery/repository.bundle" >/dev/null 2>&1 || fail 'bundle-invalid'

inventory_repo=$(grep -a -m1 '^repository=' "$recovery/inventory.txt" | cut -d= -f2-)
inventory_head=$(grep -a -m1 '^head=' "$recovery/inventory.txt" | cut -d= -f2-)
current_head=$(git -C "$repo" rev-parse HEAD)
[[ "$inventory_repo" == "$repo" ]] || fail 'repository-mismatch'
[[ "$inventory_head" == "$current_head" ]] || fail 'head-mismatch'
[[ $(git -C "$recovery/clean-worktree" rev-parse HEAD 2>/dev/null) == "$current_head" ]] || fail 'clean-worktree-mismatch'
git -C "$recovery/clean-worktree" diff --quiet || fail 'clean-worktree-dirty'
git -C "$recovery/clean-worktree" diff --cached --quiet || fail 'clean-worktree-dirty'

temporary=$(mktemp -d) || fail 'restore-failed'
trap 'rm -rf -- "$temporary"' EXIT
git -C "$repo" diff --cached --binary >"$temporary/current-staged.patch"
git -C "$repo" diff --binary >"$temporary/current-unstaged.patch"
cmp -s "$temporary/current-staged.patch" "$recovery/staged.patch" || fail 'staged-mismatch'
cmp -s "$temporary/current-unstaged.patch" "$recovery/unstaged.patch" || fail 'unstaged-mismatch'

(
  cd "$repo"
  while IFS= read -r -d '' path; do
    [[ "$path" != *$'\n'* ]] || exit 1
    sha256sum -- "$path"
  done < <(git ls-files -z --others --exclude-standard)
) | LC_ALL=C sort >"$temporary/current-untracked.manifest" || fail 'untracked-mismatch'
cmp -s "$temporary/current-untracked.manifest" "$recovery/untracked.manifest" || fail 'untracked-mismatch'

mkdir "$temporary/untracked"
python3 - "$recovery/untracked.tar.gz" "$temporary/untracked" <<'PY' || fail 'archive-invalid'
import os, sys, tarfile
archive, destination = sys.argv[1:]
root = os.path.realpath(destination)
with tarfile.open(archive, "r:gz") as source:
    for member in source.getmembers():
        target = os.path.realpath(os.path.join(root, member.name))
        if os.path.commonpath((root, target)) != root or not (member.isfile() or member.isdir()):
            raise ValueError("unsafe archive")
    source.extractall(root)
PY
if [[ -s "$recovery/untracked.manifest" ]]; then
  (cd "$temporary/untracked" && sha256sum --status -c "$recovery/untracked.manifest") || fail 'archive-mismatch'
elif find "$temporary/untracked" -mindepth 1 -print -quit | grep -q .; then
  fail 'archive-mismatch'
fi

git clone -q "$recovery/repository.bundle" "$temporary/restore" 2>/dev/null || fail 'restore-failed'
[[ $(git -C "$temporary/restore" rev-parse HEAD 2>/dev/null) == "$current_head" ]] || fail 'restore-failed'
[[ ! -s "$recovery/staged.patch" ]] || git -C "$temporary/restore" apply --index "$recovery/staged.patch" || fail 'restore-failed'
[[ ! -s "$recovery/unstaged.patch" ]] || git -C "$temporary/restore" apply "$recovery/unstaged.patch" || fail 'restore-failed'
cp -a "$temporary/untracked/." "$temporary/restore/" || fail 'restore-failed'
git -C "$temporary/restore" diff --cached --binary >"$temporary/restored-staged.patch"
git -C "$temporary/restore" diff --binary >"$temporary/restored-unstaged.patch"
cmp -s "$temporary/restored-staged.patch" "$recovery/staged.patch" || fail 'restore-failed'
cmp -s "$temporary/restored-unstaged.patch" "$recovery/unstaged.patch" || fail 'restore-failed'

owner=${owner#"${owner%%[![:space:]]*}"}
owner=${owner%"${owner##*[![:space:]]}"}
[[ -n "$remote" && -n "$refspec" && "$owner" =~ ^[A-Za-z0-9][A-Za-z0-9._@-]*$ ]] || fail 'publication-ambiguous'
[[ "$remote" =~ ^[A-Za-z0-9._-]+$ ]] || fail 'publication-ambiguous'
[[ "$refspec" != *:*:* && "$refspec" == *:* ]] || fail 'publication-ambiguous'
source_ref=${refspec%%:*}; destination_ref=${refspec#*:}
[[ "$source_ref" == refs/heads/* && "$destination_ref" == refs/heads/* ]] || fail 'publication-ambiguous'
git check-ref-format "$source_ref" && git check-ref-format "$destination_ref" || fail 'publication-ambiguous'
git -C "$repo" remote get-url "$remote" >/dev/null 2>&1 || fail 'remote-missing'

authorized() {
  local record=$1
  [[ -n "$authorization" && -f "$authorization" ]] || return 1
  grep -Fqx -- "$record" "$authorization"
}

case "$action" in
  preflight) ;;
  replace) authorized 'A0=AUTHORIZED' || fail 'authorization-missing:A0' ;;
  revoke)
    authorized 'A1=AUTHORIZED' || fail 'authorization-missing:A1'
    authorized 'CONSUMERS=VERIFIED' || fail 'consumers-unverified'
    authorized 'REPLACEMENTS=VERIFIED' || fail 'replacements-unverified'
    ;;
  rewrite)
    authorized 'B1=AUTHORIZED' || fail 'authorization-missing:B1'
    authorized 'A1=VERIFIED_REVOKED' || fail 'revocation-unverified'
    ;;
  gc)
    authorized 'B2=AUTHORIZED' || fail 'authorization-missing:B2'
    authorized 'B1=VALIDATED' || fail 'rewrite-unvalidated'
    ;;
  publish) authorized 'SANITATION=VERIFIED' || fail 'sanitation-unverified' ;;
  *) fail 'action-invalid' ;;
esac

index_state='dirty'
git -C "$repo" diff --cached --quiet && index_state='empty'
printf 'status=ready action=%s index=%s commit-a=blocked publication=explicit\n' "$action" "$index_state"
printf 'notice=validation-only;no-credential-or-git-history-operation-executed\n'
