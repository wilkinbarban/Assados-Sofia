#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$root"
[[ "$(pwd -P)" == "$(git rev-parse --show-toplevel)" ]] || {
  printf '%s\n' 'Local Supabase test runner requires the repository root.' >&2
  exit 1
}

readonly local_api_url='http://127.0.0.1:55321'
readonly protected_project='xvzdxoktwnzmxsfizkxo'
readonly -a target_tests=(
  'tests/unit/roles-authentication-e2e.test.ts'
  'tests/unit/web-client-operator-cart-flow.test.ts'
)

tests_to_run=("${target_tests[@]}")
if (($#)); then
  tests_to_run=()
  for argument in "$@"; do
    allowed=false
    for target in "${target_tests[@]}"; do
      if [[ "$argument" == "$target" || "$argument" == "$root/$target" ]]; then
        tests_to_run+=("$target")
        allowed=true
        break
      fi
    done
    [[ "$allowed" == true ]] || {
      printf 'Only the two service-backed Supabase suites may run; rejected: %s\n' "$argument" >&2
      exit 2
    }
  done
fi

docker info >/dev/null 2>&1 || {
  printf '%s\n' 'Docker is unavailable; refusing to run service-backed tests.' >&2
  exit 1
}

work="$(mktemp -d "${TMPDIR:-/tmp}/asados-supabase-tests.XXXXXX")"
started_by_runner=false
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  if [[ "$started_by_runner" == true ]]; then
    npx supabase stop --workdir "$work/project" --no-backup >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if npx supabase status >/dev/null 2>&1; then
  printf '%s\n' 'A local Supabase stack is already running. Refusing to reset shared developer state.' >&2
  exit 1
fi

# The production runner applies migrations as supabase_admin. Supabase CLI reserves
# that role and migrates as postgres, so ownership transfers cannot run locally.
# Prepare a private disposable migration tree and remove only those transfers.
mkdir -p "$work/project"
cp -a supabase "$work/project/supabase"
rm -f "$work/project/supabase/roles.sql"
python3 - "$work/project/supabase" <<'PY'
from pathlib import Path
import re
import sys

supabase_root = Path(sys.argv[1])
config_path = supabase_root / 'config.toml'
config = config_path.read_text()
ports = {54321: 55321, 54322: 55322, 54329: 55329, 54323: 55323, 54324: 55324, 54327: 55327}
for source, target in ports.items():
    config, count = re.subn(rf'(?m)^port = {source}$', f'port = {target}', config)
    if count != 1:
        raise SystemExit(f'expected one local port {source}, found {count}')
config, expose_count = re.subn(
    r'(?m)^# auto_expose_new_tables = false$',
    'auto_expose_new_tables = true',
    config,
)
config, phone_count = re.subn(
    r'(?ms)(^\[auth\.sms\]\n.*?^enable_signup = )false$',
    r'\1true',
    config,
)
config, provider_count = re.subn(
    r'(?ms)(^\[auth\.sms\.twilio\]\n^enabled = )false\n^account_sid = ""\n^message_service_sid = ""$',
    r'\1true\naccount_sid = "local-test"\nmessage_service_sid = "local-test"',
    config,
)
if expose_count != 1 or phone_count != 1 or provider_count != 1:
    raise SystemExit('expected local API grant and phone-auth settings')
config_path.write_text(config)

pattern = re.compile(r'^alter function public\.[^;]+ owner to supabase_admin;\n?', re.MULTILINE)
changed = 0
for path in (supabase_root / 'migrations').glob('*.sql'):
    source = path.read_text()
    rewritten, count = pattern.subn('', source)
    if count:
        path.write_text(rewritten)
        changed += count
if changed != 8:
    raise SystemExit(f'expected 8 local-only ownership transfers, found {changed}')
PY

export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN='local-test-only'
if ! npx supabase start --workdir "$work/project" >"$work/start.log" 2>&1; then
  printf '%s\n' 'Disposable local Supabase failed to start.' >&2
  exit 1
fi
started_by_runner=true

if ! npx supabase db reset --local --workdir "$work/project" >"$work/reset.log" 2>&1; then
  printf '%s\n' 'Disposable local Supabase reset or seed failed.' >&2
  exit 1
fi
npx supabase status --workdir "$work/project" -o env >"$work/status.env" 2>"$work/status.err"

status_value() {
  local name=$1
  sed -n "s/^${name}=\"\{0,1\}\([^\"[:space:]]*\)\"\{0,1\}$/\1/p" "$work/status.env" | head -1
}

api_url="$(status_value API_URL)"
anon_key="$(status_value ANON_KEY)"
service_key="$(status_value SERVICE_ROLE_KEY)"
if [[ "$api_url" != "$local_api_url" ]] || grep -Fq "$protected_project" "$work/status.env"; then
  printf '%s\n' 'Safety gate rejected a non-local or protected Supabase target.' >&2
  exit 1
fi
if [[ -z "$anon_key" || -z "$service_key" || "$anon_key" == ci-placeholder || "$service_key" == ci-placeholder ]]; then
  printf '%s\n' 'Safety gate rejected missing or placeholder local Supabase credentials.' >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$api_url"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$anon_key"
export SUPABASE_SERVICE_ROLE_KEY="$service_key"
export SUPABASE_INTERNAL_URL="$api_url"

scripts/workspace-preflight.sh run -- npx vitest run \
  "${tests_to_run[@]}" \
  --fileParallelism=false \
  --allowOnly=false
