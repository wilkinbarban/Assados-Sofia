import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const testsDir = join(process.cwd(), 'supabase/tests')
const harnesses = [
  ...readdirSync(testsDir).filter((name) => name.startsWith('payment_proof_') && name.endsWith('.sql')),
  'manual_external_payment.sql',
]

describe('payment proof SQL harness bootstrap', () => {
  it.each(harnesses)('%s relies exclusively on runner-applied migrations', (name) => {
    const sql = readFileSync(join(testsDir, name), 'utf8')
    expect(sql).not.toMatch(/^\\ir?\s+.*migrations\//m)
  })
})
