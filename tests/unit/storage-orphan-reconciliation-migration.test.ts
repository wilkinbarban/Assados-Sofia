import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260721005143_storage_orphan_reconciliation_queue.sql',
), 'utf8')
const scanReportMigration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260721012407_storage_orphan_scan_reports.sql',
), 'utf8')
describe('storage orphan reconciliation migration', () => {
  it('creates a durable queue with approval, claim, and retry state', () => {
    expect(migration).toContain('create table if not exists public.produto_imagem_orfao_reconciliacoes')
    expect(migration).toContain("status text not null default 'pending'")
    expect(migration).toContain('approved_by uuid')
    expect(migration).toContain('claim_token uuid')
    expect(migration).toContain('attempts integer not null default 0')
  })

  it('requires active admin or supervisor approval before an atomic claim', () => {
    expect(migration).toContain('public.aprovar_reconciliacao_imagem_orfa')
    expect(migration).toContain('public.reivindicar_reconciliacao_imagem_orfa')
    expect(migration).toContain("public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])")
    expect(migration).toContain('for update skip locked')
  })

  it('rechecks product references before a claimed item can be deleted', () => {
    expect(migration).toContain('from public.produtos p')
    expect(migration).toContain('v_is_referenced')
    expect(migration).toContain("status = 'protected'")
  })

  it('never deletes Storage objects through SQL', () => {
    expect(migration).not.toMatch(/delete\s+from\s+storage\.objects/i)
  })

  it('retries only failed claims without reclaiming active deletions', () => {
    expect(migration).toContain("status in ('approved', 'failed')")
    expect(migration).toContain('for update skip locked')
    expect(migration).not.toMatch(/or\s*\(\s*status = 'claimed'/)
    expect(migration).not.toContain("claimed_at < now() - interval")
  })

  it('persists safe scan reports for unusable Storage metadata', () => {
    expect(scanReportMigration).toContain('create table if not exists public.produto_imagem_orfao_relatorios')
    expect(scanReportMigration).toContain('public.registrar_relatorio_varredura_imagem_orfa')
    expect(scanReportMigration).toContain("public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])")
    expect(scanReportMigration).not.toMatch(/delete\s+from\s+storage\.objects/i)
  })

  it('requires an explicit administrator decision to recover a stranded claim', () => {
    expect(migration).toContain('public.recuperar_reconciliacao_imagem_orfa')
    expect(migration).toContain("status = 'claimed'")
    expect(migration).toContain("public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])")
    expect(migration).toContain("case when p_confirmar_remocao then 'completed' else 'failed' end")
    expect(migration).not.toMatch(/delete\s+from\s+storage\.objects/i)
  })
})
