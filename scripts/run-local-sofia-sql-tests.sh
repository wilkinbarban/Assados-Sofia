#!/usr/bin/env bash
#
# Disposable local pgTAP runner for the Sofia SQL suites.
#
# The runner copies supabase/ into a private temporary project, starts an isolated
# Supabase stack under a unique project id and probe-selected free ports, applies the
# full migration chain plus seed, and then runs each requested suite in a freshly reset
# database through the database container's own psql client. The dblink connection
# string handed to a suite always targets that same disposable database.
#
# Before each psql invocation the harness proves with a bounded preflight that the suite
# file and every relative `\ir` include it resolves are present inside the container, and
# restages the tree when the preceding `supabase db reset` discarded it.
#
# Safety properties:
#   * no shared or production database is touched; ops/ environment files are never read;
#   * every docker operation is scoped by the unique project-id label of this run;
#   * local credentials stay in a 0600 temporary file and are never printed;
#   * TAP output is validated with a real parser, so a pgTAP assertion failure fails the
#     run even when psql exits 0;
#   * the stack, its containers, its network, and the temporary tree are removed on
#     success, failure, timeout, and ordinary signals (TERM, HUP, INT all funnel through
#     the EXIT trap, which restores the console descriptors so its report stays visible).
#     SIGKILL and SIGSTOP cannot be trapped, so a hard kill leaves the labelled resources
#     and the temporary tree behind for an explicit cleanup run; the heartbeat child still
#     stops on its own because it watches this process id.
#   * every long step is bounded and prints a progress heartbeat, so the harness is never
#     silent for minutes while it captures output for redaction; a step that hits its limit
#     reports the timeout explicitly instead of failing anonymously.
#
# Local compatibility normalization (applied only to the temporary copy, never to the
# repository): project id, ports, removal of roles.sql, and removal of the counted
# `owner to supabase_admin` transfers that the hosted runner applies but the local CLI
# cannot reproduce. See the printed normalization line for the exact counts.
#
# Inside its own container the disposable database also gets one ephemeral loopback password
# rule (see ensure_loopback_password_rule); it never reaches the host or the repository.

set -Eeuo pipefail
set +x
umask 077

# Computed first and frozen afterwards: `readonly var=$(...)` would mask a failing
# subshell, leaving repo_root empty instead of aborting the run.
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly repo_root
readonly cli="$repo_root/node_modules/.bin/supabase"
readonly tests_dir_rel='supabase/tests'
readonly protected_project_ref='xvzdxoktwnzmxsfizkxo'

# The hosted migration runner applies ownership transfers to supabase_admin. The local
# CLI migrates as postgres, so the temporary copy drops exactly these statements. The
# expected count is asserted so a new transfer cannot change the local chain silently.
readonly expected_owner_transfers=8

readonly start_timeout_seconds=1200
readonly reset_timeout_seconds=900
readonly psql_timeout_seconds=300
readonly stop_timeout_seconds=300
readonly progress_interval_seconds=20

readonly -a default_suites=(
  'supabase/tests/sofia_activity_core_a.sql'
  'supabase/tests/sofia_inbound_batch_admission.sql'
  'supabase/tests/sofia_inbound_batch_attach_message.sql'
  'supabase/tests/sofia_inbound_batch_processing.sql'
  'supabase/tests/sofia_pacing_core_b.sql'
  'supabase/tests/sofia_web_presence.sql'
  'supabase/tests/sofia_customer_memory.sql'
)

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: scripts/run-local-sofia-sql-tests.sh [supabase/tests/<suite>.sql ...]

Runs pgTAP suites inside a disposable local Supabase stack. With no arguments it runs
the seven Sofia suites this harness owns. Only files under supabase/tests may be named.
EOF
}

# Redacts anything that must never reach logs: connection strings, JWT-shaped values,
# publishable/secret keys, and DSN passwords.
redact() {
  sed -E \
    -e 's#postgresql://[^[:space:]]*#postgresql://[redacted]#g' \
    -e 's#(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,})#[redacted-jwt]#g' \
    -e 's#(sb_(publishable|secret)_[A-Za-z0-9_-]+)#[redacted-key]#g' \
    -e 's#(password=)[^[:space:]]+#\1[redacted]#g'
}

# Binds ephemeral ports so the stack never collides with another local stack. A port
# taken between this probe and `supabase start` makes the start fail loudly below.
free_ports() {
  local needed=$1 collected='' candidate
  while (($(wc -w <<<"$collected") < needed)); do
    candidate="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
    case " $collected " in
      *" $candidate "*) continue ;;
    esac
    collected="$collected $candidate"
  done
  printf '%s\n' "$collected"
}

