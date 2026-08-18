import { describe, expect, it, vi, beforeEach } from 'vitest'
import { processarIaChat } from '@/app/actions/chat'
import { atualizarClienteCrm } from '@/app/actions/clientes'

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

vi.mock('@/lib/ai/openrouter', () => ({
  processarRagPipeline: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/horarios/verificar', () => ({
  verificarHorarioAtendimento: vi.fn().mockResolvedValue({ dentro: true }),
}))

describe('Client Role Security Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('processarIaChat', () => {
    it('returns error if caller is unauthenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no user') })
      
      const result = await processarIaChat('conversa-1', 'Ola')
      expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' })
    })

    it('returns error if user is a client but does not own the conversation', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'client-user-id' } }, error: null })
      
      // Mock perfil query (client function)
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { funcao: 'cliente', ativo: true }, error: null }),
          }
        }
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'client-id-1' }, error: null }),
          }
        }
        return {}
      })

      // Mock conversa owner lookup in admin client (belongs to client-id-2)
      mockSupabaseAdmin.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { ia_ativa: true, cliente_id: 'client-id-2' }, error: null }),
      }))

      const result = await processarIaChat('conversa-1', 'Ola')
      expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' })
    })

    it('returns error if user is an operator but deactivated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'deactivated-operator-id' } }, error: null })
      
      // Mock profile query: operator but inactive
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { funcao: 'vendedor', ativo: false }, error: null }),
          }
        }
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'client-id-1' }, error: null }),
          }
        }
        return {}
      })

      // Mock conversation belonging to client-id-2
      mockSupabaseAdmin.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { ia_ativa: true, cliente_id: 'client-id-2' }, error: null }),
      }))

      const result = await processarIaChat('conversa-1', 'Ola')
      expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' })
    })

    it('allows pipeline execution if client owns the conversation', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'client-user-id' } }, error: null })
      
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { funcao: 'cliente', ativo: true }, error: null }),
          }
        }
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'client-id-1' }, error: null }),
          }
        }
        return {}
      })

      mockSupabaseAdmin.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { ia_ativa: true, cliente_id: 'client-id-1' }, error: null }),
      }))

      const result = await processarIaChat('conversa-1', 'Ola')
      expect(result.success).toBe(true)
    })
  })

  describe('atualizarClienteCrm', () => {
    it('rejects client attempting to update restricted CRM fields', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'client-user-id' } }, error: null })
      
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { funcao: 'cliente', ativo: true }, error: null }),
          }
        }
        return {}
      })

      // Attempt to modify score
      const result = await atualizarClienteCrm('client-id-1', { score: 10 })
      expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_METADADOS_RESTRITOS' })
    })

    it('permits operators to update restricted CRM fields', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'operator-user-id' } }, error: null })
      
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'perfis') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { funcao: 'supervisor', ativo: true }, error: null }),
          }
        }
        if (table === 'clientes') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        return {}
      })

      const result = await atualizarClienteCrm('client-id-1', { score: 10 })
      expect(result.success).toBe(true)
    })
  })
})
