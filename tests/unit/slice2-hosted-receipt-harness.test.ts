import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const harnessPath = resolve(root, 'scripts/validate-slice2-hosted-receipt.sh')
const ref = 'mhoqwjatrendnhfnwewv'
const temporaryDirectories: string[] = []

function temporaryDirectory() {
  const directory = mkdtempSync(resolve(tmpdir(), 'slice2-receipt-test-'))
  temporaryDirectories.push(directory)
  return directory
}

const lifecycleCurlDouble = `#!/usr/bin/env bash
config='' payload='' method='' output='' url=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) config="$2"; shift 2; continue ;;
    --data-binary) payload="\${2#@}"; shift 2; continue ;;
    -X) method="$2"; shift 2; continue ;;
    -o) output="$2"; shift 2; continue ;;
    https://*) url="$1" ;;
  esac
  shift
done
[[ -z "\${REQUEST_LOG:-}" ]] || printf '%s %s\n' "$method" "$url" >>"$REQUEST_LOG"
if [[ -n "\${CLEANUP_FAILURE_STEP:-}" ]]; then
  cleanup_step=''
  case "$method $url" in
    *'DELETE '*'/storage/v1/object/'*) cleanup_step=storage-object-delete ;;
    *'DELETE '*'/rest/v1/produto_imagem_cleanup_pendentes?'*) cleanup_step=pending-record-delete ;;
    *'DELETE '*'/rest/v1/produtos?'*) cleanup_step=product-delete ;;
    *'DELETE '*'/auth/v1/admin/users/'*) cleanup_step=auth-user-delete ;;
    *'GET '*'/auth/v1/admin/users/'*) cleanup_step=auth-user-readback ;;
    *'GET '*'/rest/v1/produtos?'*) cleanup_step=product-readback ;;
  esac
  if [[ "$cleanup_step" == "$CLEANUP_FAILURE_STEP" ]]; then
    printf '{"code":"LEAK_CODE","message":"LEAK_SENTINEL %s"}' "$url" >"$output"
    printf 400
    exit 0
  fi
fi
case "$method $url" in
  *'POST '*'/auth/v1/admin/users') : >"$output"; printf 200 ;;
  *'PATCH '*'/rest/v1/perfis?'*) : >"$output"; printf 204 ;;
  *'GET '*'/rest/v1/perfis?'*) id="\${url#*id=eq.}"; id="\${id%%&*}"; printf '[{"id":"%s","funcao":"admin","ativo":true}]' "$id" >"$output"; printf 200 ;;
  *'POST '*'/auth/v1/token?grant_type=password') if [[ "\${PASSWORD_GRANT_STATUS:-200}" != 200 ]]; then : >"$output"; printf '%s' "$PASSWORD_GRANT_STATUS"; elif grep -q 'slice2-denied' "$payload"; then printf '{"access_token":"denied-token"}' >"$output"; printf 200; else printf '{"access_token":"admin-token"}' >"$output"; printf 200; fi ;;
  *'POST '*'/rest/v1/produtos') : >"$output"; printf 201 ;;
  *'POST '*'/storage/v1/object/'*) : >"$output"; printf 200 ;;
  *'POST '*'/rest/v1/rpc/registrar_limpeza_imagem_pendente') printf '{"id":"11111111-1111-1111-1111-111111111111"}' >"$output"; printf 200 ;;
  *'POST '*'/rest/v1/rpc/substituir_imagem_produto') if grep -q 'denied-token' "$config"; then printf 'USUARIO_NAO_AUTORIZADO' >"$output"; printf 403; else : >"$output"; printf 200; fi ;;
  *'POST '*'/rest/v1/rpc/'*) : >"$output"; printf 200 ;;
  *'DELETE '*'/storage/v1/object/'*) : >"$output"; printf 200 ;;
  *'DELETE '*) : >"$output"; printf 204 ;;
  *'GET '*'/auth/v1/admin/users/'*) : >"$output"; printf "\${CLEANUP_READBACK_STATUS:-404}" ;;
  *'GET '*'/rest/v1/produtos?'*) printf '[]' >"$output"; printf 200 ;;
  *) : >"$output"; printf 500 ;;
esac
`

