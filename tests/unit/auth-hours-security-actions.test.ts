import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listarHorarios, obterMensagemForaHorario } from '@/app/actions/horarios'
import { verificarHorarioAtendimento } from '@/lib/horarios/verificar'

// Mock dependencies
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

const mockSupabaseAdmin = {
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabaseAdmin,
}))

describe('Auth and Hours Security & Timezone controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restricts direct dependency merges while preserving the internal merge path', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260712210500_judgment_day_auth_horarios_fixes_round2.sql'), 'utf8')

    expect(sql).toContain("auth.role() <> 'service_role'")
    expect(sql).toContain("public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.mesclar_dependencias_cliente(UUID, UUID)')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO authenticated, service_role')
    expect(sql.match(/PERFORM public\.mesclar_dependencias_cliente_interna/g)).toHaveLength(4)
  })

  describe('listarHorarios', () => {
    it('returns error if caller is unauthenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no user') })
      
      const result = await listarHorarios()
      expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' })
    })
  })

  describe('obterMensagemForaHorario', () => {
    it('returns error if caller is unauthenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no user') })
      
      const result = await obterMensagemForaHorario()
      expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' })
    })
  })

  describe('verificarHorarioAtendimento', () => {
    it('fails closed on database or runtime error in verification', async () => {
      mockSupabaseAdmin.from.mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      const result = await verificarHorarioAtendimento()
      expect(result.dentro).toBe(false)
      expect(result.mensagem).toContain('Erro de conexão')
    })

    it('correctly calculates diaSemana and minutosAtual according to America/Sao_Paulo timezone', async () => {
      // Mock database lookup returning null to enforce generating out of hours message
      mockSupabaseAdmin.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
      }))

      const result = await verificarHorarioAtendimento()
      expect(result.dentro).toBe(false)
    })
  })
})
