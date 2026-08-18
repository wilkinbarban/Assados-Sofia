import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const wrapperPath = resolve(root, 'ops/systemd/run-slice2-receipt')
const directories: string[] = []

function temporaryDirectory() {
  const directory = mkdtempSync(resolve(tmpdir(), 'slice2-wrapper-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('Slice 2 credential-only wrapper', () => {
  it('fails closed when credential handles are absent without invoking the runner', () => {
    const directory = temporaryDirectory()
    const result = spawnSync('bash', [wrapperPath], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CREDENTIALS_DIRECTORY: directory },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('invalid-credential-handle')
  })

  it('uses only fixed credential handles and a fixed runner invocation', () => {
    const source = readFileSync(wrapperPath, 'utf8')

    expect(source).toContain('$CREDENTIALS_DIRECTORY/staging-secret')
    expect(source).toContain('$CREDENTIALS_DIRECTORY/staging-publishable')
    expect(source).not.toContain('asados.slice2.staging-secret')
    expect(source).not.toContain('asados.slice2.staging-publishable')
    expect(source).toContain('[[ -f "$path" && ! -L "$path" ]]')
    expect(source).toContain('stat -c %u')
    expect(source).toContain('exec "$ROOT/scripts/validate-slice2-hosted-receipt.sh" --authorized-flow')
    expect(source).not.toContain('export STAGING_SECRET')
    expect(source).not.toContain('"$@"')
    expect(source).not.toContain('Environment=')
  })

  it('rejects a writable or injected wrapper path before any runner invocation', () => {
    const directory = temporaryDirectory()
    chmodSync(directory, 0o777)
    const result = spawnSync('bash', [wrapperPath, '--injected-path'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CREDENTIALS_DIRECTORY: directory },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('invalid-wrapper-invocation')
  })
})
