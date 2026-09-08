import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const scheduler = readFileSync(join(process.cwd(), 'ops/payment-proof-maintenance-scheduler.sh'), 'utf8')
const compose = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8')

function healthcheck(markerValues: { maintenance?: string; alert?: string }, interval = '60') {
  const service = compose.slice(compose.indexOf('  payment-proof-maintenance:'), compose.indexOf('  evolution-api:'))
  const marker = '        - >-'
  const block = service.slice(service.indexOf(marker) + marker.length, service.indexOf('      interval: 30s'))
  const command = block.split('\n').map(line => line.trim()).filter(Boolean).join(' ').replaceAll('$$', '$')
  for (const [path, value] of [
    ['/tmp/payment-proof-maintenance-last-success', markerValues.maintenance],
    ['/tmp/payment-proof-alert-last-success', markerValues.alert],
  ] as const) {
    if (value === undefined) writeFileSync(path, '')
    else writeFileSync(path, value)
  }
  return spawnSync('sh', ['-c', command], { encoding: 'utf8', env: { ...process.env, PAYMENT_PROOF_MAINTENANCE_INTERVAL_SECONDS: interval } })
}

function runScheduler(failUrl = '') {
  const dir = mkdtempSync(join(tmpdir(), 'scheduler-harness-'))
  const calls = join(dir, 'calls')
  for (const [name, body] of Object.entries({
    curl: `#!/bin/sh\nprintf '%s\\n' "$*" >> "$CALLS"\ncase "$*" in *"$FAIL_URL"*) exit 1;; esac\n`,
    sleep: '#!/bin/sh\nexit 1\n',
  })) {
    writeFileSync(join(dir, name), body)
    chmodSync(join(dir, name), 0o755)
  }
  const result = spawnSync('sh', ['ops/payment-proof-maintenance-scheduler.sh'], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, CALLS: calls, FAIL_URL: failUrl,
      PAYMENT_PROOF_MAINTENANCE_SECRET: 'maintenance-private', PAYMENT_PROOF_METRICS_SECRET: 'metrics-private',
      PAYMENT_PROOF_MAINTENANCE_URL: 'http://maintenance.local', PAYMENT_PROOF_ALERT_URL: 'http://alert.local',
      PAYMENT_PROOF_MAINTENANCE_INTERVAL_SECONDS: '60' },
  })
  return { result, calls: readFileSync(calls, 'utf8') }
}

describe('payment proof scheduler hardening', () => {
  it('writes epoch markers and keeps maintenance and alert calls independent', () => {
    const run = runScheduler('maintenance.local')
    expect(run.calls).toContain('maintenance.local')
    expect(run.calls).toContain('alert.local')
    expect(readFileSync('/tmp/payment-proof-alert-last-success', 'utf8').trim()).toMatch(/^\d+$/)
    expect(scheduler).toContain('date +%s')
    expect(`${run.result.stdout}${run.result.stderr}`).not.toContain('private')
  })

  it('healthcheck requires both sidecar-local markers to be numeric, not future, and fresh', () => {
    expect(compose).toContain('/tmp/payment-proof-maintenance-last-success')
    expect(compose).toContain('/tmp/payment-proof-alert-last-success')
    expect(compose).toContain('PAYMENT_PROOF_MAINTENANCE_INTERVAL_SECONDS')
    const now = Math.floor(Date.now() / 1000)
    expect(healthcheck({ maintenance: `${now}`, alert: `${now}` }).status).toBe(0)
    expect(healthcheck({ maintenance: `${now}` }).status).not.toBe(0)
    expect(healthcheck({ maintenance: 'not-an-epoch', alert: `${now}` }).status).not.toBe(0)
    expect(healthcheck({ maintenance: `${now - 181}`, alert: `${now}` }).status).not.toBe(0)
    expect(healthcheck({ maintenance: `${now + 60}`, alert: `${now}` }).status).not.toBe(0)
    expect(healthcheck({ maintenance: `${now - 200}`, alert: `${now - 200}` }, '100').status).toBe(0)
    const service = compose.slice(compose.indexOf('  payment-proof-maintenance:'), compose.indexOf('  notification-outbox-maintenance:'))
    const healthcheckSource = service.slice(service.indexOf('    healthcheck:'))
    expect(healthcheckSource).not.toMatch(/curl|web:3000\/api\/internal\/payment-proofs/)
  })

  it('strictly defaults invalid intervals and avoids eval or dynamic marker paths', () => {
    expect(scheduler).toMatch(/\*\[!0-9\]\*/)
    expect(scheduler).not.toContain('eval ')
    expect(compose).toMatch(/\*\[!0-9\]\*/)
    expect(compose).not.toContain('eval ')
  })
})