function runHarness(directory: string, environment: Record<string, string | undefined> = {}, command = '--preflight') {
  return spawnSync('bash', [harnessPath, command], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      STAGING_BASELINE_REF: ref,
      STAGING_TARGET_REF: ref,
      STAGING_TARGET_IDENTITY: `staging:${ref}`,
      RECEIPT_DIR: directory,
      SLICE2_LOCK_ROOT: directory,
      TMPDIR: directory,
      ...environment,
    },
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Slice 2 staging receipt runner contract', () => {
  it('persists a redacted unsafe-target failure receipt before refusing unsafe targets', () => {
    for (const environment of [
      { STAGING_TARGET_REF: undefined },
      { STAGING_TARGET_REF: 'xvzdxoktwnzmxsfizkxo' },
      { STAGING_TARGET_REF: 'ponmlkjihgfedcbazyxw' },
    ]) {
      const directory = temporaryDirectory()
      const result = runHarness(directory, environment)
      const [receiptName] = readdirSync(directory)
      const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('unsafe-target')
      expect(receipt).toMatchObject({
        outcome: 'failure',
        category: 'unsafe-target',
        cleanup: 'not_started',
      })
    }
  })

  it('persists a redacted drift failure receipt for manual manifest drift', () => {
    const directory = temporaryDirectory()
    const manifestDrift = runHarness(directory, { APPROVED_MANIFEST_FINGERPRINT: '0'.repeat(64) })
    const [receiptName] = readdirSync(directory)
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

    expect(manifestDrift.status).toBe(1)
    expect(manifestDrift.stderr).toContain('drift')
    expect(receipt).toMatchObject({
      trigger: 'manual',
      outcome: 'failure',
      category: 'drift',
      cleanup: 'not_started',
    })
  })

  it('persists a redacted lock-held failure receipt before scenarios execute', () => {
    const directory = temporaryDirectory()
    const lockDirectory = resolve(directory, `slice2-receipt-${ref}.lock`)

    try {
      mkdirSync(lockDirectory)
      const locked = runHarness(directory)
      const [receiptName] = readdirSync(directory)
      const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

      expect(locked.status).toBe(1)
      expect(locked.stderr).toContain('lock-held')
      expect(receipt).toMatchObject({
        trigger: 'manual',
        outcome: 'failure',
        category: 'lock-held',
        cleanup: 'not_started',
      })
    } finally {
      rmSync(lockDirectory, { recursive: true, force: true })
    }
  })

  it('does not remove a lock whose recorded owner is alive', () => {
    const directory = temporaryDirectory()
    const lockDirectory = resolve(directory, `slice2-receipt-${ref}.lock`)
    const owner = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
    owner.unref()
    const ownerPid = String(owner.pid)

    try {
      mkdirSync(lockDirectory)
      writeFileSync(resolve(lockDirectory, 'owner.pid'), `${ownerPid}\n`)
      const locked = runHarness(directory)
      const [receiptName] = readdirSync(directory)
      const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

      expect(locked.status).toBe(1)
      expect(receipt.category).toBe('lock-held')
      expect(readFileSync(resolve(lockDirectory, 'owner.pid'), 'utf8')).toBe(`${ownerPid}\n`)
    } finally {
      if (ownerPid) process.kill(Number(ownerPid), 'SIGKILL')
      rmSync(lockDirectory, { recursive: true, force: true })
    }
  })

  it('recovers a lock only when its recorded owner is definitively dead', () => {
    const directory = temporaryDirectory()
    const lockDirectory = resolve(directory, `slice2-receipt-${ref}.lock`)
    mkdirSync(lockDirectory)
    writeFileSync(resolve(lockDirectory, 'owner.pid'), '999999999\n')

    const recovered = runHarness(directory)
    const [receiptName] = readdirSync(directory)
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

    expect(recovered.status).toBe(0)
    expect(receipt.outcome).toBe('skipped')
    expect(readdirSync(directory)).not.toContain(`slice2-receipt-${ref}.lock`)
  })

  it('fails closed without removing locks with missing or malformed owner metadata', () => {
    for (const ownerMetadata of [undefined, 'not-a-pid\n']) {
      const directory = temporaryDirectory()
      const lockDirectory = resolve(directory, `slice2-receipt-${ref}.lock`)
      mkdirSync(lockDirectory)
      if (ownerMetadata) writeFileSync(resolve(lockDirectory, 'owner.pid'), ownerMetadata)

      const locked = runHarness(directory)
      const [receiptName] = readdirSync(directory)
      const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

      expect(locked.status).toBe(1)
      expect(receipt.category).toBe('lock-held')
      expect(readdirSync(directory)).toContain(`slice2-receipt-${ref}.lock`)
    }
  })

  it('persists a redacted failure receipt before rejecting an invalid trigger', () => {
    for (const trigger of ['untrusted-trigger-value', 'automatic ']) {
      const directory = temporaryDirectory()
      const result = runHarness(directory, { RECEIPT_TRIGGER: trigger })
      const [receiptName] = readdirSync(directory)
      const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('unsafe-target')
      expect(receipt).toMatchObject({
        trigger: 'invalid',
        outcome: 'failure',
        category: 'unsafe-target',
        cleanup: 'not_started',
      })
      expect(JSON.stringify(receipt)).not.toContain(trigger)
    }
  })

  it('runs manual preflight despite an unchanged fingerprint and writes an automatic unchanged-scope receipt', () => {
    const directory = temporaryDirectory()
    const manual = runHarness(directory)
    const [receiptName] = readdirSync(directory)
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))
    const priorFingerprint = resolve(directory, 'prior-fingerprint')

    expect(manual.status).toBe(0)
    expect(receipt.trigger).toBe('manual')
    expect(receipt.outcome).toBe('skipped')
    expect(receipt.fingerprint).toMatch(/^[a-f0-9]{64}$/)

    writeFileSync(priorFingerprint, `${receipt.fingerprint}\n`)
    const automatic = runHarness(directory, {
      RECEIPT_TRIGGER: 'automatic',
      PRIOR_SUCCESS_FINGERPRINT_FILE: priorFingerprint,
    })

    expect(automatic.status).toBe(0)
    expect(automatic.stdout).toContain('automatic trigger unchanged; no execution')
    expect(readdirSync(directory)).toHaveLength(3)
    const automaticReceiptName = readdirSync(directory).find((name) => name.endsWith('.json') && name !== receiptName)
    const automaticReceipt = JSON.parse(readFileSync(resolve(directory, automaticReceiptName!), 'utf8'))

    expect(automaticReceipt).toMatchObject({
      trigger: 'automatic',
      outcome: 'skipped',
      category: 'unchanged-scope',
      fingerprint: receipt.fingerprint,
    })
  }, 10_000)

  it('fails closed with a durable redacted receipt when automatic prior fingerprint state is unsafe', () => {
    const directory = temporaryDirectory()
    const invalidFingerprint = resolve(directory, 'invalid-fingerprint')
    const directoryFingerprint = resolve(directory, 'prior-fingerprint-directory')
    const unreadableFingerprint = resolve(directory, 'unreadable-fingerprint')

    writeFileSync(invalidFingerprint, 'not-a-fingerprint\n')
    writeFileSync(unreadableFingerprint, `${'0'.repeat(64)}\n`)
    chmodSync(unreadableFingerprint, 0)
    mkdirSync(directoryFingerprint)

    try {
      for (const priorFingerprint of [
        resolve(directory, 'missing-prior-fingerprint'),
        directoryFingerprint,
        invalidFingerprint,
        unreadableFingerprint,
      ]) {
        const receiptDirectory = resolve(directory, `receipt-${priorFingerprint.split('/').pop()}`)
        mkdirSync(receiptDirectory)
        const result = runHarness(receiptDirectory, {
          RECEIPT_TRIGGER: 'automatic',
          PRIOR_SUCCESS_FINGERPRINT_FILE: priorFingerprint,
        })
        const [receiptName] = readdirSync(receiptDirectory)
        const receipt = JSON.parse(readFileSync(resolve(receiptDirectory, receiptName), 'utf8'))

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('drift')
        expect(receipt).toMatchObject({
          trigger: 'automatic',
          outcome: 'failure',
          category: 'drift',
          cleanup: 'not_started',
        })
      }
    } finally {
      chmodSync(unreadableFingerprint, 0o600)
    }
  })

  it('allows automatic preflight only when a valid prior fingerprint differs from the current one', () => {
    const directory = temporaryDirectory()
    const priorFingerprint = resolve(directory, 'prior-fingerprint')

    writeFileSync(priorFingerprint, `${'0'.repeat(64)}\n`)
    const result = runHarness(directory, {
      RECEIPT_TRIGGER: 'automatic',
      PRIOR_SUCCESS_FINGERPRINT_FILE: priorFingerprint,
    })
    const [receiptName] = readdirSync(directory)
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

    expect(result.status).toBe(0)
    expect(receipt).toMatchObject({
      trigger: 'automatic',
      outcome: 'skipped',
      category: null,
      cleanup: 'not_started',
    })
  })

  it('emits only allowlisted redacted receipt fields and cannot report success without proven cleanup', () => {
    const directory = temporaryDirectory()
    const result = runHarness(directory)
    const receiptName = readdirSync(directory).find((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName!), 'utf8'))

    expect(result.status).toBe(0)
    expect(Object.keys(receipt).sort()).toEqual([
      'attempt_id', 'category', 'cleanup', 'fingerprint', 'finished_at', 'outcome',
      'revision', 'scenario_statuses', 'started_at', 'target_identity', 'trigger',
    ])
    expect(receipt.cleanup).toBe('not_started')
    expect(receipt.outcome).not.toBe('success')
    expect(JSON.stringify(receipt)).not.toContain('SERVICE_ROLE_KEY')
  })

  it('forbids legacy Auth SQL, CLI lookup, systemd setup, secret output, and unbounded commands', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).not.toContain('psql')
    expect(source).not.toMatch(/auth\.[a-z_]+/i)
    expect(source).not.toContain('projects api-keys')
    expect(source).not.toContain('systemctl')
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(source).toContain('timeout "$COMMAND_TIMEOUT_SECONDS"')
    expect(source).toContain('readonly RECEIPT_RETENTION_DAYS=30')
  })

  it('binds authorized execution to the exact staging identity and systemd credential directory', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain("readonly AUTHORIZED_STAGING_REF='mhoqwjatrendnhfnwewv'")
    expect(source).toContain('[[ "$STAGING_BASELINE_REF" == "$AUTHORIZED_STAGING_REF" ]]')
    expect(source).toContain('[[ "$STAGING_TARGET_REF" == "$AUTHORIZED_STAGING_REF" ]]')
    expect(source).toContain('"$CREDENTIALS_DIRECTORY/staging-secret"')
    expect(source).toContain('"$CREDENTIALS_DIRECTORY/staging-publishable"')
    expect(source).not.toContain('asados.slice2.staging-secret')
    expect(source).not.toContain('asados.slice2.staging-publishable')
    expect(source).toContain('[[ "${RECEIPT_EXECUTION:-}" == authorized ]]')
  })

  it('defines a fail-closed fixture lifecycle without passing credentials as curl arguments', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain('create_fixture_user')
    expect(source).toContain('sign_in_fixture_user')
    expect(source).toContain("readonly NORMAL_SIGN_IN_EXPECTATION='password'")
    expect(source).toContain('POST "/auth/v1/token?grant_type=$NORMAL_SIGN_IN_EXPECTATION"')
    expect(source).not.toContain('grant_type=password-grant')
    expect(source).toContain('run_authenticated_scenarios')
    expect(source).toContain('run_denied_role_scenarios')
    expect(source).toContain('cleanup_fixture_users')
    expect(source).toContain('verify_fixture_cleanup')
    expect(source).toContain('finally_cleanup')
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('fails with a redacted receipt before the authorized contract can access an absent credential directory', () => {
    const directory = temporaryDirectory()
    const result = runHarness(directory, { RECEIPT_EXECUTION: 'authorized' }, '--authorized-flow')
    const [receiptName] = readdirSync(directory)
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName), 'utf8'))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('unexpected-status')
    expect(receipt).toMatchObject({
      outcome: 'failure',
      category: 'unexpected-status',
      cleanup: 'not_started',
    })
  })

  it('defines the real bounded Storage and lifecycle RPC probe contract', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain("readonly STORAGE_BUCKET='produto-imagens'")
    expect(source).toContain('substituir_imagem_produto')
    expect(source).toContain('registrar_limpeza_imagem_pendente')
    expect(source).toContain('obter_limpeza_imagem_pendente')
    expect(source).toContain('falhar_limpeza_imagem_pendente')
    expect(source).toContain('concluir_limpeza_imagem_pendente')
    expect(source).toContain('USUARIO_NAO_AUTORIZADO')
    expect(source).toContain('timeout "$HTTP_TIMEOUT_SECONDS" curl')
    expect(source).toContain('finally_cleanup && cleanup=proven')
  })

  it('promotes only the admin fixture profile through the service path and verifies it before probes', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain('promote_fixture_profile')
    expect(source).toContain('PATCH "/rest/v1/perfis?id=eq.$id"')
    expect(source).toContain('"funcao":"admin","ativo":true')
    expect(source).toContain('GET "/rest/v1/perfis?id=eq.$id&select=id,funcao,ativo"')
    expect(source).toContain('"funcao":"admin"')
    expect(source).toContain('"ativo":true')
    expect(source).toContain('fixture_user_ids+=("${fixture_admin_credentials%%:*}")')
    expect(source).toContain('promote_fixture_profile "$fixture_admin_credentials" && fixture_denied_credentials=')
  })

  it('installs an interruption-safe cleanup trap that preserves exit status after fixtures exist', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain('cleanup_on_exit()')
    expect(source).toContain("trap 'cleanup_on_exit' EXIT")
    expect(source).toContain("trap 'exit 130' INT")
    expect(source).toContain("trap 'exit 143' TERM HUP")
    expect(source).toContain("trap '' INT TERM HUP")
    expect(source).toContain('fixture_cleanup_finalized" == false')
    expect(source).toContain('${#fixture_user_ids[@]} -gt 0 || -n "$fixture_product_id" || ${#fixture_object_paths[@]} -gt 0')
    expect(source).toContain('finally_cleanup >/dev/null 2>&1 || true')
    expect(source).toContain('release_lock')
  })

  it('cleans up a created fixture after SIGTERM during profile verification without exposing credentials', async () => {
    const directory = temporaryDirectory()
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    const requestLog = resolve(directory, 'requests.log')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'staging-secret')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'staging-publishable')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    writeFileSync(resolve(bin, 'curl'), `#!/usr/bin/env bash
method='' output='' url=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    -X) method="$2"; shift 2; continue ;;
    -o) output="$2"; shift 2; continue ;;
    https://*) url="$1" ;;
  esac
  shift
done
printf '%s %s\\n' "$method" "$url" >>"$REQUEST_LOG"
if [[ "$method $url" == *'GET '*'/rest/v1/perfis?'* ]]; then
  id="\${url#*id=eq.}"; id="\${id%%&*}"
  printf '[{"id":"%s","funcao":"admin","ativo":true}]' "$id" >"$output"
  parent_pid="$(ps -o ppid= -p "$PPID" | tr -d ' ')"
  kill -TERM "$parent_pid"
  printf 200
elif [[ "$method $url" == *'GET '*'/auth/v1/admin/users/'* ]]; then
  : >"$output"; printf 404
else
  : >"$output"
  [[ "$method" == PATCH || "$method" == DELETE ]] && printf 204 || printf 200
fi
`)
    chmodSync(resolve(bin, 'stat'), 0o755)
    chmodSync(resolve(bin, 'curl'), 0o755)

    const child = spawn('bash', [harnessPath, '--authorized-flow'], {
      cwd: root,
      env: {
        ...process.env,
        STAGING_BASELINE_REF: ref,
        STAGING_TARGET_REF: ref,
        STAGING_TARGET_IDENTITY: `staging:${ref}`,
        RECEIPT_DIR: directory,
        SLICE2_LOCK_ROOT: directory,
        TMPDIR: directory,
        RECEIPT_EXECUTION: 'authorized',
        CREDENTIALS_DIRECTORY: credentials,
        REQUEST_LOG: requestLog,
        PATH: `${bin}:${process.env.PATH}`,
      },
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    const exitCode = await new Promise<number | null>((resolvePromise) => child.on('exit', resolvePromise))
    expect(stderr).toBe('')
    const requests = readFileSync(requestLog, 'utf8')
    const receiptName = readdirSync(directory).find((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName!), 'utf8'))
    const attribution = JSON.parse(readFileSync(resolve(directory, '.attribution', `${receipt.attempt_id}.json`), 'utf8'))

    expect(exitCode).toBe(143)
    expect(requests).toContain('PATCH https://mhoqwjatrendnhfnwewv.supabase.co/rest/v1/perfis?id=eq.')
    expect(requests).toContain('GET https://mhoqwjatrendnhfnwewv.supabase.co/rest/v1/perfis?id=eq.')
    expect(requests).toContain('DELETE https://mhoqwjatrendnhfnwewv.supabase.co/auth/v1/admin/users/')
    expect(receipt).toMatchObject({ outcome: 'failure', category: 'interrupted' })
    expect(attribution.cleanup.user_ids).toHaveLength(1)
    expect(JSON.stringify(receipt)).not.toContain('staging-secret')
  })

  it('ignores a repeated SIGTERM once cleanup starts so it verifies cleanup and releases the lock', async () => {
    const directory = temporaryDirectory()
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    const requestLog = resolve(directory, 'requests.log')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'staging-secret')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'staging-publishable')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    writeFileSync(resolve(bin, 'curl'), `#!/usr/bin/env bash
method='' output='' url=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    -X) method="$2"; shift 2; continue ;;
    -o) output="$2"; shift 2; continue ;;
    https://*) url="$1" ;;
  esac
  shift
done
printf '%s %s\\n' "$method" "$url" >>"$REQUEST_LOG"
if [[ "$method $url" == *'GET '*'/rest/v1/perfis?'* ]]; then
  id="\${url#*id=eq.}"; id="\${id%%&*}"
  printf '[{"id":"%s","funcao":"admin","ativo":true}]' "$id" >"$output"
  parent_pid="$(ps -o ppid= -p "$PPID" | tr -d ' ')"
  kill -TERM "$parent_pid"
  printf 200
elif [[ "$method $url" == *'DELETE '*'/auth/v1/admin/users/'* ]]; then
  parent_pid="$(ps -o ppid= -p "$PPID" | tr -d ' ')"
  kill -TERM "$parent_pid"
  : >"$output"; printf 204
elif [[ "$method $url" == *'GET '*'/auth/v1/admin/users/'* ]]; then
  : >"$output"; printf 404
else
  : >"$output"
  [[ "$method" == PATCH || "$method" == DELETE ]] && printf 204 || printf 200
fi
`)
    chmodSync(resolve(bin, 'stat'), 0o755)
    chmodSync(resolve(bin, 'curl'), 0o755)

    const child = spawn('bash', [harnessPath, '--authorized-flow'], {
      cwd: root,
      env: {
        ...process.env,
        STAGING_BASELINE_REF: ref,
        STAGING_TARGET_REF: ref,
        STAGING_TARGET_IDENTITY: `staging:${ref}`,
        RECEIPT_DIR: directory,
        SLICE2_LOCK_ROOT: directory,
        TMPDIR: directory,
        RECEIPT_EXECUTION: 'authorized',
        CREDENTIALS_DIRECTORY: credentials,
        REQUEST_LOG: requestLog,
        PATH: `${bin}:${process.env.PATH}`,
      },
    })

    const exitCode = await new Promise<number | null>((resolvePromise) => child.on('exit', resolvePromise))
    const requests = readFileSync(requestLog, 'utf8')
    const receiptName = readdirSync(directory).find((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName!), 'utf8'))

    expect(exitCode).toBe(143)
    expect(requests).toContain('DELETE https://mhoqwjatrendnhfnwewv.supabase.co/auth/v1/admin/users/')
    expect(requests).toContain('GET https://mhoqwjatrendnhfnwewv.supabase.co/auth/v1/admin/users/')
    expect(readdirSync(directory)).not.toContain(`slice2-receipt-${ref}.lock`)
    expect(receipt).toMatchObject({ outcome: 'failure', category: 'interrupted' })
  })

  it('uses local HTTP doubles to fail closed with a redacted receipt when fixture creation is rejected', () => {
    const directory = temporaryDirectory()
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'staging-secret')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'staging-publishable')
    writeFileSync(resolve(bin, 'curl'), '#!/usr/bin/env bash\nprintf 500\n')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    chmodSync(resolve(bin, 'curl'), 0o755)
    chmodSync(resolve(bin, 'stat'), 0o755)

    const result = runHarness(directory, {
      RECEIPT_EXECUTION: 'authorized',
      CREDENTIALS_DIRECTORY: credentials,
      PATH: `${bin}:${process.env.PATH}`,
    }, '--authorized-flow')
    const receiptName = readdirSync(directory).find((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName!), 'utf8'))

    expect(result.status).toBe(1)
    expect(receipt).toMatchObject({ outcome: 'failure', category: 'unexpected-status', cleanup: 'proven' })
    expect(JSON.stringify(receipt)).not.toContain('staging-secret')
  })

  it('sends password sign-in only to the Supabase password grant through a local curl double', () => {
    const directory = temporaryDirectory()
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    const requestLog = resolve(directory, 'requests.log')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'staging-secret')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'staging-publishable')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    writeFileSync(resolve(bin, 'curl'), `#!/usr/bin/env bash
method='' output='' url=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    -X) method="$2"; shift 2; continue ;;
    -o) output="$2"; shift 2; continue ;;
    https://*) url="$1" ;;
  esac
  shift
done
printf '%s %s\\n' "$method" "$url" >>"$REQUEST_LOG"
case "$method $url" in
  *'POST https://mhoqwjatrendnhfnwewv.supabase.co/auth/v1/admin/users') : >"$output"; printf 200 ;;
  *'PATCH https://mhoqwjatrendnhfnwewv.supabase.co/rest/v1/perfis?'*) : >"$output"; printf 204 ;;
  *'GET https://mhoqwjatrendnhfnwewv.supabase.co/rest/v1/perfis?'*) id="\${url#*id=eq.}"; id="\${id%%&*}"; printf '[{"id":"%s","funcao":"admin","ativo":true}]' "$id" >"$output"; printf 200 ;;
  *'POST https://mhoqwjatrendnhfnwewv.supabase.co/auth/v1/token?grant_type=password') printf '{"access_token":"local-token"}' >"$output"; printf 200 ;;
  *'POST https://mhoqwjatrendnhfnwewv.supabase.co/auth/v1/token?'*) : >"$output"; printf 400 ;;
  *'DELETE '*) : >"$output"; printf 204 ;;
  *'GET https://mhoqwjatrendnhfnwewv.supabase.co/auth/v1/admin/users/'*) : >"$output"; printf 404 ;;
  *) : >"$output"; printf 500 ;;
esac
`)
    chmodSync(resolve(bin, 'stat'), 0o755)
    chmodSync(resolve(bin, 'curl'), 0o755)

    const result = runHarness(directory, {
      RECEIPT_EXECUTION: 'authorized',
      CREDENTIALS_DIRECTORY: credentials,
      REQUEST_LOG: requestLog,
      PATH: `${bin}:${process.env.PATH}`,
    }, '--authorized-flow')

    const requests = readFileSync(requestLog, 'utf8')
    expect(result.status).toBe(1)
    expect(requests).toContain('POST https://mhoqwjatrendnhfnwewv.supabase.co/auth/v1/token?grant_type=password')
    expect(requests).not.toContain('grant_type=password-grant')
  }, 10_000)

  it('records nonempty allowlisted 2xx and denied 4xx scenario statuses in a successful receipt', () => {
    const directory = temporaryDirectory()
    const priorFingerprint = resolve(directory, 'prior-fingerprint')
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'staging-secret')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'staging-publishable')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    writeFileSync(resolve(bin, 'curl'), lifecycleCurlDouble)
    chmodSync(resolve(bin, 'stat'), 0o755)
    chmodSync(resolve(bin, 'curl'), 0o755)

    const result = runHarness(directory, {
      RECEIPT_EXECUTION: 'authorized',
      PRIOR_SUCCESS_FINGERPRINT_FILE: priorFingerprint,
      CREDENTIALS_DIRECTORY: credentials,
      PATH: `${bin}:${process.env.PATH}`,
    }, '--authorized-flow')
    const receiptName = readdirSync(directory).find((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName!), 'utf8'))

    expect(result.status).toBe(0)
    expect(receipt).toMatchObject({ outcome: 'success', category: null, cleanup: 'proven' })
    expect(readFileSync(priorFingerprint, 'utf8')).toBe(`${receipt.fingerprint}\n`)
    expect(receipt.scenario_statuses).toEqual([
      { scenario: 'authenticated-product-create', status_class: '2xx' },
      { scenario: 'authenticated-storage-upload', status_class: '2xx' },
      { scenario: 'authenticated-rpc-substitute', status_class: '2xx' },
      { scenario: 'authenticated-rpc-register-cleanup', status_class: '2xx' },
      { scenario: 'authenticated-rpc-get-cleanup', status_class: '2xx' },
      { scenario: 'authenticated-rpc-fail-cleanup', status_class: '2xx' },
      { scenario: 'authenticated-rpc-complete-cleanup', status_class: '2xx' },
      { scenario: 'denied-rpc-substitute', status_class: '4xx', error_code: 'USUARIO_NAO_AUTORIZADO' },
    ])
    expect(new Set(receipt.scenario_statuses.map((status: { scenario: string }) => status.scenario)).size).toBe(8)
  }, 10_000)

  it('cleans up both fixtures and writes a redacted failure receipt when password grant fails', () => {
    const directory = temporaryDirectory()
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    const requestLog = resolve(directory, 'requests.log')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'staging-secret')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'staging-publishable')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    writeFileSync(resolve(bin, 'curl'), lifecycleCurlDouble)
    chmodSync(resolve(bin, 'stat'), 0o755)
    chmodSync(resolve(bin, 'curl'), 0o755)

    const result = runHarness(directory, {
      RECEIPT_EXECUTION: 'authorized',
      CREDENTIALS_DIRECTORY: credentials,
      PASSWORD_GRANT_STATUS: '401',
      REQUEST_LOG: requestLog,
      PATH: `${bin}:${process.env.PATH}`,
    }, '--authorized-flow')
    const receiptName = readdirSync(directory).find((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName!), 'utf8'))
    const requests = readFileSync(requestLog, 'utf8')

    expect(result.status).toBe(1)
    expect(receipt).toMatchObject({ outcome: 'failure', category: 'unexpected-status', cleanup: 'proven', scenario_statuses: [] })
    expect(requests.match(/DELETE https:\/\/mhoqwjatrendnhfnwewv\.supabase\.co\/auth\/v1\/admin\/users\//g)).toHaveLength(2)
    expect(requests.match(/GET https:\/\/mhoqwjatrendnhfnwewv\.supabase\.co\/auth\/v1\/admin\/users\//g)).toHaveLength(2)
    expect(requests).not.toContain('/storage/v1/object/')
    expect(requests).not.toContain('/rest/v1/rpc/')
    expect(JSON.stringify(receipt)).not.toContain('staging-secret')
  }, 10_000)

  it('fails identity drift before credential or curl access and writes a redacted preflight receipt', () => {
    const directory = temporaryDirectory()
    const bin = resolve(directory, 'bin')
    const credentials = resolve(directory, 'credentials')
    const requestLog = resolve(directory, 'requests.log')
    const credentialAccessLog = resolve(directory, 'credential-access.log')
    mkdirSync(bin)
    mkdirSync(credentials)
    writeFileSync(resolve(credentials, 'staging-secret'), 'staging-secret')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'staging-publishable')
    writeFileSync(requestLog, '')
    writeFileSync(credentialAccessLog, '')
    writeFileSync(resolve(bin, 'curl'), '#!/usr/bin/env bash\nprintf invoked >>"$REQUEST_LOG"\nexit 99\n')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >>"$CREDENTIAL_ACCESS_LOG"\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    chmodSync(resolve(bin, 'curl'), 0o755)
    chmodSync(resolve(bin, 'stat'), 0o755)

    const result = runHarness(directory, {
      STAGING_TARGET_IDENTITY: 'staging:ponmlkjihgfedcbazyxw',
      RECEIPT_EXECUTION: 'authorized',
      CREDENTIALS_DIRECTORY: credentials,
      REQUEST_LOG: requestLog,
      CREDENTIAL_ACCESS_LOG: credentialAccessLog,
      PATH: `${bin}:${process.env.PATH}`,
    }, '--authorized-flow')
    const receiptName = readdirSync(directory).find((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName!), 'utf8'))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('drift')
    expect(receipt).toMatchObject({ outcome: 'failure', category: 'drift', cleanup: 'not_started', scenario_statuses: [] })
    expect(readFileSync(credentialAccessLog, 'utf8')).toBe('')
    expect(readFileSync(requestLog, 'utf8')).toBe('')
    expect(JSON.stringify(receipt)).not.toContain('ponmlkjihgfedcbazyxw')
  })

  it('fails closed with durable cleanup-incomplete evidence when deletion read-back cannot prove absence', () => {
    const directory = temporaryDirectory()
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'staging-secret')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'staging-publishable')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    writeFileSync(resolve(bin, 'curl'), lifecycleCurlDouble)
    chmodSync(resolve(bin, 'stat'), 0o755)
    chmodSync(resolve(bin, 'curl'), 0o755)

    const result = runHarness(directory, {
      RECEIPT_EXECUTION: 'authorized',
      CREDENTIALS_DIRECTORY: credentials,
      CLEANUP_READBACK_STATUS: '200',
      PATH: `${bin}:${process.env.PATH}`,
    }, '--authorized-flow')
    const receipts = readdirSync(directory).filter((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receipts[0]), 'utf8'))

    expect(result.status).toBe(1)
    expect(receipts).toHaveLength(1)
    expect(receipt).toMatchObject({ outcome: 'failure', category: 'cleanup-incomplete', cleanup: 'incomplete' })
    expect(receipt.scenario_statuses).toHaveLength(8)
  }, 10_000)

  it('stores cleanup attribution separately from a redacted failure receipt', () => {
    const directory = temporaryDirectory()
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    const attributionDirectory = resolve(directory, 'attributions')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'credential-secret-sentinel')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'credential-publishable-sentinel')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    writeFileSync(resolve(bin, 'curl'), lifecycleCurlDouble)
    chmodSync(resolve(bin, 'stat'), 0o755)
    chmodSync(resolve(bin, 'curl'), 0o755)

    const result = runHarness(directory, {
      RECEIPT_EXECUTION: 'authorized',
      CREDENTIALS_DIRECTORY: credentials,
      RECEIPT_ATTRIBUTION_DIR: attributionDirectory,
      CLEANUP_FAILURE_STEP: 'storage-object-delete',
      PATH: `${bin}:${process.env.PATH}`,
    }, '--authorized-flow')
    const receiptName = readdirSync(directory).find((name) => name.endsWith('.json'))
    const receipt = JSON.parse(readFileSync(resolve(directory, receiptName!), 'utf8'))
    const attribution = JSON.parse(readFileSync(resolve(attributionDirectory, `${receipt.attempt_id}.json`), 'utf8'))

    expect(result.status).toBe(1)
    expect(receipt).toMatchObject({ outcome: 'failure', category: 'cleanup-incomplete', cleanup: 'incomplete' })
    expect(JSON.stringify(receipt)).not.toContain('produtos/')
    expect(attribution).toMatchObject({ attempt_id: receipt.attempt_id })
    expect(attribution.cleanup.object_paths).toHaveLength(2)
    expect(attribution.cleanup.user_ids).toHaveLength(2)
  }, 25_000)

  it.each([
    ['storage-object-delete', ['bucket', 'object_path']],
    ['pending-record-delete', ['cleanup_id']],
    ['product-delete', ['product_id']],
    ['auth-user-delete', ['user_id']],
    ['auth-user-readback', ['user_id']],
    ['product-readback', ['product_id']],
  ])('attributes and redacts an HTTP 400 from cleanup substep %s', (failureStep, parameterNames) => {
    const directory = temporaryDirectory()
    const credentials = resolve(directory, 'credentials')
    const bin = resolve(directory, 'bin')
    mkdirSync(credentials)
    mkdirSync(bin)
    writeFileSync(resolve(credentials, 'staging-secret'), 'credential-secret-sentinel')
    writeFileSync(resolve(credentials, 'staging-publishable'), 'credential-publishable-sentinel')
    writeFileSync(resolve(bin, 'stat'), '#!/usr/bin/env bash\n[[ "$2" == %u ]] && printf 0 || printf 400\n')
    writeFileSync(resolve(bin, 'curl'), lifecycleCurlDouble)
    chmodSync(resolve(bin, 'stat'), 0o755)
    chmodSync(resolve(bin, 'curl'), 0o755)

    const result = runHarness(directory, {
      RECEIPT_EXECUTION: 'authorized',
      CREDENTIALS_DIRECTORY: credentials,
      CLEANUP_FAILURE_STEP: failureStep,
      PATH: `${bin}:${process.env.PATH}`,
    }, '--authorized-flow')
    const diagnostics = result.stderr
      .split('\n')
      .filter((line) => line.startsWith('{"cleanup_step"'))
      .map((line) => JSON.parse(line))
    const failedDiagnostics = diagnostics.filter((diagnostic) => diagnostic.error_code !== null)

    expect(result.status).toBe(1)
    expect(failedDiagnostics.length).toBeGreaterThan(0)
    expect(new Set(failedDiagnostics.map((diagnostic) => diagnostic.cleanup_step))).toEqual(new Set([failureStep]))
    expect(failedDiagnostics[0]).toEqual({
      cleanup_step: failureStep,
      http_status: 400,
      error_code: 'HTTP_400',
      error_message: 'Bad Request',
      parameter_names: parameterNames,
    })
    expect(result.stderr).not.toMatch(/LEAK_SENTINEL|LEAK_CODE|credential-(secret|publishable)-sentinel/)
    expect(JSON.stringify(failedDiagnostics)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/)
    expect(JSON.stringify(failedDiagnostics)).not.toContain(ref)
  }, 15_000)
})
