import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  allowsIntegrationMock: vi.fn(),
  createAdminClient: vi.fn(),
  obterConfiguracaoSistema: vi.fn(),
}))

vi.mock('@/lib/runtime/environment', () => ({
  allowsIntegrationMock: mocks.allowsIntegrationMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: mocks.obterConfiguracaoSistema,
}))

import {
  agendarPedidoNoCalendario,
  atualizarPedidoNoCalendarioComoPago,
} from '@/lib/calendar/google'
import { processarRagPipeline } from '@/lib/ai/openrouter'

function createPipelineSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'conversas') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'conversa-1',
                  cliente_id: 'cliente-1',
                  ia_ativa: true,
                  clientes: { telefone: '', nome: 'Cliente', telegram_chat_id: '' },
                },
                error: null,
              }),
            })),
          })),
        }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
      }
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
}

describe('integration fail-closed policy', () => {
  beforeEach(() => {
    mocks.allowsIntegrationMock.mockReturnValue(false)
    mocks.obterConfiguracaoSistema.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not create a calendar event when credentials are missing outside mock mode', async () => {
    const result = await agendarPedidoNoCalendario('pedido-1')

    expect(result).toBeNull()
  })

  it('does not mark a calendar event as paid when credentials are missing outside mock mode', async () => {
    const result = await atualizarPedidoNoCalendarioComoPago('pedido-1', 'event-1')

    expect(result).toBe(false)
  })

  it('returns unavailable instead of generating a mock answer when OpenRouter is unconfigured outside mock mode', async () => {
    mocks.createAdminClient.mockReturnValue(createPipelineSupabase())

    const result = await processarRagPipeline('conversa-1', 'Olá')

    expect(result).toEqual({ sucesso: false, error: 'IA_INDISPONIVEL' })
  })

  it('returns unavailable after an OpenRouter request failure outside mock mode', async () => {
    mocks.createAdminClient.mockReturnValue(createPipelineSupabase())
    mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => (
      key === 'OPENROUTER_API_KEY' ? 'configured-key' : null
    ))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')))

    const result = await processarRagPipeline('conversa-1', 'Olá')

    expect(result).toEqual({ sucesso: false, error: 'IA_INDISPONIVEL' })
  })
})
