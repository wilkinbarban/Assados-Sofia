import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('notification outbox maintenance scheduler', () => {
  it('uses authenticated polling and a numeric success marker', () => {
    const script = read('ops/notification-outbox-maintenance-scheduler.sh')
    expect(script).toContain('Authorization: Bearer $NOTIFICATION_OUTBOX_MAINTENANCE_SECRET')
    expect(script).toContain('/tmp/notification-outbox-maintenance-last-success')
    expect(script).toContain("date +%s")
  })

  it('runs in a separately health-checked compose service with gates closed by default', () => {
    const compose = read('docker-compose.yml')
    expect(compose).toContain('notification-outbox-maintenance:')
    expect(compose).toContain('./ops/notification-outbox-maintenance-scheduler.sh:/scheduler/notification-outbox-maintenance-scheduler.sh:ro')
    expect(compose).toContain('NOTIFICATION_OUTBOX_DISPATCH_ENABLED=${NOTIFICATION_OUTBOX_DISPATCH_ENABLED:-false}')
    expect(compose).toContain('cat /tmp/notification-outbox-maintenance-last-success')
  })
})
