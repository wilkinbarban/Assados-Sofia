import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const runner = join(root, 'scripts/run_migration.mjs')
const temporaryDirectories: string[] = []
const expectedProjectRef = 'xvzdxoktwnzmxsfizkxo'

function execute(environment: Record<string, string | undefined> = {}, args: string[] = [], cwd = root) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: process.env.NODE_ENV || 'test',
      ...environment,
    },
  })
}

function fakeSupabase() {
  const directory = mkdtempSync(join(tmpdir(), 'asados-supabase-cli-'))
  temporaryDirectories.push(directory)
  const executable = join(directory, 'supabase')
  const argumentsFile = join(directory, 'arguments.txt')
  const contextFile = join(directory, 'context.txt')

  writeFileSync(
    executable,
    `#!/bin/sh\nprintf '%s\\n' "$@" > "${argumentsFile}"\n(pwd; printf '%s\\n' "\${SUPABASE_WORKDIR-unset}") > "${contextFile}"\nprintf 'token=%s password=%s\\n' "$SUPABASE_ACCESS_TOKEN" "$SUPABASE_DB_PASSWORD"\nprintf 'failure token=%s password=%s\\n' "$SUPABASE_ACCESS_TOKEN" "$SUPABASE_DB_PASSWORD" >&2\nexit "\${FAKE_EXIT_CODE:-0}"\n`
  )
  chmodSync(executable, 0o700)

  return { executable, argumentsFile, contextFile }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('credential-safe migration runner', () => {
  it('contains no embedded privileged credential or generic exec_sql path', () => {
    const source = readFileSync(runner, 'utf8')

    expect(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(source)).toBe(false)
    expect(/sb_secret_[A-Za-z0-9_-]+/.test(source)).toBe(false)
    expect(source).not.toContain('exec_sql')
    expect(source).not.toContain('createClient(')
  })

  it('fails closed when process-injected credentials are missing', () => {
    const result = execute({ SUPABASE_PROJECT_REF: expectedProjectRef })

    expect(result.status).toBe(2)
    expect(`${result.stdout}${result.stderr}`).toContain('missing-required-environment')
  })

  it('rejects any production target other than the protected project', () => {
    const { executable } = fakeSupabase()
    const result = execute({
      SUPABASE_PROJECT_REF: 'wrong-project-ref',
      SUPABASE_ACCESS_TOKEN: 'management-token-sentinel',
      SUPABASE_DB_PASSWORD: 'database-password-sentinel',
      SUPABASE_CLI_BIN: executable,
    })

    expect(result.status).toBe(2)
    expect(`${result.stdout}${result.stderr}`).toContain('project-ref-mismatch')
  })

  it('uses the supported linked CLI dry-run and redacts child-process output', () => {
    const { executable, argumentsFile } = fakeSupabase()
    const result = execute({
      SUPABASE_PROJECT_REF: expectedProjectRef,
      SUPABASE_ACCESS_TOKEN: 'management-token-sentinel',
      SUPABASE_DB_PASSWORD: 'database-password-sentinel',
      SUPABASE_CLI_BIN: executable,
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(readFileSync(argumentsFile, 'utf8').trim().split('\n')).toEqual([
      'db',
      'push',
      '--linked',
      '--dry-run',
    ])
    expect(output).not.toContain('management-token-sentinel')
    expect(output).not.toContain('database-password-sentinel')
    expect(output).toContain('[REDACTED]')
  })

  it('anchors execution to the repository and removes inherited workdir overrides', () => {
    const caller = mkdtempSync(join(tmpdir(), 'asados-caller-'))
    temporaryDirectories.push(caller)
    const { executable, contextFile } = fakeSupabase()
    const result = execute(
      {
        SUPABASE_PROJECT_REF: expectedProjectRef,
        SUPABASE_ACCESS_TOKEN: 'management-token-sentinel',
        SUPABASE_DB_PASSWORD: 'database-password-sentinel',
        SUPABASE_CLI_BIN: executable,
        SUPABASE_WORKDIR: caller,
      },
      [],
      caller
    )

    expect(result.status).toBe(0)
    expect(readFileSync(contextFile, 'utf8').trim().split('\n')).toEqual([root, 'unset'])
  })

  it('fully redacts overlapping credentials from failed child output', () => {
    const { executable } = fakeSupabase()
    const result = execute({
      SUPABASE_PROJECT_REF: expectedProjectRef,
      SUPABASE_ACCESS_TOKEN: 'overlap-secret',
      SUPABASE_DB_PASSWORD: 'overlap-secret-suffix',
      SUPABASE_CLI_BIN: executable,
      FAKE_EXIT_CODE: '7',
    })
    const output = `${result.stdout}${result.stderr}`
    expect(result.status).toBe(7)
    expect(output).not.toContain('overlap-secret')
    expect(output).not.toContain('-suffix')
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(4)
  })
})