# ---------------------------------------------------------------------------
# Bounded progress. Long steps capture their output for redaction, so without a
# heartbeat they would stay silent for minutes. The ticker is a supervised child of
# this script, never a detached job: cleanup stops it, and it also exits by itself
# when the parent process disappears. Progress is written to fd 3, which always
# points at the original stderr, so it never pollutes the captured logs. fds 4 and 5
# keep the original stdout and stderr so the signal path can restore them.
# ---------------------------------------------------------------------------
exec 3>&2
exec 4>&1
exec 5>&2
readonly console_out_fd=4
readonly console_err_fd=5
ticker_pid=''
progress_label=''
progress_limit=0
progress_started=0

stop_progress() {
  [[ -n "$ticker_pid" ]] || return 0
  kill "$ticker_pid" 2>/dev/null || true
  wait "$ticker_pid" 2>/dev/null || true
  ticker_pid=''
  return 0
}

# Signal exit path. A caught signal is delivered while the enclosing command's
# redirection is still active, so cleanup output would otherwise land in a captured log
# file that cleanup itself deletes. Restore the console descriptors before exiting so
# the cleanup report always reaches the operator.
signal_exit() {
  local status=$1
  exec 1>&"$console_out_fd" 2>&"$console_err_fd"
  exit "$status"
}

start_progress() {
  progress_label=$1
  progress_limit=$2
  progress_started=$SECONDS
  # $$ is preserved inside a subshell and names this harness process, so the ticker
  # exits on its own when the harness dies in a way cleanup cannot observe (SIGKILL).
  (
    while kill -0 "$$" 2>/dev/null; do
      sleep "$progress_interval_seconds"
      kill -0 "$$" 2>/dev/null || exit 0
      printf '[progress] %s elapsed=%ss timeout=%ss\n' \
        "$progress_label" "$((SECONDS - progress_started))" "$progress_limit" >&3
    done
  ) &
  ticker_pid=$!
}

# Runs one bounded command in the foreground with a progress heartbeat.
run_bounded() {
  local label=$1 limit=$2
  shift 2
  progress_started=$SECONDS
  printf '[progress] %s started limit=%ss\n' "$label" "$limit" >&3
  start_progress "$label" "$limit"
  local status=0
  timeout -k 10 "$limit" "$@" || status=$?
  stop_progress
  if [[ "$status" -eq 124 || "$status" -eq 137 ]]; then
    printf '[progress] %s exceeded its %ss limit (exit=%s)\n' "$label" "$limit" "$status" >&3
  fi
  printf '[progress] %s finished exit=%s elapsed=%ss\n' \
    "$label" "$status" "$((SECONDS - progress_started))" >&3
  return "$status"
}

# ---------------------------------------------------------------------------
# Cleanup: stops and removes only resources labelled with this run's project id.
# Reached from the EXIT trap, so ordinary failures and the TERM/HUP/INT traps below
# all funnel through it. SIGKILL and SIGSTOP cannot be caught; after a hard kill the
# labelled resources and the temporary tree remain for an explicit cleanup run.
# ---------------------------------------------------------------------------
stack_started=false
project_id=''
work=''
tmp_parent="${TMPDIR:-/tmp}"
tmp_parent="${tmp_parent%/}"
work_prefix="$tmp_parent/sofia-sql-tests."

safe_remove() {
  local target=$1
  [[ -n "$target" && "$target" != '/' && "$target" == "$work_prefix"* ]] || return 1
  rm -rf -- "$target"
}

