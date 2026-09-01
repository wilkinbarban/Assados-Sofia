import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const script = readFileSync(join(process.cwd(), 'ops/supabase/migrate.sh'), 'utf8')

type HarnessOptions = {
  files?: Record<string, string>
  applied?: string
  fail?: string
  setup?: (project: string) => void
  timeout?: number
}

function runHarness(options: HarnessOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-harness-'))
  const project = join(dir, 'project')
  const bin = join(dir, 'bin')
  const invocationLog = join(dir, 'docker-invocations.log')
  const inputLog = join(dir, 'psql-input.log')
  const argsLog = join(dir, 'docker-args.log')
  mkdirSync(join(project, 'ops', 'supabase'), { recursive: true })
  mkdirSync(join(project, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(bin)
  writeFileSync(join(project, 'ops', 'supabase', 'migrate.sh'), script)
  const files = options.files ?? {
    '0001_first.sql': "select 'migration-0001';\n",
    '0002_second.sql': "select 'migration-0002';\n",
    '0003_third.sql': "select 'migration-0003';\n",
  }
  for (const [filename, contents] of Object.entries(files)) {
    writeFileSync(join(project, 'supabase', 'migrations', filename), contents)
  }
  options.setup?.(project)

  const docker = join(bin, 'docker')
  writeFileSync(docker, `#!/bin/sh
set -eu
printf 'invoked\\n' >> "$HARNESS_INVOCATION_LOG"
printf '%s\\n' "$@" > "$HARNESS_ARGS_LOG"
cat > "$HARNESS_INPUT_LOG"
`)
  chmodSync(docker, 0o755)
  const result = spawnSync('sh', ['ops/supabase/migrate.sh'], {
    cwd: project,
    encoding: 'utf8',
    timeout: options.timeout ?? 2_000,
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HARNESS_INVOCATION_LOG: invocationLog,
      HARNESS_INPUT_LOG: inputLog,
      HARNESS_ARGS_LOG: argsLog,
      HARNESS_APPLIED: options.applied ?? '',
      HARNESS_FAIL: options.fail ?? '',
    },
  })
  return {
    result,
    invocations: existsSync(invocationLog) ? readFileSync(invocationLog, 'utf8').trim().split('\n').filter(Boolean) : [],
    input: existsSync(inputLog) ? readFileSync(inputLog, 'utf8') : '',
    args: existsSync(argsLog) ? readFileSync(argsLog, 'utf8') : '',
    project,
  }
}

function expectRejectedBeforeDocker(sql: string) {
  const run = runHarness({ files: { '0001_unsafe.sql': sql } })
  expect(run.result.status).not.toBe(0)
  expect(run.invocations).toEqual([])
  expect(`${run.result.stdout}${run.result.stderr}`).not.toContain('Application migrations applied')
}

describe('Supabase migration runner', () => {
  it('validates the complete inventory before any Docker or database invocation', () => {
    const run = runHarness({ files: { '0001_valid.sql': 'select 1;\n', '0002_invalid-name.sql': 'select 2;\n' } })
    expect(run.result.status).not.toBe(0)
    expect(run.invocations).toEqual([])
  })

  it('rejects psql metacommands including inline gset before Docker', () => {
    for (const sql of ['\\quit\n', 'select 1 \\gset\n', "select :'allowed' \\gexec\n"]) expectRejectedBeforeDocker(sql)
  })

  it('rejects every single unquoted colon form outside protected lexical regions', () => {
    for (const sql of [
      'select :name;\n',
      "select :'name';\n",
      'select :"name";\n',
      'select :{?probe};\n',
      'select :;\n',
      'select 1:2;\n',
      'select :::integer;\n',
    ]) expectRejectedBeforeDocker(sql)
  })

  it('preserves casts, URLs, and colons inside protected lexical regions', () => {
    const sql = "-- :comment\nselect 1::integer, 'https://example.test/a:b', ':name', $$ :'body' :\"body\" $$;\n"
    const run = runHarness({ files: { '0001_safe.sql': sql } })
    expect(run.result.status).toBe(0)
    expect(run.invocations).toHaveLength(1)
    expect(run.input).toContain('\\i /tmp/asados-migrations/0001_safe.sql')
  })

  it('rejects unsupported E-prefixed and U& strings but preserves their text in protected regions', () => {
    for (const sql of ["select E'back\\\\slash';\n", "select U&'d\\0061t';\n", 'select U&"d\\0061t";\n']) {
      expectRejectedBeforeDocker(sql)
    }
    const run = runHarness({
      files: { '0001_safe.sql': "select 'E''ordinary', 'U& text', $$ E'body' U&'body' $$; -- E'comment'\n" },
    })
    expect(run.result.status).toBe(0)
    expect(run.invocations).toHaveLength(1)
  })

  it('rejects COPY FROM STDIN at statement-token level and preserves COPY words in protected regions', () => {
    for (const sql of [
      'COPY widgets FROM STDIN;\n',
      'copy widgets(id, value) from stdin\n1\tvalue\n',
      'COPY widgets /* gap */ FROM -- gap\n STDIN;\n',
    ]) expectRejectedBeforeDocker(sql)
    const run = runHarness({
      files: { '0001_safe.sql': "select 'COPY x FROM STDIN', $$ COPY y FROM STDIN $$; -- COPY z FROM STDIN\n" },
    })
    expect(run.result.status).toBe(0)
    expect(run.invocations).toHaveLength(1)
  })

  it('rejects transaction and session framing aliases at statement boundaries before Docker', () => {
    for (const sql of [
      'BEGIN;\n',
      'START /* gap */ TRANSACTION;\n',
      'COMMIT;\n',
      'END;\n',
      'ABORT;\n',
      'ROLLBACK;\n',
      "PREPARE TRANSACTION 'tx';\n",
      "COMMIT PREPARED 'tx';\n",
      "ROLLBACK PREPARED 'tx';\n",
      'SAVEPOINT nested;\n',
      'RELEASE SAVEPOINT nested;\n',
      'RELEASE nested;\n',
      'ROLLBACK TO SAVEPOINT nested;\n',
      'ROLLBACK TO nested;\n',
      'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\n',
      'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;\n',
      'select 1; END;\n',
      '\ufeff-- heading\n/* outer /* nested */ comment */ ABORT;\n',
    ]) expectRejectedBeforeDocker(sql)
  })

  it('rejects every unterminated lexical construct before Docker', () => {
    for (const sql of ["select 'open\n", 'select "open\n', 'select $$open\n', 'select /* open\n']) {
      expectRejectedBeforeDocker(sql)
    }
  })

  it('rejects internal and external migration symlinks before Docker', () => {
    for (const target of ['internal', 'external']) {
      const run = runHarness({
        files: target === 'internal' ? { '0001_real.sql': 'select 1;\n' } : {},
        setup(project) {
          const migrations = join(project, 'supabase', 'migrations')
          const destination = target === 'internal'
            ? join(migrations, '0001_real.sql')
            : join(project, 'outside.sql')
          if (target === 'external') writeFileSync(destination, 'select 1;\n')
          symlinkSync(destination, join(migrations, '0002_link.sql'))
        },
      })
      expect(run.result.status).not.toBe(0)
      expect(run.invocations).toEqual([])
    }
  })

  it('does not mistake transaction words in comments, identifiers, strings, or dollar quotes for control', () => {
    const sql = "-- COMMIT; END; ABORT; PREPARE TRANSACTION\nselect 'BEGIN;', \"COMMIT\", $$ ROLLBACK; SAVEPOINT x; $$;\nselect begin_at, end_state, abort_reason, prepare_transaction_at from audit;\n"
    const run = runHarness({ files: { '0001_safe.sql': sql } })
    expect(run.result.status).toBe(0)
    expect(run.invocations).toHaveLength(1)
  })

  it('accepts the current repository migration inventory under the conservative contract', () => {
    const migrations = join(process.cwd(), 'supabase', 'migrations')
    const files = Object.fromEntries(
      readdirSync(migrations)
        .filter(filename => filename.endsWith('.sql'))
        .map(filename => [filename, readFileSync(join(migrations, filename), 'utf8')]),
    )
    const run = runHarness({ files, timeout: 30_000 })
    expect(run.result.status).toBe(0)
    expect(run.invocations).toHaveLength(1)
  }, 30_000)

  it('uses one psql session, a run-wide advisory lock, and ordered native includes', () => {
    const run = runHarness()
    expect(run.result.status).toBe(0)
    expect(run.invocations).toHaveLength(1)
    expect(run.input).toContain('pg_advisory_lock')
    expect(run.input).toContain('ON_ERROR_STOP')
    const includes = [...run.input.matchAll(/\\i \/tmp\/asados-migrations\/(\d+_[A-Za-z0-9_]+\.sql)/g)].map(match => match[1])
    expect(includes).toEqual(['0001_first.sql', '0002_second.sql', '0003_third.sql'])
    expect(run.input).toMatch(/BEGIN;[\s\S]*\\i \/tmp\/asados-migrations\/0001_first\.sql[\s\S]*insert into supabase_migrations\.schema_migrations[\s\S]*COMMIT;/i)
  })

  it('bind-mounts the validated host inventory read-only at the exact included container path', () => {
    const run = runHarness()
    expect(run.result.status).toBe(0)
    expect(run.args).toContain('run\n--rm\n-T\n--no-deps\n')
    expect(run.args).toContain(`${run.project}/supabase/migrations:/migration-source:ro`)
    expect(run.args).toContain('--entrypoint\nsh\n')
    expect(run.args).toContain('sha256sum -c -')
    expect(run.input).not.toContain("select 'migration-0001'")
    expect(run.input).not.toContain(`${run.project}/supabase/migrations`)
  })

  it('creates per-migration skip guards and atomic ledger framing', () => {
    const run = runHarness()
    expect(run.result.status).toBe(0)
    expect(run.input.match(/select exists \(/g)).toHaveLength(3)
    expect(run.input.match(/\\if :applied/g)).toHaveLength(3)
    expect(run.input.match(/BEGIN;/g)).toHaveLength(3)
    expect(run.input.match(/COMMIT;/g)).toHaveLength(3)
  })

  it('treats an empty inventory as a successful locked no-op', () => {
    const run = runHarness({ files: {} })
    expect(run.result.status).toBe(0)
    expect(run.invocations).toHaveLength(1)
    expect(run.input).toContain('pg_advisory_lock')
    expect(run.input).not.toContain('\\i /tmp/asados-migrations/')
  })

  it('enables stop-on-error and does not expose credentials', () => {
    const run = runHarness()
    expect(run.args).toContain('exec psql -U postgres -d postgres -v ON_ERROR_STOP=1')
    expect(`${run.result.stdout}${run.result.stderr}${run.args}${run.input}`).not.toMatch(/password|secret|token/i)
  })
})
