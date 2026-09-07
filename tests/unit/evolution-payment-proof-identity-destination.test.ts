import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260903180000_evolution_payment_proof_identity_destination.sql'), 'utf8')

describe('Evolution payment-proof identity destination migration', () => {
  it('defines a service-only, atomic canonical destination resolver', () => {
    expect(migration).toMatch(/resolve_evolution_payment_proof_identity_destination\(\s*p_phone text,\s*p_display_name text\s*\)/)
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/)
    expect(migration).toMatch(/auth\.role\(\)\s*<>\s*'service_role'[\s\S]*auth\.uid\(\)\s+is\s+not\s+null/i)
    expect(migration).toMatch(/\^55419\[0-9\]\{8\}\$/)
    expect(migration).toMatch(/pg_advisory_xact_lock\([\s\S]*resolve_evolution_payment_proof_identity_destination:/)
    expect(migration.indexOf('pg_advisory_xact_lock')).toBeLessThan(migration.indexOf('FROM public.clientes'))
    expect(migration).toMatch(/from public\.clientes[\s\S]*where telefone = p_phone[\s\S]*for update/i)
    expect(migration).toMatch(/coalesce\(nullif\(left\(btrim\(p_display_name\), 100\), ''\), 'Contato Evolution'\)/i)
    expect(migration).toMatch(/from public\.conversas[\s\S]*status = 'aberta'[\s\S]*order by data_atualizacao desc, id desc[\s\S]*for update/i)
    expect(migration).toMatch(/insert into public\.conversas[\s\S]*'aberta'[\s\S]*false/i)
    expect(migration).toMatch(/revoke all on function[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i)
    expect(migration).not.toMatch(/\b(mensagens|comprovantes)\b/i)
  })
})