cleanup() {
  local status=$?
  stop_progress
  trap - EXIT HUP INT TERM
  local remaining_containers='' remaining_networks=''

  if [[ "$stack_started" == true && -n "$work" && -d "$work/project" ]]; then
    timeout "$stop_timeout_seconds" "$cli" stop --workdir "$work/project" --no-backup \
      >/dev/null 2>&1 || true
  fi

  if [[ -n "$project_id" ]]; then
    # Label-scoped sweep proves ownership: only containers of this run can match.
    local ids networks
    ids="$(docker ps -aq --filter "label=com.supabase.cli.project=$project_id" 2>/dev/null || true)"
    if [[ -n "$ids" ]]; then
      # shellcheck disable=SC2086 # word splitting is the intended id list
      docker rm -f $ids >/dev/null 2>&1 || true
    fi
    networks="$(docker network ls -q --filter "label=com.supabase.cli.project=$project_id" 2>/dev/null || true)"
    if [[ -n "$networks" ]]; then
      # shellcheck disable=SC2086
      docker network rm $networks >/dev/null 2>&1 || true
    fi
    remaining_containers="$(docker ps -aq --filter "label=com.supabase.cli.project=$project_id" 2>/dev/null | wc -l)"
    remaining_networks="$(docker network ls -q --filter "label=com.supabase.cli.project=$project_id" 2>/dev/null | wc -l)"
  fi

  local temp_state='not-created'
  if [[ -n "$work" && -d "$work" ]]; then
    if safe_remove "$work"; then temp_state='removed'; else temp_state='failed'; fi
  elif [[ -n "$work" ]]; then
    temp_state='already-absent'
  fi

  log "cleanup: own_containers_remaining=${remaining_containers:-0} own_networks_remaining=${remaining_networks:-0} temp_dir=$temp_state"
  exit "$status"
}

