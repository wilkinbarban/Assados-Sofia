import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const schemaMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20260816140000_client_phone_auth_schema.sql'
)
const rpcsMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20260816140001_client_phone_auth_rpcs.sql'
)
const testsSqlPath = join(process.cwd(), 'supabase/tests/client_phone_auth.sql')

describe('Fase 1: Safe Data Foundation (Client Phone-First Auth) Migrations & Tests', () => {
  it('has valid SQL test harness with pgTAP plan', () => {
    expect(existsSync(testsSqlPath)).toBe(true)
    const sql = readFileSync(testsSqlPath, 'utf8')
    expect(sql).toContain('select plan(7);')
    expect(sql).toContain('tipo_desafio_otp')
    expect(sql).toContain('solicitar_desafio_otp')
    expect(sql).toContain('ativar_desafio_otp')
    expect(sql).toContain('finalizar_desafio_otp')
    expect(sql).toContain('consumir_desafio_recuperacao')
    expect(sql).toContain('aplicar_concessao_recuperacao')
  })

  it('declares schema changes, enums, desafios_otp and concessoes_recuperacao tables', () => {
    if (!existsSync(schemaMigrationPath)) {
      throw new Error(`Schema migration file not found at ${schemaMigrationPath}`)
    }
    const sql = readFileSync(schemaMigrationPath, 'utf8')

    // Verifica enums
    expect(sql).toContain("tipo_desafio_otp")
    expect(sql).toContain("status_desafio_otp")

    // Verifica alteração na tabela clientes
    expect(sql).toContain('telefone_verificado_em')
    expect(sql).toContain('telefone_verificado_origem')
    expect(sql).toContain('email')

    // Verifica tabela desafios_otp
    expect(sql).toContain('public.desafios_otp')
    expect(sql).toContain('hash_codigo')
    expect(sql).toContain('bloqueio_reenvio_ate')
    expect(sql).toContain('tentativas')

    // Verifica tabela concessoes_recuperacao
    expect(sql).toContain('public.concessoes_recuperacao')
    expect(sql).toContain('token_hash')
    expect(sql).toContain('aplicado_em')

    // RLS & Privilégios
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE')
  })

  it('declares atomic RPCs with SECURITY DEFINER and search_path hardening', () => {
    if (!existsSync(rpcsMigrationPath)) {
      throw new Error(`RPCs migration file not found at ${rpcsMigrationPath}`)
    }
    const sql = readFileSync(rpcsMigrationPath, 'utf8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.solicitar_desafio_otp')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.ativar_desafio_otp')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.finalizar_desafio_otp')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.consumir_desafio_recuperacao')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.aplicar_concessao_recuperacao')

    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public, extensions')
  })
})
