import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const runnerPath = join(root, 'scripts/run-selfhost-supabase-tests.sh')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }

describe('self-hosted Supabase SQL test runner', () => {
  it('provides an explicit self-hosted route without replacing the official local CLI command', () => {
    expect(existsSync(runnerPath)).toBe(true)
    expect(packageJson.scripts['supabase:test']).toBe('supabase test db')
    expect(packageJson.scripts['selfhost:test:db']).toBe('scripts/run-selfhost-supabase-tests.sh')
  })

  it('uses the canonical compose service and disposable test database without the CLI container name', () => {
    const runner = readFileSync(runnerPath, 'utf8')
    expect(runner).toContain('asados-supabase-db')
    expect(runner).toContain('createdb -U postgres "$database"')
    expect(runner).toContain('--exclude-schema=realtime')
    expect(runner).toContain('dropdb -U supabase_admin --if-exists --force "$database"')
    expect(runner).toContain('docker cp "$root/supabase/." "$container:$workspace"')
    expect(runner).toContain('encodeURIComponent')
    expect(runner).toContain('postgresql://supabase_admin:${postgres_password_uri}@127.0.0.1:5432/${database}')
    expect(runner).toContain('-v "runtime_dblink_conninfo=$conninfo"')
    expect(runner).toContain('psql -qX -U supabase_admin -d "$database"')
    expect(runner).not.toContain('-v "dblink_password=')
    expect(runner).not.toContain('set app.runtime_dblink_conninfo')
    expect(runner).toContain('Only files under supabase/tests may be run')
    expect(runner).not.toContain('supabase_db_Asados')
  })

  it('creates, restores, and drops a uniquely named database for each selected test', () => {
    const runner = readFileSync(runnerPath, 'utf8')
    const helperStart = runner.indexOf('run_test() {')
    const helperEnd = runner.indexOf('\n}', helperStart)
    const helper = runner.slice(helperStart, helperEnd)
    const loopStart = runner.indexOf('for test_file in "$@"; do')
    const loop = runner.slice(loopStart)

    expect(helperStart).toBeGreaterThan(-1)
    expect(helper).toContain('database="asados_sql_test_$$_$test_number"')
    expect(helper).toContain('createdb -U postgres "$database"')
    expect(helper).toContain("pg_restore -U supabase_admin -d '$database' --exit-on-error")
    expect(helper).toContain('postgresql://supabase_admin:${postgres_password_uri}@127.0.0.1:5432/${database}')
    expect(helper).toContain('psql -qX -U supabase_admin -d "$database"')
    expect(helper).toContain('cleanup_database')
    expect(loop).toContain('run_test "$test_file"')
    expect(runner.indexOf('docker cp "$root/supabase/." "$container:$workspace"')).toBeLessThan(loopStart)
    expect(runner).toContain('[ -z "$database" ] || docker exec "$container" dropdb')
    expect(runner).toContain('trap cleanup EXIT')
    expect(runner).toContain("trap 'cleanup; trap - EXIT; exit 129' HUP")
    expect(runner).toContain("trap 'cleanup; trap - EXIT; exit 130' INT")
    expect(runner).toContain("trap 'cleanup; trap - EXIT; exit 143' TERM")
    expect(runner).toContain('database=')
  })
})
