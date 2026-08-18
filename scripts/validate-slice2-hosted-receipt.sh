#!/usr/bin/env bash
# Staging receipt contract. Preflight is local-only; PR3 owns external enablement.
set -Eeuo pipefail
set +x

readonly PRODUCTION_REF='xvzdxoktwnzmxsfizkxo'
readonly AUTHORIZED_STAGING_REF='mhoqwjatrendnhfnwewv'
readonly NORMAL_SIGN_IN_EXPECTATION='password'
readonly STORAGE_BUCKET='produto-imagens'
readonly HTTP_TIMEOUT_SECONDS=20
readonly COMMAND_TIMEOUT_SECONDS=10
readonly RECEIPT_RETENTION_DAYS=30
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly MANIFEST_PATHS=(
  supabase/migrations/20260703210000_epica1_auth_otp.sql
  supabase/migrations/20260704140000_epica2_client_chat.sql
  supabase/migrations/20260704170000_epica6_crm_sales.sql
  supabase/migrations/20260705010000_epica8_dashboard_improvements.sql
  supabase/migrations/20260708000000_estoque_horarios.sql
  supabase/migrations/20260708160000_produto_imagens_public.sql
  supabase/migrations/20260711144706_admin_products_inventory_hardening.sql
  supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql
  supabase/migrations/20260713110019_admin_product_image_lifecycle.sql
  apps/web/src/app/actions/estoque.ts
  scripts/validate-slice2-hosted-receipt.sh
  tests/unit/slice2-hosted-receipt-harness.test.ts
)
lock_directory=''
CURRENT_FINGERPRINT=''
fixture_user_ids=()
fixture_object_paths=()
fixture_cleanup_ids=()
fixture_product_id=''
fixture_cleanup_finalized=false
fixture_http_files=()
fixture_admin_credentials=''
fixture_denied_credentials=''
fixture_admin_token=''
fixture_denied_token=''
scenario_statuses=()
receipt_attempt_id=''

fail() { printf '%s\n' "$1" >&2; exit 1; }
failure_receipt() {
  local category=$1 started_at finished_at
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [[ -d "${RECEIPT_DIR:-}" ]] && write_receipt failure "\"$category\"" not_started "$started_at" "$finished_at"
  fail "$category"
}
require_value() { [[ -n "${!1:-}" ]] || failure_receipt unsafe-target; }

guard_target() {
  require_value STAGING_BASELINE_REF
  require_value STAGING_TARGET_REF
  require_value STAGING_TARGET_IDENTITY
  [[ "$STAGING_BASELINE_REF" =~ ^[a-z]{20}$ ]] || failure_receipt unsafe-target
  [[ "$STAGING_TARGET_REF" =~ ^[a-z]{20}$ ]] || failure_receipt unsafe-target
  [[ "$STAGING_TARGET_REF" != "$PRODUCTION_REF" ]] || failure_receipt unsafe-target
  [[ "$STAGING_BASELINE_REF" == "$AUTHORIZED_STAGING_REF" ]] || failure_receipt unsafe-target
  [[ "$STAGING_TARGET_REF" == "$AUTHORIZED_STAGING_REF" ]] || failure_receipt unsafe-target
  [[ "$STAGING_TARGET_REF" == "$STAGING_BASELINE_REF" ]] || failure_receipt unsafe-target
  [[ "$STAGING_TARGET_IDENTITY" == "staging:${AUTHORIZED_STAGING_REF}" ]] || failure_receipt drift
}

credential_file() {
  local name=$1 path
  [[ -n "${CREDENTIALS_DIRECTORY:-}" && -d "$CREDENTIALS_DIRECTORY" ]] || return 1
  case "$name" in
    staging-secret) path="$CREDENTIALS_DIRECTORY/staging-secret" ;;
    staging-publishable) path="$CREDENTIALS_DIRECTORY/staging-publishable" ;;
    *) return 1 ;;
  esac
  [[ -f "$path" && ! -L "$path" && -r "$path" ]] || return 1
  [[ "$(stat -c %u "$path")" == 0 && "$(stat -c %a "$path")" =~ ^[46]00$ ]] || return 1
  printf '%s\n' "$path"
}

