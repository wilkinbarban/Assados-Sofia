import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const script = resolve(root, 'scripts/verify-incident-preconditions.sh')
const directories: string[] = []

function command(cwd: string, ...args: string[]) {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

function output(cwd: string, ...args: string[]) {
  return spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' }).stdout
}

const recoveryArtifacts = ['inventory.txt', 'staged.patch', 'unstaged.patch', 'untracked.tar.gz', 'untracked.manifest', 'repository.bundle', 'restoration-proof.txt', 'QUARANTINE.txt']
function refreshChecksums(recovery: string) {
  writeFileSync(resolve(recovery, 'SHA256SUMS'), `${recoveryArtifacts.map((file) => command(recovery, 'sha256sum', file)).join('\n')}\n`)
}

function fixture(options: { staged?: boolean; unstaged?: boolean; untracked?: boolean; remote?: boolean } = {}) {
  const base = mkdtempSync(resolve(tmpdir(), 'incident-preconditions-'))
  directories.push(base)
  const repo = resolve(base, 'repo')
  const recovery = resolve(base, 'recovery')
  mkdirSync(repo)
  mkdirSync(recovery, { mode: 0o700 })
  command(repo, 'git', 'init', '-q', '-b', 'main')
  command(repo, 'git', 'config', 'user.email', 'test@example.invalid')
  command(repo, 'git', 'config', 'user.name', 'Test')
  writeFileSync(resolve(repo, 'tracked.txt'), 'baseline\n')
  command(repo, 'git', 'add', 'tracked.txt')
  command(repo, 'git', 'commit', '-qm', 'baseline')
  if (options.staged) {
    writeFileSync(resolve(repo, 'tracked.txt'), 'baseline\nstaged\n')
    command(repo, 'git', 'add', 'tracked.txt')
  }
  if (options.unstaged) writeFileSync(resolve(repo, 'tracked.txt'), 'baseline\nstaged\nunstaged\n')
  if (options.untracked) writeFileSync(resolve(repo, 'untracked.txt'), 'untracked\n')
  if (options.remote) command(repo, 'git', 'remote', 'add', 'origin', resolve(base, 'remote.git'))

  const head = command(repo, 'git', 'rev-parse', 'HEAD')
  writeFileSync(resolve(recovery, 'inventory.txt'), `repository=${repo}\nhead=${head}\n`)
  writeFileSync(resolve(recovery, 'staged.patch'), output(repo, 'git', 'diff', '--cached', '--binary'))
  writeFileSync(resolve(recovery, 'unstaged.patch'), output(repo, 'git', 'diff', '--binary'))
  command(repo, 'git', 'bundle', 'create', resolve(recovery, 'repository.bundle'), 'HEAD')
  const manifest = options.untracked ? `${command(repo, 'sha256sum', 'untracked.txt')}\n` : ''
  writeFileSync(resolve(recovery, 'untracked.manifest'), manifest)
  if (options.untracked) command(repo, 'tar', '-czf', resolve(recovery, 'untracked.tar.gz'), 'untracked.txt')
  else command(repo, 'tar', '-czf', resolve(recovery, 'untracked.tar.gz'), '--files-from', '/dev/null')
  writeFileSync(resolve(recovery, 'restoration-proof.txt'), `status=passed\nhead=${head}\n`)
  writeFileSync(resolve(recovery, 'QUARANTINE.txt'), 'destroy after authorized sanitation\n')
  command(base, 'git', 'clone', '-q', repo, resolve(recovery, 'clean-worktree'))
  refreshChecksums(recovery)
  chmodSync(recovery, 0o700)
  return { base, repo, recovery }
}

function run(repo: string, recovery: string, extra: string[] = [], env: Record<string, string | undefined> = {}) {
  return spawnSync('bash', [script, '--repo', repo, '--recovery', recovery, ...extra], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

const publication = ['--remote', 'origin', '--refspec', 'refs/heads/main:refs/heads/main', '--owner', 'maintainer']

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('credential incident preconditions', () => {
  it('accepts only the canonical absolute repository matching the inventory', () => {
    const { repo, recovery } = fixture({ remote: true })
    expect(run(repo, recovery, publication).status).toBe(0)
    expect(run('relative/repo', recovery, publication).stderr).toContain('repository-not-canonical')
    const wrong = fixture({ remote: true })
    expect(run(wrong.repo, recovery, publication).stderr).toContain('repository-mismatch')
  }, 15_000)

  it('requires staged and untracked preservation artifacts while blocking commit -a', () => {
    const staged = fixture({ staged: true, remote: true })
    writeFileSync(resolve(staged.recovery, 'staged.patch'), '')
    expect(run(staged.repo, staged.recovery, publication).stderr).toContain('checksum-invalid')
    const untracked = fixture({ untracked: true, remote: true })
    rmSync(resolve(untracked.recovery, 'untracked.tar.gz'))
    expect(run(untracked.repo, untracked.recovery, publication).stderr).toContain('recovery-incomplete')
    const clean = fixture({ remote: true })
    expect(run(clean.repo, clean.recovery, publication).stdout).toContain('commit-a=blocked')
  }, 15_000)

  it('supports an empty index without weakening recovery validation', () => {
    const { repo, recovery } = fixture({ remote: true })
    const result = run(repo, recovery, publication)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('index=empty')
  })

  it('fails closed for absent remotes and ambiguous tracking or refspec state', () => {
    const absent = fixture()
    expect(run(absent.repo, absent.recovery, publication).stderr).toContain('remote-missing')
    const tracked = fixture({ remote: true })
    command(tracked.repo, 'git', 'config', 'branch.main.remote', 'origin')
    expect(run(tracked.repo, tracked.recovery).stderr).toContain('publication-ambiguous')
  })

  it('allows a first-push state only with an explicit remote, refspec, and owner', () => {
    const { repo, recovery } = fixture({ remote: true })
    expect(command(repo, 'git', 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(run(repo, recovery, publication).status).toBe(0)
  })

  it('requires the action-specific authorization without executing the action', () => {
    const { repo, recovery } = fixture({ remote: true })
    const result = run(repo, recovery, [...publication, '--action', 'rewrite'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('authorization-missing:B1')
  })

  it('never emits environment secret values', () => {
    const { repo, recovery } = fixture({ remote: true })
    const secret = 'synthetic-secret-must-not-appear'
    const result = run(repo, recovery, publication, { INCIDENT_TEST_SECRET: secret })
    expect(result.status).toBe(0)
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret)
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/(token|password|service_role)\s*[:=]\s*\S+/i)
  })

  it('rejects reconstructable-state mismatches instead of accepting non-empty placeholders', () => {
    const fixtureState = fixture({ staged: true, unstaged: true, untracked: true, remote: true })
    const valid = run(fixtureState.repo, fixtureState.recovery, publication)
    expect(valid.status, valid.stderr).toBe(0)
    writeFileSync(resolve(fixtureState.repo, 'tracked.txt'), 'different staged and unstaged content\n')
    expect(run(fixtureState.repo, fixtureState.recovery, publication).stderr).toContain('unstaged-mismatch')
    writeFileSync(resolve(fixtureState.repo, 'untracked.txt'), 'different untracked content\n')
    expect(run(fixtureState.repo, fixtureState.recovery, publication).stderr).toMatch(/(unstaged|untracked)-mismatch/)
  })

  it('verifies bundles and proves restoration rather than trusting a status record', () => {
    const state = fixture({ staged: true, unstaged: true, untracked: true, remote: true })
    writeFileSync(resolve(state.recovery, 'repository.bundle'), 'not-a-bundle\n')
    refreshChecksums(state.recovery)
    expect(run(state.repo, state.recovery, publication).stderr).toContain('bundle-invalid')
  })

  it('rejects malformed, traversing, and content-mismatched untracked archives', () => {
    const malformed = fixture({ untracked: true, remote: true })
    writeFileSync(resolve(malformed.recovery, 'untracked.tar.gz'), 'not-an-archive\n'); refreshChecksums(malformed.recovery)
    expect(run(malformed.repo, malformed.recovery, publication).stderr).toContain('archive-invalid')
    const traversal = fixture({ untracked: true, remote: true })
    command(traversal.repo, 'tar', '-czf', resolve(traversal.recovery, 'untracked.tar.gz'), '--transform', 's|untracked.txt|../escape.txt|', 'untracked.txt'); refreshChecksums(traversal.recovery)
    expect(run(traversal.repo, traversal.recovery, publication).stderr).toContain('archive-invalid')
    const mismatch = fixture({ untracked: true, remote: true })
    writeFileSync(resolve(mismatch.repo, 'untracked.txt'), 'other\n'); command(mismatch.repo, 'tar', '-czf', resolve(mismatch.recovery, 'untracked.tar.gz'), 'untracked.txt'); writeFileSync(resolve(mismatch.repo, 'untracked.txt'), 'untracked\n'); refreshChecksums(mismatch.recovery)
    expect(run(mismatch.repo, mismatch.recovery, publication).stderr).toContain('archive-mismatch')
  }, 15_000)

  it('rejects malformed publication metadata', () => {
    const { repo, recovery } = fixture({ remote: true })
    expect(run(repo, recovery, ['--remote', 'origin', '--refspec', 'refs/heads/main:refs/heads/main:extra', '--owner', 'maintainer']).stderr).toContain('publication-ambiguous')
    expect(run(repo, recovery, ['--remote', 'origin', '--refspec', 'refs/heads/main:refs/heads/main', '--owner', '   ']).stderr).toContain('publication-ambiguous')
  })
})
