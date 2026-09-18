import { beforeEach, describe, expect, it, vi } from 'vitest'
import { admitirMensagemSofiaWeb } from '@/app/actions/chat'
import { admitSofiaWebInboundMessage } from '@/lib/sofia/inbound-batch-producer'
import { processarRagPipeline } from '@/lib/ai/openrouter'

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

const mockSupabaseAdmin = {
  rpc: vi.fn(),
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
  admitSofiaWebInboundMessage: vi.fn(),
}))

vi.mock('@/lib/horarios/verificar', () => ({
  verificarHorarioAtendimento: vi.fn().mockResolvedValue({ dentro: true }),
}))

const { verificarHorarioAtendimento } = await import('@/lib/horarios/verificar')

function authenticatedClient(
  conversa: { ia_ativa: boolean; cliente_id: string } = { ia_ativa: true, cliente_id: 'cliente-1' },
  callerClientId = 'cliente-1',
) {
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
        single: vi.fn().mockResolvedValue({ data: { id: callerClientId }, error: null }),
      }
    }
    return {}
  })
  mockSupabaseAdmin.from.mockImplementation((table: string) => {
    if (table === 'mensagens') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'message-1',
            conversa_id: 'conversa-1',
            remetente: 'cliente',
            conteudo: 'Olá',
            url_anexo: null,
            data_criacao: '2030-01-01T10:00:00.000Z',
          },
          error: null,
        }),
      }
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: conversa, error: null }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.mocked(verificarHorarioAtendimento).mockResolvedValue({ dentro: true })
  vi.mocked(admitSofiaWebInboundMessage).mockResolvedValue({
    admitted: true,
    messageId: 'message-1',
    batchId: 'batch-1',
    duplicate: false,
    scheduledAt: '2030-01-01T10:00:25.000Z',
  })
})

describe('admitirMensagemSofiaWeb', () => {
  it.each([undefined, 'false', 'TRUE', ' true '])(
    'keeps the direct Web path while the enqueue gate is %s',
    async (value) => {
      authenticatedClient()
      if (value !== undefined) vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', value)

      await expect(admitirMensagemSofiaWeb('conversa-1', 'Olá', 'web-key-1')).resolves.toEqual({
        success: true,
        mensagem: null,
      })

      expect(admitSofiaWebInboundMessage).not.toHaveBeenCalled()
      expect(processarRagPipeline).not.toHaveBeenCalled()
    },
  )

  it('admits the Web message atomically and returns the canonical message when the gate is exactly true', async () => {
    authenticatedClient()
    vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')

    const result = await admitirMensagemSofiaWeb('conversa-1', 'Olá', 'web-key-1')

    expect(admitSofiaWebInboundMessage).toHaveBeenCalledWith({
      supabase: expect.anything(),
      conversationId: 'conversa-1',
      customerId: 'cliente-1',
      idempotencyKey: 'web-key-1',
      content: 'Olá',
      attachmentUrl: null,
    })
    expect(result).toEqual({
      success: true,
      mensagem: {
        id: 'message-1',
        conversa_id: 'conversa-1',
        remetente: 'cliente',
        conteudo: 'Olá',
        url_anexo: null,
        data_criacao: '2030-01-01T10:00:00.000Z',
      },
    })
    expect(processarRagPipeline).not.toHaveBeenCalled()
  })

  it('never persists or generates when the atomic admission is rejected', async () => {
    authenticatedClient()
    vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')
    vi.mocked(admitSofiaWebInboundMessage).mockResolvedValue({ admitted: false })

    await expect(admitirMensagemSofiaWeb('conversa-1', 'Olá', 'web-key-1')).resolves.toEqual({
      success: false,
      error: 'SOFIA_BATCH_ADMISSION_FAILED',
    })

    expect(processarRagPipeline).not.toHaveBeenCalled()
  })

  it('requires a client-generated idempotency key instead of falling back to a non-atomic insert', async () => {
    authenticatedClient()
    vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')

    await expect(admitirMensagemSofiaWeb('conversa-1', 'Olá', '   ')).resolves.toEqual({
      success: false,
      error: 'SOFIA_BATCH_ADMISSION_KEY_INVALID',
    })

    expect(admitSofiaWebInboundMessage).not.toHaveBeenCalled()
  })

  it('falls back to the direct path out of business hours', async () => {
    authenticatedClient()
    vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')
    vi.mocked(verificarHorarioAtendimento).mockResolvedValue({ dentro: false })

    await expect(admitirMensagemSofiaWeb('conversa-1', 'Olá', 'web-key-1')).resolves.toEqual({
      success: true,
      mensagem: null,
    })

    expect(admitSofiaWebInboundMessage).not.toHaveBeenCalled()
  })

  it('leaves inactive conversations unbatched', async () => {
    authenticatedClient({ ia_ativa: false, cliente_id: 'cliente-1' })
    vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')

    await expect(admitirMensagemSofiaWeb('conversa-1', 'Olá', 'web-key-1')).resolves.toEqual({
      success: true,
      mensagem: null,
    })

    expect(admitSofiaWebInboundMessage).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller', async () => {
    authenticatedClient()
    vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no user') })

    await expect(admitirMensagemSofiaWeb('conversa-1', 'Olá', 'web-key-1')).resolves.toEqual({
      success: false,
      error: 'ACESSO_NEGADO_NAO_AUTENTICADO',
    })

    expect(admitSofiaWebInboundMessage).not.toHaveBeenCalled()
  })

  it('rejects a customer that does not own the conversation', async () => {
    authenticatedClient({ ia_ativa: true, cliente_id: 'cliente-2' }, 'cliente-1')
    vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')

    await expect(admitirMensagemSofiaWeb('conversa-1', 'Olá', 'web-key-1')).resolves.toEqual({
      success: false,
      error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE',
    })

    expect(admitSofiaWebInboundMessage).not.toHaveBeenCalled()
  })

  it('fails closed when the canonical message cannot be read back', async () => {
    authenticatedClient()
    vi.stubEnv('SOFIA_INBOUND_BATCH_WEB_ENQUEUE_ENABLED', 'true')
    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'mensagens') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { ia_ativa: true, cliente_id: 'cliente-1' }, error: null }),
      }
    })

    await expect(admitirMensagemSofiaWeb('conversa-1', 'Olá', 'web-key-1')).resolves.toEqual({
      success: false,
      error: 'SOFIA_BATCH_ADMISSION_MENSAGEM_INDISPONIVEL',
    })
  })
})
