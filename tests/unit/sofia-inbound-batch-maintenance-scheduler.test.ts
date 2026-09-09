import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const schedulerPath = 'ops/sofia-inbound-batch-maintenance-scheduler.sh'
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8')
const deploy = readFileSync(join(root, 'scripts/deploy-web.sh'), 'utf8')
const markerPath = '/tmp/sofia-inbound-batch-maintenance-last-success'

function executable(dir: string, name: string, body: string) {
  const path = join(dir, name)
  writeFileSync(path, body)
  chmodSync(path, 0o755)
}

function runScheduler(options: { fail?: boolean; interval?: string; secret?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sofia-scheduler-'))
  const calls = join(dir, 'calls')
  writeFileSync(calls, '')
  executable(dir, 'curl', `#!/bin/sh\nprintf '%s\\n' "$*" >> "$CALLS"\n[ "${options.fail ? '1' : '0'}" = 0 ]\n`)
  executable(dir, 'sleep', '#!/bin/sh\nexit 1\n')
  const result = spawnSync('sh', [schedulerPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, CALLS: calls,
      SOFIA_BATCH_MAINTENANCE_SECRET: options.secret ?? 'sofia-private',
      SOFIA_BATCH_MAINTENANCE_URL: 'http://maintenance.local',
      SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS: options.interval ?? '60' },
  })
  return { result, calls: readFileSync(calls, 'utf8') }
}

function healthcheck(marker: string | undefined, interval = '60') {
  const service = compose.slice(compose.indexOf('  sofia-inbound-batch-maintenance:'), compose.indexOf('  evolution-api:'))
  const block = service.slice(service.indexOf('        - >-') + '        - >-'.length, service.indexOf('      interval: 30s'))
  const command = block.split('\n').map(line => line.trim()).filter(Boolean).join(' ').replaceAll('$$', '$')
  const dir = mkdtempSync(join(tmpdir(), 'sofia-healthcheck-'))
  const now = Math.floor(Date.now() / 1000)
  executable(dir, 'date', `#!/bin/sh\nprintf '%s\\n' ${now}\n`)
  executable(dir, 'cat', `#!/bin/sh\n[ "${marker === undefined ? '0' : '1'}" = 1 ] || exit 1\nprintf '%s' '${marker ?? ''}'\n`)
  return spawnSync('sh', ['-c', command], {
    encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SOFIA_BATCH_MAINTENANCE_INTERVAL_SECONDS: interval },
  })
}

describe('Sofia inbound batch maintenance scheduler', () => {
  it('writes the numeric marker only after an authenticated curl succeeds without disclosing its secret', () => {
    writeFileSync(markerPath, 'unchanged')
    const failed = runScheduler({ fail: true })
    expect(readFileSync(markerPath, 'utf8')).toBe('unchanged')
    const succeeded = runScheduler()
    expect(succeeded.calls).toContain('Authorization: Bearer sofia-private')
    expect(readFileSync(markerPath, 'utf8').trim()).toMatch(/^\d+$/)
    expect(`${failed.result.stdout}${failed.result.stderr}${succeeded.result.stdout}${succeeded.result.stderr}`).not.toContain('sofia-private')
  })

  it('rejects absent, invalid, and unsafe scheduler intervals before invoking curl', () => {
    for (const options of [{ secret: '' }, { interval: 'nope' }, { interval: '0' }, { interval: '715827883' }]) {
      const run = runScheduler(options)
      expect(run.result.status).not.toBe(0)
      expect(run.calls).toBe('')
    }
  })

  it('executes a healthcheck that accepts only fresh numeric markers within bounded tolerance', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(healthcheck(`${now}`).status).toBe(0)
    expect(healthcheck(undefined).status).not.toBe(0)
    expect(healthcheck('not-an-epoch').status).not.toBe(0)
    expect(healthcheck(`${now - 181}`).status).not.toBe(0)
    expect(healthcheck(`${now + 6}`).status).not.toBe(0)
    expect(healthcheck(`${now - 180}`).status).toBe(0)
    expect(healthcheck(`${now + 5}`).status).toBe(0)
    expect(healthcheck(`${now - 180}`, 'invalid').status).toBe(0)
  })

  it('installs scheduler only for normal promotion and stops it for both closed recovery paths', () => {
    expect(compose).toContain('SOFIA_BATCH_MAINTENANCE_URL=http://web:3000/api/internal/sofia/inbound-batches/maintenance')
    expect(compose).toContain('marker=$$(cat /tmp/sofia-inbound-batch-maintenance-last-success) || exit 1')
    expect(deploy).toContain('wait_sofia_scheduler_healthy')
    expect(deploy).toContain('wait_healthy\n  if [[ "$close_operational_gates" == true ]]; then\n    stop_sofia_scheduler\n  else\n    recreate_sofia_scheduler')
    expect(deploy).toContain('--no-deps --force-recreate sofia-inbound-batch-maintenance')
    expect(deploy).toContain('docker stop asados-sofia-inbound-batch-maintenance')
    expect(deploy).toContain('if [[ "$close_operational_gates" == true ]]; then\n    stop_sofia_scheduler')
    expect(deploy).toContain('recreate_and_verify "$rollback_ref" "$previous_id" true')
    expect(deploy).toContain('recreate_and_verify "$PREVIOUS_REF" "$PREVIOUS_ID" true')
    for (const gate of [
      'SOFIA_INBOUND_BATCH_PROCESSING_ENABLED=false',
      'SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED=false',
      'SOFIA_INBOUND_BATCH_EVOLUTION_ENQUEUE_ENABLED=false',
    ]) expect(deploy).toContain(gate)
  })
})
