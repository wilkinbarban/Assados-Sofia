import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(join(root, 'supabase/migrations/20260824150000_mercado_pago_webhook_delivery_recovery.sql'), 'utf8')
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8')
const envExample = readFileSync(join(root, '.env.example'), 'utf8')

// The forward fix does not exist yet. These assertions define the durable
// terminal-state and operational-consumer contracts before implementation.
describe('Mercado Pago durable recovery contract', () => {
  it('keeps a concrete terminal schedule value and makes dead letters unclaimable', () => {
    const forwardMigration = readFileSync(join(root, 'supabase/migrations/20260824152000_fix_mercado_pago_dead_letter_terminal_schedule.sql'), 'utf8')
    expect(migration).toContain('next_attempt_at timestamptz not null')
    expect(forwardMigration).toContain("when attempt_count >= 5 then 'dead_letter'")
    expect(forwardMigration).not.toMatch(/when\s+attempt_count\s*>=\s*5\s+then\s+null/i)
    expect(forwardMigration).toContain("v_delivery.delivery_status in ('completed', 'dead_letter')")
  })

  it('runs a restartable internal scheduler with a required secret after web readiness', () => {
    expect(compose).toContain('mercado-pago-recovery:')
    expect(compose).toContain('MERCADO_PAGO_RECOVERY_SECRET=${MERCADO_PAGO_RECOVERY_SECRET:?set MERCADO_PAGO_RECOVERY_SECRET}')
    expect(compose).toContain('condition: service_healthy')
    expect(compose).toContain('./ops/mercadopago-recovery-scheduler.sh')
    expect(envExample).toContain('MERCADO_PAGO_RECOVERY_SECRET=')
  })
})
