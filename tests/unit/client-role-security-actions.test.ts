import { describe, expect, it, vi, beforeEach } from 'vitest'
import { processarIaChat } from '@/app/actions/chat'
import { atualizarClienteCrm } from '@/app/actions/clientes'
import { processarRagPipeline } from '@/lib/ai/openrouter'
import { attachPersistedSofiaInboundMessage } from '@/lib/sofia/inbound-batch-producer'

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

vi.mock('@/lib/sofia/inbound-batch-producer', () => ({
  attachPersistedSofiaInboundMessage: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/horarios/verificar', () => ({
  verificarHorarioAtendimento: vi.fn().mockResolvedValue({ dentro: true }),
}))

describe('Client Role Security Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('processarIaChat', () => {
    function allowOwnedClient() {
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
    }

    it.each([undefined, 'false', 'TRUE', ' true '])('keeps direct RAG when the Web enqueue gate is %s', async (value) => {
      allowOwnedClient()
      if (value !== undefined) vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', value)

      await processarIaChat('conversa-1', 'Olá', 'message-1')

      expect(processarRagPipeline).toHaveBeenCalledWith('conversa-1', 'Olá', 'web')
      expect(attachPersistedSofiaInboundMessage).not.toHaveBeenCalled()
    })

    it('attaches the already-persisted Web message instead of direct RAG when the gate is exactly true', async () => {
      allowOwnedClient()
      vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')

      await processarIaChat('conversa-1', 'Olá', 'message-1')

      expect(attachPersistedSofiaInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
        messageId: 'message-1', conversationId: 'conversa-1', customerId: 'client-id-1', channel: 'web',
      }))
      expect(processarRagPipeline).not.toHaveBeenCalled()
    })

    it('fails closed rather than falling back to direct RAG when Web batching lacks a persisted message ID', async () => {
      allowOwnedClient()
      vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')

      await expect(processarIaChat('conversa-1', 'Olá')).resolves.toEqual({
        success: false, error: 'MENSAGEM_NAO_PERSISTIDA',
      })

      expect(attachPersistedSofiaInboundMessage).not.toHaveBeenCalled()
      expect(processarRagPipeline).not.toHaveBeenCalled()
    })

    it('returns a bounded failure when Web batch attachment fails', async () => {
      allowOwnedClient()
      vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')
      vi.mocked(attachPersistedSofiaInboundMessage).mockResolvedValue(false)

      await expect(processarIaChat('conversa-1', 'Olá', 'message-1')).resolves.toEqual({
        success: false, error: 'SOFIA_BATCH_ATTACH_FAILED',
      })

      expect(processarRagPipeline).not.toHaveBeenCalled()
    })

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