# ---------------------------------------------------------------------------
# Arguments and preflight
# ---------------------------------------------------------------------------
suites=()
if (($#)); then
  for argument in "$@"; do
    case "$argument" in
      -h | --help)
        usage
        exit 0
        ;;
    esac
    [[ -f "$argument" ]] || die "missing suite file: $argument"
    absolute="$(cd -- "$(dirname -- "$argument")" && pwd -P)/$(basename -- "$argument")"
    relative="${absolute#"$repo_root"/}"
    [[ "$relative" == "$tests_dir_rel"/*.sql && "$absolute" == "$repo_root/$relative" ]] \
      || die "only suites under $tests_dir_rel may run: $argument"
    suites+=("$relative")
  done
else
  suites=("${default_suites[@]}")
fi
((${#suites[@]})) || die 'no suites selected'

[[ "$(pwd -P)" == "$repo_root" ]] || die "run this harness from the repository root: $repo_root"
[[ "$(git rev-parse --show-toplevel 2>/dev/null)" == "$repo_root" ]] \
  || die 'repository root mismatch; refusing to run'
[[ -x "$cli" ]] || die "missing pinned Supabase CLI binary: $cli"
[[ -f "$repo_root/supabase/config.toml" ]] || die 'missing supabase/config.toml'
for suite in "${suites[@]}"; do
  [[ -f "$repo_root/$suite" ]] || die "missing suite file: $suite"
done

docker info >/dev/null 2>&1 || die 'docker is unavailable; refusing to start a local stack'
command -v python3 >/dev/null 2>&1 || die 'python3 is required for temporary normalization'
command -v realpath >/dev/null 2>&1 || die 'realpath is required to resolve suite includes'

have_tap_parser=false
if perl -MTAP::Parser -e 1 >/dev/null 2>&1; then
  have_tap_parser=true
fi

work="$(mktemp -d "$work_prefix.XXXXXX")"
trap cleanup EXIT
trap 'signal_exit 129' HUP
trap 'signal_exit 130' INT
trap 'signal_exit 143' TERM
mkdir -p "$work/project" "$work/run"
chmod 700 "$work" "$work/project" "$work/run"

# ---------------------------------------------------------------------------
# TAP validation. A real parser is used when perl's TAP::Parser is present; the
# fallback still fails the run on any `not ok`, bailout, plan mismatch, or missing plan.
# ---------------------------------------------------------------------------
cat >"$work/validate-tap.pl" <<'PERL'
use strict;
use warnings;
use TAP::Parser;

my $file = shift or die "usage: validate-tap.pl <tap-file>\n";
my $parser = TAP::Parser->new({ source => $file });

my $bailout;
my @failures;
while (my $result = $parser->next) {
    if ($result->is_bailout) {
        $bailout = $result->as_string;
        next;    # keep draining so the plan and parse errors reach their final state
    }
    next unless $result->is_test;
    next if $result->is_ok;
    push @failures, ($result->description // $result->as_string);
}

# Documented TAP::Parser accessors only. parse_errors and failed return a list whose
# scalar value is the error/failure count, so a list-returning method must never be
# dereferenced as an array reference.
my $tests    = $parser->tests_run;
my $failed   = $parser->failed;
my @problems = $parser->parse_errors;
my $planned  = $parser->tests_planned;
my $has_plan = defined $planned ? 1 : 0;
$planned = 0 unless $has_plan;

printf "TAP_RESULT tests=%d failed=%d plan=%d problems=%d\n",
  $tests, $failed, $planned, scalar @problems;

my $ok = 1;
if (defined $bailout) { $ok = 0; printf STDERR "bailout: %s\n", $bailout; }
if ($failed) { $ok = 0; printf STDERR "not ok: %s\n", $_ for @failures; }
if (@problems) {
    $ok = 0;
    printf STDERR "parse problem: %s\n", $_ for @problems;
}
if (!$has_plan) {
    $ok = 0;
    print STDERR "plan mismatch: no plan found\n";
}
elsif ($planned != $tests) {
    $ok = 0;
    printf STDERR "plan mismatch: planned %d, ran %d\n", $planned, $tests;
}
if ($tests == 0) { $ok = 0; print STDERR "no TAP assertions found\n"; }
exit($ok ? 0 : 1);
PERL

# Keeps only TAP records: pgTAP output is interleaved with ordinary statement results.
# A record must carry its test number, because psql's aligned format prints a bare `ok` header
# that must never become an assertion; padding is stripped so old aligned and unaligned agree.
filter_tap() {
  grep -E '^[[:space:]]*(ok|not ok)[[:space:]]+[0-9]+([[:space:]]|$)|^[[:space:]]*1\.\.[0-9]+[[:space:]]*$|^[[:space:]]*Bail out!|^[[:space:]]*# ' "$1" \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' || true
}

# Mirror of the parser path for hosts without perl's TAP::Parser. It stays
# deliberately conservative: a TODO failure counts as a failure instead of being
# excused, and a clean, complete plan is required.
validate_tap_fallback() {
  local tap=$1 tests failed planned bailouts
  tests="$(grep -cE '^ok( |$)' "$tap" || true)"
  failed="$(grep -cE '^not ok( |$)' "$tap" || true)"
  bailouts="$(grep -cE '^Bail out!' "$tap" || true)"
  planned="$(sed -nE 's/^1\.\.([0-9]+)$/\1/p' "$tap" | head -1)"
  planned="${planned:-0}"
  printf 'TAP_RESULT tests=%d failed=%d plan=%d problems=%d\n' \
    "$((tests + failed))" "$failed" "$planned" "$bailouts"
  [[ "$bailouts" -eq 0 && "$tests" -gt 0 && "$failed" -eq 0 && "$planned" -eq "$((tests + failed))" ]]
}

validate_tap() {
  local tap=$1
  if [[ "$have_tap_parser" == true ]]; then
    perl "$work/validate-tap.pl" "$tap"
  else
    validate_tap_fallback "$tap"
  fi
}

# Startup self-check: synthetic TAP documents prove the validator accepts a clean
# document and rejects a failing assertion, a bailout, a missing plan, and a plan that
# does not match the number of assertions. No suite and no database is touched.
tap_self_check() {
  local exit_code case_name
  printf '1..1\nok 1 - synthetic pass\n' >"$work/run/selfcheck-pass.tap"
  printf '1..2\nok 1 - synthetic pass\nnot ok 2 - synthetic failure\n' >"$work/run/selfcheck-fail.tap"
  printf '1..2\nok 1 - synthetic pass\nBail out! synthetic bailout\n' >"$work/run/selfcheck-bailout.tap"
  printf 'ok 1 - synthetic pass\nok 2 - synthetic pass\n' >"$work/run/selfcheck-noplan.tap"
  printf '1..3\nok 1 - synthetic pass\nok 2 - synthetic pass\n' >"$work/run/selfcheck-mismatch.tap"

  exit_code=0
  validate_tap "$work/run/selfcheck-pass.tap" >/dev/null 2>&1 || exit_code=$?
  ((exit_code == 0)) || die "TAP validator rejected a passing synthetic document (exit=$exit_code)"

  for case_name in fail bailout noplan mismatch; do
    exit_code=0
    validate_tap "$work/run/selfcheck-$case_name.tap" >/dev/null 2>&1 || exit_code=$?
    ((exit_code == 1)) \
      || die "TAP validator returned exit=$exit_code for the $case_name control (expected 1)"
  done

  log "tap_validator=$([[ "$have_tap_parser" == true ]] && echo 'TAP::Parser' || echo 'fallback-grep') self_check=pass-accepted,fail,bailout,noplan,mismatch-rejected"
}
tap_self_check

# ---------------------------------------------------------------------------
# Private temporary project: config, migrations, and tests only, plus normalization.
# ---------------------------------------------------------------------------
read -r -a ports <<<"$(free_ports 8)"
api_port="${ports[0]}" db_port="${ports[1]}" shadow_port="${ports[2]}" pooler_port="${ports[3]}"
studio_port="${ports[4]}" smtp_port="${ports[5]}" analytics_port="${ports[6]}" inspector_port="${ports[7]}"
project_id="sofia-sql-$(python3 -c 'import uuid; print(uuid.uuid4().hex[:8])')"

cp -a "$repo_root/supabase" "$work/project/supabase"

python3 - "$work/project" "$project_id" "$expected_owner_transfers" \
  "api=$api_port" "db=$db_port" "shadow=$shadow_port" "pooler=$pooler_port" \
  "studio=$studio_port" "smtp=$smtp_port" "analytics=$analytics_port" "inspector=$inspector_port" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
project_id = sys.argv[2]
expected_transfers = int(sys.argv[3])
ports = dict(item.split('=', 1) for item in sys.argv[4:])
supabase = root / 'supabase'

config_path = supabase / 'config.toml'
config = config_path.read_text()


def replace_once(pattern, replacement, label):
    global config
    config, count = re.subn(pattern, replacement, config)
    if count != 1:
        raise SystemExit(f'normalization expected one {label}, found {count}')


replace_once(r'(?m)^project_id = "Asados"$', f'project_id = "{project_id}"', 'project id')
for key, original, label in (
    ('api', '54321', 'api port'),
    ('db', '54322', 'db port'),
    ('studio', '54323', 'studio port'),
    ('smtp', '54324', 'mailpit port'),
    ('analytics', '54327', 'analytics port'),
    ('pooler', '54329', 'pooler port'),
):
    replace_once(rf'(?m)^port = {original}$', f'port = {ports[key]}', label)
replace_once(r'(?m)^shadow_port = 54320$', f"shadow_port = {ports['shadow']}", 'shadow port')
replace_once(r'(?m)^inspector_port = 8083$', f"inspector_port = {ports['inspector']}", 'inspector port')
config_path.write_text(config)

roles_removed = 0
roles_path = supabase / 'roles.sql'
if roles_path.exists():
    roles_path.unlink()
    roles_removed = 1

# Hosted-only ownership transfer, removed only from this temporary copy.
pattern = re.compile(r'^alter function public\.[^;]+ owner to supabase_admin;\n?', re.MULTILINE)
transfers_removed = 0
for path in sorted((supabase / 'migrations').glob('*.sql')):
    source = path.read_text()
    rewritten, count = pattern.subn('', source)
    if count:
        path.write_text(rewritten)
        transfers_removed += count
if transfers_removed != expected_transfers:
    raise SystemExit(
        f'normalization expected {expected_transfers} local ownership transfers, found {transfers_removed}'
    )

print(
    'normalization: '
    f'project_id={project_id} '
    f'ports=api:{ports["api"]},db:{ports["db"]},shadow:{ports["shadow"]},pooler:{ports["pooler"]},'
    f'studio:{ports["studio"]},smtp:{ports["smtp"]},analytics:{ports["analytics"]},inspector:{ports["inspector"]} '
    f'owner_transfers_removed={transfers_removed} roles_sql_removed={roles_removed}'
)
PY

# ---------------------------------------------------------------------------
# Start, migrate, and seed the disposable stack.
# ---------------------------------------------------------------------------
# Synthetic local auth value only; the local config keeps the Twilio provider disabled.
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN="local-disposable-${project_id}"

log "starting disposable stack (project_id=$project_id, db_port=$db_port)"
if ! run_bounded 'supabase start' "$start_timeout_seconds" "$cli" start --workdir "$work/project" \
  >"$work/start.log" 2>&1; then
  log '--- supabase start log (tail, redacted) ---' >&2
  redact <"$work/start.log" | tail -n 40 >&2
  die 'disposable local Supabase failed to start'
fi
stack_started=true

if ! run_bounded 'initial supabase db reset' "$reset_timeout_seconds" \
  "$cli" db reset --local --workdir "$work/project" >"$work/reset.log" 2>&1; then
  log '--- supabase db reset log (tail, redacted) ---' >&2
  redact <"$work/reset.log" | tail -n 60 >&2
  die 'product migration chain or seed failed during the initial local reset'
fi

"$cli" status --workdir "$work/project" -o env >"$work/status.env" 2>"$work/status.err" \
  || die 'could not read disposable stack status'

status_value() {
  sed -n "s/^${1}=\"\{0,1\}\([^\"[:space:]]*\)\"\{0,1\}$/\1/p" "$work/status.env" | head -1
}
api_url="$(status_value API_URL)"
db_url="$(status_value DB_URL)"

if [[ "$api_url" != "http://127.0.0.1:$api_port" || "$db_url" != *"@127.0.0.1:$db_port/postgres"* ]]; then
  die 'safety gate rejected a non-disposable local target'
fi
grep -Fq "$protected_project_ref" "$work/status.env" \
  && die 'safety gate rejected a protected hosted project reference'

db_container="$(docker ps \
  --filter "label=com.supabase.cli.project=$project_id" \
  --format '{{.Names}}' | grep -x "supabase_db_$project_id" || true)"
[[ -n "$db_container" ]] || die "could not find the disposable database container for $project_id"
[[ "$(docker inspect --format '{{index .Config.Labels "com.supabase.cli.project"}}' "$db_container")" == "$project_id" ]] \
  || die 'database container ownership check failed'
docker inspect --format '{{.Config.Image}}' "$db_container" | grep -q 'supabase/postgres:' \
  || die 'disposable database container is not a local Supabase postgres image'

# The connection string is built here, kept in this process, and passed only to psql
# (as its connection target and as the dblink variable). It never reaches stdout, and
# every failure excerpt is redacted before printing.
db_password="$(docker exec "$db_container" printenv POSTGRES_PASSWORD)"
[[ -n "$db_password" ]] || die 'could not read the disposable database password'
conninfo="$(python3 -c 'import sys, urllib.parse; print("postgresql://postgres:%s@127.0.0.1:5432/postgres" % urllib.parse.quote(sys.argv[1], safe=""))' "$db_password")"
unset db_password

# ---------------------------------------------------------------------------
# Staged suite tree. psql runs inside the database container and resolves a relative
# `\ir` against the including file, so the whole supabase/ tree must exist there.
# `supabase db reset` may replace the database container, and a replaced container
# starts with an empty writable layer, so the tree is staged, verified, and staged again
# whenever a reset discarded it. The copy names the source directory contents (SRC/.)
# into a pre-created destination, because `docker cp DIR DEST` nests DIR under DEST once
# DEST exists and a second staging would then land one level too deep.
# ---------------------------------------------------------------------------
container_work="/tmp/sofia-sql-suites-$project_id"
readonly stage_timeout_seconds=120
readonly preflight_timeout_seconds=60

stage_supabase_tree() {
  run_bounded 'stage supabase tree' "$stage_timeout_seconds" docker exec "$db_container" \
    mkdir -p "$container_work/supabase" >/dev/null 2>&1 \
    || die "could not prepare $container_work inside $db_container"
  run_bounded 'stage supabase tree' "$stage_timeout_seconds" docker cp \
    "$work/project/supabase/." "$db_container:$container_work/supabase" >/dev/null 2>&1 \
    || die "could not copy the supabase tree into $db_container"
}

# Prints the in-container paths a suite needs: the suite file itself plus every relative
# `\ir` include it pulls in, because psql resolves those next to the including file.
suite_staged_paths() {
  local repo_suite=$1 name=$2 target resolved
  printf '%s\n' "$container_work/supabase/tests/$name"
  while read -r target; do
    [[ -n "$target" ]] || continue
    [[ "$target" != /* ]] || die "suite $name uses an absolute include: $target"
    resolved="$(realpath -m --relative-to="$repo_root" "$(dirname -- "$repo_suite")/$target")"
    [[ "$resolved" == supabase/* ]] || die "suite $name includes a path outside supabase/: $resolved"
    printf '%s\n' "$container_work/$resolved"
  done < <(sed -nE 's/^[[:space:]]*\\ir[[:space:]]+([^[:space:]]+).*$/\1/p' "$repo_suite")
}

# Bounded existence preflight before psql. A missing file makes psql abort on its first
# statement, and the suite would then report zero assertions instead of naming the real
# problem. One restaging attempt covers a container replaced by the previous reset;
# `restaged=` records whether that staging was actually needed.
# shellcheck disable=SC2016 # the in-container sh expands these, never the host bash
ensure_staged_suite() {
  local suite=$1 name=$2 attempt missing='' log_file
  log_file="$work/run/$name.staged.log"
  local -a paths=()
  mapfile -t paths < <(suite_staged_paths "$repo_root/$suite" "$name")
  for attempt in initial restaged; do
    if run_bounded "staged files $name" "$preflight_timeout_seconds" docker exec "$db_container" \
      sh -c '
        for path in "$@"; do
          [ -f "$path" ] || { printf "missing staged file: %s\n" "$path"; exit 1; }
        done
      ' staged-files "${paths[@]}" >"$log_file" 2>&1; then
      log "preflight $name staged_files=${#paths[@]} restaged=$([[ "$attempt" == initial ]] && echo no || echo yes)"
      return 0
    fi
    missing="$(tr '\n' ' ' <"$log_file")"
    [[ "$attempt" == initial ]] || break
    log "preflight $name staged_tree=incomplete action=restaging"
    stage_supabase_tree
  done
  die "staged suite files are missing inside $db_container after restaging: $missing"
}

# One ephemeral loopback password rule for this disposable database only: the image lists
# `host all all 127.0.0.1/32 trust` before its scram rules, so an in-container loopback
# connection never exchanges a password and dblink_connect then refuses it for the
# non-superuser `postgres` role the suites run as. The prepended rule covers exactly
# postgres->postgres on loopback and leaves every other HBA line, role and service untouched;
# it lives only in this container and is re-applied idempotently after each reset.
readonly loopback_rule_marker='# sofia-sql-local-tests: loopback password authentication'
readonly loopback_rule="$loopback_rule_marker"$'\n'"host postgres postgres 127.0.0.1/32 scram-sha-256"

# shellcheck disable=SC2016 # the in-container sh expands these, never the host bash
ensure_loopback_password_rule() {
  local paths hba_file data_directory proof
  paths="$(docker exec "$db_container" psql --no-psqlrc -X -tA -d "$conninfo" -c \
    "select current_setting('hba_file')||'|'||current_setting('data_directory')")" \
    || die 'could not read the disposable hba_file and data_directory'
  IFS='|' read -r hba_file data_directory <<<"$paths"
  [[ -n "$hba_file" && -n "$data_directory" ]] || die "unexpected disposable hba paths: $paths"
  if docker exec "$db_container" grep -qF "$loopback_rule_marker" "$hba_file" >/dev/null 2>&1; then
    log "loopback_password_rule=already-present hba=$hba_file"
  else
    run_bounded 'loopback password rule' "$preflight_timeout_seconds" docker exec -u postgres "$db_container" \
      sh -c '
        set -e
        hba="$1"
        tmp="$hba.sofia-sql-local-tests.new"
        printf "%s\n" "$2" >"$tmp"
        cat "$hba" >>"$tmp"
        mv "$tmp" "$hba"
        pg_ctl reload -D "$3"
      ' sofia-loopback-rule "$hba_file" "$loopback_rule" "$data_directory" >"$work/run/hba-reload.log" 2>&1 \
      || die "could not apply and reload the loopback password rule to $hba_file"
    log "loopback_password_rule=applied hba=$hba_file data_directory=$data_directory reload=ok"
  fi
  # Positive proof: this loopback path now exchanges a password as the non-superuser postgres role.
  proof="$(run_bounded 'loopback password probe' "$preflight_timeout_seconds" docker exec "$db_container" \
    psql --no-psqlrc -X -tA -F'|' -d "$conninfo" -c \
    "select current_user, (select rolsuper from pg_roles where rolname = current_user), 1")" \
    || die 'the loopback password path did not authenticate with the generated password'
  [[ "$proof" == 'postgres|f|1' ]] \
    || die "the suite session must stay the non-superuser postgres role, got: $proof"
  # Negative proof: the same rule must reject a wrong password at the container-local 5432 port.
  run_bounded 'loopback wrong-password probe' "$preflight_timeout_seconds" docker exec \
    -e PGPASSWORD=sofia-sql-local-tests-wrong-password "$db_container" \
    psql --no-psqlrc -X -tA -h 127.0.0.1 -p 5432 -U postgres -d postgres -c 'select 1' \
    >"$work/run/loopback-wrong-password.log" 2>&1 \
    && die 'the loopback password rule accepted a wrong password; refusing to run suites'
  grep -q 'password authentication failed' "$work/run/loopback-wrong-password.log" \
    || die 'the wrong-password probe failed unexpectedly, not as an authentication rejection'
  log "loopback_password_proof=password-accepted,wrong-password-rejected session=$proof"
}

# Staged and verified before the loop, so the per-suite preflight can tell "a reset
# discarded the staged tree" apart from "staging never reached the container".
stage_supabase_tree
ensure_staged_suite "${suites[0]}" "$(basename -- "${suites[0]}")"
ensure_loopback_password_rule

# Fail fast when the disposable connection string cannot reach its own database.
# Without this probe every suite would abort before its first assertion and the run
# would report zero-assertion results instead of a clear connection failure.
if ! run_bounded 'disposable db connectivity probe' 60 docker exec "$db_container" \
  psql --no-psqlrc --quiet --pset pager=off -d "$conninfo" -tAc 'select 1' \
  >"$work/run/connectivity.log" 2>&1; then
  log '--- connectivity probe output (tail, redacted) ---' >&2
  redact <"$work/run/connectivity.log" | tail -n 20 >&2
  die 'the disposable database connection string did not connect; refusing to run suites'
fi

# ---------------------------------------------------------------------------
# Run each suite against its own freshly reset database.
# ---------------------------------------------------------------------------
total_tests=0
total_failed=0
failed_suites=()

for suite in "${suites[@]}"; do
  name="$(basename -- "$suite")"
  log "== suite: $name"

  if ! run_bounded "supabase db reset before $name" "$reset_timeout_seconds" \
    "$cli" db reset --local --workdir "$work/project" >"$work/run/$name.reset.log" 2>&1; then
    log '--- supabase db reset log (tail, redacted) ---' >&2
    redact <"$work/run/$name.reset.log" | tail -n 60 >&2
    die "product migration chain or seed failed before $name; stopping with the exact error above"
  fi

  # The reset above may have replaced the database container, whose fresh writable layer
  # holds neither the staged tree nor the ephemeral loopback password rule, so both are
  # re-verified idempotently immediately before psql.
  ensure_staged_suite "$suite" "$name"
  ensure_loopback_password_rule

  raw="$work/run/$name.raw"
  tap="$work/run/$name.tap"
  set +e
  # psql needs its own connection target: without -d it falls back to the container's
  # local socket as root, which fails peer authentication before any assertion runs.
  # -t -A keeps pgTAP's TAP lines free of psql headers and padding; ON_ERROR_STOP still aborts.
  run_bounded "psql $name" "$psql_timeout_seconds" docker exec "$db_container" \
    psql --no-psqlrc --quiet --tuples-only --no-align --pset pager=off -v ON_ERROR_STOP=1 \
    -d "$conninfo" \
    -v "runtime_dblink_conninfo=$conninfo" \
    -f "$container_work/supabase/tests/$name" >"$raw" 2>&1
  psql_status=$?
  set -e

  filter_tap "$raw" >"$tap"

  set +e
  tap_output="$(validate_tap "$tap" 2>"$work/run/$name.tap.err")"
  tap_status=$?
  set -e

  tests="$(sed -nE 's/^TAP_RESULT tests=([0-9]+) failed=([0-9]+) plan=([0-9]+) problems=([0-9]+)$/\1/p' <<<"$tap_output" | head -1)"
  failed="$(sed -nE 's/^TAP_RESULT tests=[0-9]+ failed=([0-9]+) .*$/\1/p' <<<"$tap_output" | head -1)"
  tests="${tests:-0}"
  failed="${failed:-0}"
  total_tests=$((total_tests + tests))
  total_failed=$((total_failed + failed))

  if [[ "$psql_status" -eq 0 && "$tap_status" -eq 0 ]]; then
    log "PASS $name (assertions=$tests failed=0 psql_exit=0)"
  else
    failed_suites+=("$name")
    log "FAIL $name (assertions=$tests failed=$failed psql_exit=$psql_status tap_exit=$tap_status)"
    if [[ "$psql_status" -ne 0 ]]; then
      printf 'failures:\n'
      redact <"$raw" | tail -n 60
      # The staged database is disposable, so a psql abort leaves nothing behind
      # except evidence; the next suite still starts from a fresh reset.
      log "note: psql exit $psql_status aborts this suite only; later suites still run"
    fi
    if [[ -s "$work/run/$name.tap.err" ]]; then
      printf 'tap diagnostics:\n'
      redact <"$work/run/$name.tap.err"
    fi
  fi
done

log "summary: suites=${#suites[@]} assertions=$total_tests failed_assertions=$total_failed failing_suites=${#failed_suites[@]}"
if ((${#failed_suites[@]})); then
  printf 'failing suites: %s\n' "${failed_suites[*]}" >&2
  exit 1
fi
log 'all selected suites passed'