require_authorized_fixture_contract() {
  [[ "${RECEIPT_EXECUTION:-}" == authorized ]] || failure_receipt unexpected-status
  credential_file staging-secret >/dev/null || failure_receipt unexpected-status
  credential_file staging-publishable >/dev/null || failure_receipt unexpected-status
}

fixture_uuid() { cat /proc/sys/kernel/random/uuid; }
http_response=''
http_status=''
http_token=''
http() {
  local key=$1 method=$2 path=$3 payload=$4 secret config response
  secret="$(<"$(credential_file "$key")")"
  config="$(mktemp)"; response="$(mktemp)"; fixture_http_files+=("$config" "$response")
  (umask 077; printf 'header = "apikey: %s"\nheader = "Content-Type: application/json"\n' "$secret" >"$config"; [[ -z "$http_token" ]] || printf 'header = "Authorization: Bearer %s"\n' "$http_token" >>"$config")
  http_status="$(timeout "$HTTP_TIMEOUT_SECONDS" curl --config "$config" -sS -X "$method" \
    --data-binary "@$payload" -o "$response" -w '%{http_code}' "https://${AUTHORIZED_STAGING_REF}.supabase.co${path}")" || return 1
  http_response="$response"
}
payload() { local file; file="$(mktemp)"; fixture_http_files+=("$file"); (umask 077; printf '%s' "$1" >"$file"); printf '%s\n' "$file"; }
expect_status() { local expected=$1; shift; http "$@" && [[ "$http_status" == "$expected" ]]; }
emit_cleanup_http_observation() {
  local step=$1 parameter_names=$2 expected=$3 status=${http_status:-0} error_code=null error_message=null
  [[ "$status" =~ ^[0-9]{3}$ ]] || status=0
  if [[ "$status" != "$expected" ]]; then
    case "$status" in
      400) error_code='"HTTP_400"'; error_message='"Bad Request"' ;;
      401) error_code='"HTTP_401"'; error_message='"Unauthorized"' ;;
      403) error_code='"HTTP_403"'; error_message='"Forbidden"' ;;
      404) error_code='"HTTP_404"'; error_message='"Not Found"' ;;
      409) error_code='"HTTP_409"'; error_message='"Conflict"' ;;
      422) error_code='"HTTP_422"'; error_message='"Unprocessable Entity"' ;;
      *) error_code='"HTTP_ERROR"'; error_message='"HTTP request failed"' ;;
    esac
  fi
  printf '{"cleanup_step":"%s","http_status":%d,"error_code":%s,"error_message":%s,"parameter_names":%s}\n' \
    "$step" "$((10#$status))" "$error_code" "$error_message" "$parameter_names" >&2
}
cleanup_expect_status() {
  local expected=$1 step=$2 parameter_names=$3 request_status=0
  shift 3
  http "$@" || request_status=$?
  emit_cleanup_http_observation "$step" "$parameter_names" "$expected"
  [[ "$request_status" == 0 && "$http_status" == "$expected" ]]
}
record_scenario_status() {
  local scenario=$1 status=$2 status_class=$3 error_code=${4:-}
  case "$scenario:$status_class:$error_code" in
    authenticated-product-create:2xx:|authenticated-storage-upload:2xx:|authenticated-rpc-substitute:2xx:|authenticated-rpc-register-cleanup:2xx:|authenticated-rpc-get-cleanup:2xx:|authenticated-rpc-fail-cleanup:2xx:|authenticated-rpc-complete-cleanup:2xx:)
      scenario_statuses+=("{\"scenario\":\"$scenario\",\"status_class\":\"$status_class\"}") ;;
    denied-rpc-substitute:4xx:USUARIO_NAO_AUTORIZADO)
      scenario_statuses+=("{\"scenario\":\"$scenario\",\"status_class\":\"$status_class\",\"error_code\":\"$error_code\"}") ;;
    *) return 1 ;;
  esac
}
expect_authenticated_status() {
  local scenario=$1 key=$2 method=$3 path=$4 body=$5
  http "$key" "$method" "$path" "$body" && [[ "$http_status" =~ ^2[0-9]{2}$ ]] && record_scenario_status "$scenario" "$http_status" 2xx
}
required_scenario_statuses_complete() {
  local scenario
  for scenario in authenticated-product-create authenticated-storage-upload authenticated-rpc-substitute authenticated-rpc-register-cleanup authenticated-rpc-get-cleanup authenticated-rpc-fail-cleanup authenticated-rpc-complete-cleanup denied-rpc-substitute; do
    [[ " ${scenario_statuses[*]} " == *"\"scenario\":\"$scenario\""* ]] || return 1
  done
}
create_fixture_user() {
  local role=$1 id email password body
  id="$(fixture_uuid)"; email="slice2-${role}-${id}@invalid.example"; password="$(fixture_uuid)"
  body="$(payload "{\"id\":\"$id\",\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true}")"
  expect_status 200 staging-secret POST /auth/v1/admin/users "$body" || return 1
  printf '%s:%s:%s\n' "$id" "$email" "$password"
}
promote_fixture_profile() {
  local credentials=$1 id body empty
  id="${credentials%%:*}"
  body="$(payload '{"funcao":"admin","ativo":true}')"
  expect_status 204 staging-secret PATCH "/rest/v1/perfis?id=eq.$id" "$body" || return 1
  empty="$(payload '{}')"
  expect_status 200 staging-secret GET "/rest/v1/perfis?id=eq.$id&select=id,funcao,ativo" "$empty" || return 1
  grep -Eq '"id"[[:space:]]*:[[:space:]]*"'"$id"'"' "$http_response" &&
    grep -Eq '"funcao"[[:space:]]*:[[:space:]]*"admin"' "$http_response" &&
    grep -Eq '"ativo"[[:space:]]*:[[:space:]]*true' "$http_response"
}
sign_in_fixture_user() {
  local credentials=$1 email password body
  credentials="${credentials#*:}"; email="${credentials%%:*}"; password="${credentials#*:}"
  body="$(payload "{\"email\":\"$email\",\"password\":\"$password\"}")"
  expect_status 200 staging-publishable POST "/auth/v1/token?grant_type=$NORMAL_SIGN_IN_EXPECTATION" "$body" || return 1
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["access_token"])' "$http_response"
}
rpc() { local scenario=$1 name=$2 body=$3; expect_authenticated_status "$scenario" staging-publishable POST "/rest/v1/rpc/$name" "$(payload "$body")"; }
run_authenticated_scenarios() {
  local object_id full thumb body cleanup_id
  fixture_product_id="$(fixture_uuid)"; object_id="$(fixture_uuid)"
  full="produtos/$fixture_product_id/1/$object_id/full.webp"; thumb="produtos/$fixture_product_id/1/$object_id/thumb.webp"
  fixture_object_paths+=("$full" "$thumb")
  body="$(payload "{\"id\":\"$fixture_product_id\",\"nome\":\"slice2 fixture\",\"preco_centavos\":1,\"ativo\":false}")"
  http_token="$fixture_admin_token"
  expect_authenticated_status authenticated-product-create staging-secret POST '/rest/v1/produtos' "$body" || return 1
  expect_authenticated_status authenticated-storage-upload staging-publishable POST "/storage/v1/object/$STORAGE_BUCKET/$full" "$(payload fixture)" || return 1
  rpc authenticated-rpc-substitute substituir_imagem_produto "{\"p_produto_id\":\"$fixture_product_id\",\"p_slot\":1,\"p_full_path\":\"$full\",\"p_thumb_path\":\"$thumb\"}" || return 1
  rpc authenticated-rpc-register-cleanup registrar_limpeza_imagem_pendente "{\"p_produto_id\":\"$fixture_product_id\",\"p_paths\":[\"$full\"],\"p_error\":\"fixture\"}" || return 1
  cleanup_id="$(grep -Eo '[0-9a-f-]{36}' "$http_response" | head -n1)"
  [[ "$cleanup_id" =~ ^[0-9a-f-]{36}$ ]] || return 1
  fixture_cleanup_ids+=("$cleanup_id")
  rpc authenticated-rpc-get-cleanup obter_limpeza_imagem_pendente "{\"p_cleanup_id\":\"$cleanup_id\"}" && rpc authenticated-rpc-fail-cleanup falhar_limpeza_imagem_pendente "{\"p_cleanup_id\":\"$cleanup_id\",\"p_error\":\"fixture\"}" && rpc authenticated-rpc-complete-cleanup concluir_limpeza_imagem_pendente "{\"p_cleanup_id\":\"$cleanup_id\"}"
}
run_denied_role_scenarios() {
  local body; body="$(payload "{\"p_produto_id\":\"$fixture_product_id\",\"p_slot\":1,\"p_full_path\":\"invalid\",\"p_thumb_path\":\"invalid\"}")"
  http_token="$fixture_denied_token"
  http staging-publishable POST /rest/v1/rpc/substituir_imagem_produto "$body" && [[ "$http_status" =~ ^4[0-9]{2}$ ]] && grep -q 'USUARIO_NAO_AUTORIZADO' "$http_response" && record_scenario_status denied-rpc-substitute "$http_status" 4xx USUARIO_NAO_AUTORIZADO
}
cleanup_fixture_users() {
  local id path empty cleanup_rc=0; empty="$(payload '{}')"
  http_token="$fixture_admin_token"
  for path in "${fixture_object_paths[@]}"; do cleanup_expect_status 200 storage-object-delete '["bucket","object_path"]' staging-publishable DELETE "/storage/v1/object/$STORAGE_BUCKET/$path" "$empty" || cleanup_rc=1; done
  for id in "${fixture_cleanup_ids[@]}"; do cleanup_expect_status 204 pending-record-delete '["cleanup_id"]' staging-secret DELETE "/rest/v1/produto_imagem_cleanup_pendentes?id=eq.$id" "$empty" || cleanup_rc=1; done
  [[ -z "$fixture_product_id" ]] || cleanup_expect_status 204 product-delete '["product_id"]' staging-secret DELETE "/rest/v1/produtos?id=eq.$fixture_product_id" "$empty" || cleanup_rc=1
  for id in "${fixture_user_ids[@]}"; do cleanup_expect_status 204 auth-user-delete '["user_id"]' staging-secret DELETE "/auth/v1/admin/users/$id" "$empty" || cleanup_rc=1; done
  return "$cleanup_rc"
}
verify_fixture_cleanup() {
  local id empty; empty="$(payload '{}')"; http_token="$fixture_admin_token"
  for id in "${fixture_user_ids[@]}"; do cleanup_expect_status 404 auth-user-readback '["user_id"]' staging-secret GET "/auth/v1/admin/users/$id" "$empty" || return 1; done
  [[ -z "$fixture_product_id" ]] || { cleanup_expect_status 200 product-readback '["product_id"]' staging-secret GET "/rest/v1/produtos?id=eq.$fixture_product_id" "$empty" && [[ "$(<"$http_response")" == '[]' ]]; }
}
finally_cleanup() { cleanup_fixture_users && verify_fixture_cleanup; }
json_string_array() {
  local value first=true
  printf '['
  for value in "$@"; do
    [[ "$first" == true ]] || printf ','
    printf '"%s"' "$value"
    first=false
  done
  printf ']'
}
write_cleanup_attribution() {
  [[ ${#fixture_user_ids[@]} -gt 0 || -n "$fixture_product_id" || ${#fixture_object_paths[@]} -gt 0 ]] || return 0

  [[ -n "$receipt_attempt_id" ]] || receipt_attempt_id="$(date -u +%Y%m%dT%H%M%S)-$$"
  local attribution_dir="${RECEIPT_ATTRIBUTION_DIR:-$RECEIPT_DIR/.attribution}"
  local attribution_file="$attribution_dir/${receipt_attempt_id}.json" temporary_attribution_file

  [[ ! -L "$attribution_dir" ]] || return 1
  mkdir -p -m 700 "$attribution_dir"
  chmod 700 "$attribution_dir"
  [[ -d "$attribution_dir" ]] || return 1
  temporary_attribution_file="$(mktemp "$attribution_dir/.${receipt_attempt_id}.XXXXXX")" || return 1
  (
    umask 077
    printf '{"attempt_id":"%s","cleanup":{"user_ids":' "$receipt_attempt_id"
    json_string_array "${fixture_user_ids[@]}"
    printf ',"object_paths":'
    json_string_array "${fixture_object_paths[@]}"
    printf ',"cleanup_ids":'
    json_string_array "${fixture_cleanup_ids[@]}"
    printf ',"product_id":"%s"}}\n' "$fixture_product_id"
  ) >"$temporary_attribution_file" || { rm -f -- "$temporary_attribution_file"; return 1; }
  chmod 600 "$temporary_attribution_file"
  mv -f -- "$temporary_attribution_file" "$attribution_file"
}
release_lock() {
  [[ -n "$lock_directory" ]] || return 0
  rm -f -- "$lock_directory/owner.pid" 2>/dev/null || true
  rmdir -- "$lock_directory" 2>/dev/null || true
}
cleanup_on_exit() {
  local exit_status=$?
  trap - EXIT
  trap '' INT TERM HUP
  if [[ "$fixture_cleanup_finalized" == false && ( ${#fixture_user_ids[@]} -gt 0 || -n "$fixture_product_id" || ${#fixture_object_paths[@]} -gt 0 ) ]]; then
    write_cleanup_attribution >/dev/null 2>&1 || true
    finally_cleanup >/dev/null 2>&1 || true
    [[ -d "${RECEIPT_DIR:-}" ]] && write_receipt failure '"interrupted"' incomplete "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null 2>&1 || true
  fi
  rm -f -- "${fixture_http_files[@]}" 2>/dev/null || true
  release_lock
  exit "$exit_status"
}

authorized_fixture_contract() {
  local started_at finished_at outcome=failure category=unexpected-status cleanup=incomplete
  require_authorized_fixture_contract
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if fixture_admin_credentials="$(create_fixture_user admin)"; then
    fixture_user_ids+=("${fixture_admin_credentials%%:*}")
    if promote_fixture_profile "$fixture_admin_credentials" && fixture_denied_credentials="$(create_fixture_user denied)"; then
      fixture_user_ids+=("${fixture_denied_credentials%%:*}")
      fixture_admin_token="$(sign_in_fixture_user "$fixture_admin_credentials")" && fixture_denied_token="$(sign_in_fixture_user "$fixture_denied_credentials")" && run_authenticated_scenarios && run_denied_role_scenarios && required_scenario_statuses_complete && { outcome=success; category=null; }
    fi
  fi
  write_cleanup_attribution || { outcome=failure; category=cleanup-incomplete; }
  finally_cleanup && cleanup=proven || { outcome=failure; category=cleanup-incomplete; }
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [[ "$category" == null ]] || category="\"$category\""
  write_receipt "$outcome" "$category" "$cleanup" "$started_at" "$finished_at"
  fixture_cleanup_finalized=true
  rm -f -- "${fixture_http_files[@]}"
  [[ "$outcome" == success ]] || fail "$category"
  write_success_fingerprint || fail drift
}

fingerprint() {
  local path
  for path in "${MANIFEST_PATHS[@]}"; do
    [[ -f "$ROOT/$path" ]] || failure_receipt drift
  done
  (
    cd "$ROOT"
    timeout "$COMMAND_TIMEOUT_SECONDS" sha256sum "${MANIFEST_PATHS[@]}" | LC_ALL=C sort | sha256sum | cut -d ' ' -f1
  ) || failure_receipt drift
}

revision() {
  timeout "$COMMAND_TIMEOUT_SECONDS" git -C "$ROOT" rev-parse HEAD 2>/dev/null || printf 'unknown'
}

write_success_fingerprint() {
  local prior_file=${PRIOR_SUCCESS_FINGERPRINT_FILE:-}
  [[ -n "$prior_file" ]] || return 0
  (umask 077; printf '%s\n' "$CURRENT_FINGERPRINT" >"${prior_file}.tmp.$$" && mv -f -- "${prior_file}.tmp.$$" "$prior_file")
}

write_receipt() {
  local outcome=$1 category=$2 cleanup=$3 started_at=$4 finished_at=$5 receipt_trigger scenario_statuses_json receipt_target_identity=unavailable
  [[ -n "$receipt_attempt_id" ]] || receipt_attempt_id="$(date -u +%Y%m%dT%H%M%S)-$$"
  local attempt_id="$receipt_attempt_id"
  receipt_trigger="${RECEIPT_TRIGGER:-manual}"
  [[ "$receipt_trigger" == manual || "$receipt_trigger" == automatic ]] || receipt_trigger=invalid
  [[ "$outcome" != success || "$cleanup" == proven ]] || fail 'cleanup-incomplete'
  [[ "${STAGING_TARGET_IDENTITY:-}" == "staging:${AUTHORIZED_STAGING_REF}" ]] && receipt_target_identity="$STAGING_TARGET_IDENTITY"
  scenario_statuses_json="$(IFS=,; printf '[%s]' "${scenario_statuses[*]}")"
  printf '{"attempt_id":"%s","trigger":"%s","target_identity":"%s","revision":"%s","fingerprint":"%s","outcome":"%s","category":%s,"scenario_statuses":%s,"started_at":"%s","finished_at":"%s","cleanup":"%s"}\n' \
    "$attempt_id" "$receipt_trigger" "$receipt_target_identity" "$(revision)" "${CURRENT_FINGERPRINT:-unavailable}" \
    "$outcome" "$category" "$scenario_statuses_json" "$started_at" "$finished_at" "$cleanup" >"$RECEIPT_DIR/${attempt_id}.json"
}

automatic_failure() {
  failure_receipt drift
}

valid_prior_fingerprint() {
  local prior_file=$1 prior_fingerprint
  [[ -f "$prior_file" && ! -L "$prior_file" && -r "$prior_file" ]] || return 1
  prior_fingerprint="$(<"$prior_file")"
  [[ "$prior_fingerprint" =~ ^[a-f0-9]{64}$ ]] || return 1
  [[ "$prior_fingerprint" != "$CURRENT_FINGERPRINT" ]] || return 2
}

recover_dead_lock_owner() {
  local owner_file="$lock_directory/owner.pid" owner_pid
  [[ -f "$owner_file" && ! -L "$owner_file" && -r "$owner_file" ]] || return 1
  owner_pid="$(<"$owner_file")"
  [[ "$owner_pid" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ ! -d "/proc/$owner_pid" ]] || return 1
  rm -f -- "$owner_file" && rmdir -- "$lock_directory"
}

acquire_lock() {
  local owner_file temporary_owner_file
  lock_directory="${SLICE2_LOCK_ROOT:-/run/asados/slice2}/slice2-receipt-${STAGING_TARGET_REF}.lock"
  if ! mkdir -- "$lock_directory" 2>/dev/null; then
    recover_dead_lock_owner || failure_receipt lock-held
    mkdir -- "$lock_directory" 2>/dev/null || failure_receipt lock-held
  fi

  owner_file="$lock_directory/owner.pid"
  temporary_owner_file="$lock_directory/.owner.pid.$$"
  (umask 077 && printf '%s\n' "$$" >"$temporary_owner_file") || {
    rm -f -- "$temporary_owner_file"
    rmdir -- "$lock_directory" 2>/dev/null || true
    failure_receipt lock-held
  }
  mv -f -- "$temporary_owner_file" "$owner_file" || failure_receipt lock-held
}

main() {
  RECEIPT_TRIGGER="${RECEIPT_TRIGGER:-manual}"
  [[ "${1:-}" == --preflight || "${1:-}" == --authorized-flow ]] || failure_receipt unsafe-target
  guard_target
  [[ -d "${RECEIPT_DIR:-}" ]] || fail 'unsafe-target'
  RECEIPT_TRIGGER="${RECEIPT_TRIGGER:-manual}"
  [[ "$RECEIPT_TRIGGER" == manual || "$RECEIPT_TRIGGER" == automatic ]] || failure_receipt unsafe-target

  acquire_lock
  trap 'cleanup_on_exit' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP

  CURRENT_FINGERPRINT="$(fingerprint)"
  if [[ -n "${APPROVED_MANIFEST_FINGERPRINT:-}" && "$APPROVED_MANIFEST_FINGERPRINT" != "$CURRENT_FINGERPRINT" ]]; then
    [[ "$RECEIPT_TRIGGER" == automatic ]] && automatic_failure
    failure_receipt drift
  fi
  if [[ "$RECEIPT_TRIGGER" == automatic ]]; then
    valid_prior_fingerprint "${PRIOR_SUCCESS_FINGERPRINT_FILE:-}" || {
      [[ $? -eq 2 ]] || automatic_failure
      local started_at finished_at
      started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      write_receipt skipped '"unchanged-scope"' not_started "$started_at" "$finished_at"
      printf '%s\n' 'automatic trigger unchanged; no execution'
      return
    }
  fi

  if [[ "${1:-}" == --authorized-flow ]]; then
    authorized_fixture_contract
    return
  fi

  local started_at finished_at
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_receipt skipped null not_started "$started_at" "$finished_at"
  printf '%s\n' 'local preflight recorded; remote execution is not authorized'
}

main "$@"
