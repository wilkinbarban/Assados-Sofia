import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const runnerPath = join(root, 'scripts/run-local-supabase-service-tests.sh')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const workflow = readFileSync(join(root, '.github/workflows/pull-request.yml'), 'utf8')

describe('local Supabase service-backed test runner', () => {
  it('is executable and has dedicated package and CI entry points', () => {
    expect(existsSync(runnerPath)).toBe(true)
    expect(packageJson.scripts['test:unit:supabase']).toBe('scripts/run-local-supabase-service-tests.sh')
    expect(workflow).toContain('run: npm run test:unit:supabase')
    expect(() => execFileSync('test', ['-x', runnerPath])).not.toThrow()
  })

  it('pins the local target and serializes exactly the two service-backed suites', () => {
    const runner = readFileSync(runnerPath, 'utf8')

    expect(runner).toContain("readonly local_api_url='http://127.0.0.1:55321'")
    expect(runner).toContain('ports = {54321: 55321')
    expect(runner).toContain("'auto_expose_new_tables = true'")
    expect(runner).toContain("r'\\1true'")
    expect(runner).toContain("SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN='local-test-only'")
    expect(runner).toContain("readonly protected_project='xvzdxoktwnzmxsfizkxo'")
    expect(runner).toContain("'tests/unit/roles-authentication-e2e.test.ts'")
    expect(runner).toContain("'tests/unit/web-client-operator-cart-flow.test.ts'")
    expect(runner).toContain('--fileParallelism=false')
    expect(runner).toContain('npx supabase db reset --local --workdir "$work/project"')
    expect(runner).toContain('npx supabase stop --workdir "$work/project" --no-backup')
    expect(runner).toContain("pattern = re.compile(r'^alter function public\\.[^;]+ owner to supabase_admin;")
    expect(runner).toContain("if changed != 8:")
    expect(runner).toContain("trap cleanup EXIT")
  })

  it('rejects every test outside its allowlist before contacting Docker', () => {
    const result = spawnSync('bash', [runnerPath, 'tests/unit/safe-redirect.test.ts'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: '/usr/bin:/bin' },
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Only the two service-backed Supabase suites may run')
    expect(result.stdout).toBe('')
  })
})
