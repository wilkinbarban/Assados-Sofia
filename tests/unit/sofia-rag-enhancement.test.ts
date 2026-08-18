import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Sofia RAG Knowledge Base Enhancement: Migração DDL e Extensão Unaccent', () => {
  it('includes unaccent extension and robust buscar_artigos_relevantes in migration', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20260816250000_sofia_remediation_rag_stock_horarios.sql'
    )
    expect(fs.existsSync(migrationPath)).toBe(true)

    const content = fs.readFileSync(migrationPath, 'utf8')
    expect(content).toContain('CREATE EXTENSION IF NOT EXISTS unaccent')
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.f_unaccent')
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.buscar_artigos_relevantes')
    expect(content).toContain('to_tsquery(\'portuguese\'')
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.buscar_produtos_disponiveis')
    expect(content).toContain('quantidade_estoque INTEGER')
  })
})
