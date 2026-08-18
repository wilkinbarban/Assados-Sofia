import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const auditPath = resolve(root, 'scripts/audit-slice2-pr3b-boundary.sh')
const temporaryDirectories: string[] = []

function temporaryDirectory() {
  const directory = mkdtempSync(resolve(tmpdir(), 'slice2-pr3b-boundary-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('PR3B dirty-workspace boundary audit', () => {
  it('writes a deterministic, scoped manifest that records the absent pre-change snapshot', () => {
    const output = resolve(temporaryDirectory(), 'boundary.md')
    const result = spawnSync('bash', [auditPath, output], { cwd: root, encoding: 'utf8' })
    const evidence = readFileSync(output, 'utf8')

    expect(result.status).toBe(0)
    expect(evidence).toContain('# PR3B Non-Commit Boundary Evidence')
    expect(evidence).toContain('No pre-change Git snapshot exists for this audit.')
    expect(evidence).toContain('## Known PR3A/PR3B Owned Paths')
    expect(evidence).toContain('## Unrelated Dirty Workspace Paths')
    expect(evidence).toMatch(/`scripts\/validate-slice2-hosted-receipt\.sh` \| `[a-f0-9]{64}` \| [0-9]+/)
  })

  it('does not disclose environment secret values and labels line counts as non-delta estimates', () => {
    const output = resolve(temporaryDirectory(), 'boundary.md')
    const secret = 'boundary-audit-secret-must-not-appear'
    const result = spawnSync('bash', [auditPath, output], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, BOUNDARY_AUDIT_TEST_SECRET: secret },
    })
    const evidence = readFileSync(output, 'utf8')

    expect(result.status).toBe(0)
    expect(evidence).toContain('Current line counts are estimates, not a pre-change diff.')
    expect(evidence).not.toContain(secret)
    expect(evidence).not.toMatch(/(service_role|access[_-]?token|password)\s*[:=]\s*[^\s]+/i)
  })

  it('records a deterministic UTC refresh timestamp from SOURCE_DATE_EPOCH', () => {
    const output = resolve(temporaryDirectory(), 'boundary.md')
    const result = spawnSync('bash', [auditPath, output], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, SOURCE_DATE_EPOCH: '1784064646' },
    })
    const evidence = readFileSync(output, 'utf8')

    expect(result.status).toBe(0)
    expect(evidence).toContain('Refreshed at (UTC): `2026-07-14T21:30:46Z`')
  })
})
