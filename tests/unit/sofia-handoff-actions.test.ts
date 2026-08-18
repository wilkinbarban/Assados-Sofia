import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  silenciarSofiaClienteAction,
  reativarSofiaClienteAction,
  obterStatusSofiaClienteAction,
} from '@/actions/sofia-handoff'

describe('Server Actions: Gestão de Human Handoff e Cooldown da Sofía', () => {
  let mockSupabase: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    }
  })

  it('silencia Sofia para o cliente chamando a RPC silenciar_sofia_cliente', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        id: 'state-1',
        cliente_id: 'cliente-123',
        sofia_dormindo: true,
        motivo: 'cooldown_operador',
        silenciada_ate: '2026-08-16T17:00:00Z',
      },
      error: null,
    })

    const result = await silenciarSofiaClienteAction({
      clienteId: 'cliente-123',
      minutos: 60,
      motivo: 'cooldown_operador',
      supabaseClient: mockSupabase,
      usuarioId: 'user-operador-1',
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('silenciar_sofia_cliente', {
      p_cliente_id: 'cliente-123',
      p_minutos: 60,
      p_motivo: 'cooldown_operador',
      p_usuario_id: 'user-operador-1',
    })
    expect(result.sucesso).toBe(true)
    expect(result.dormindo).toBe(true)
  })

  it('reativa Sofia para o cliente chamando a RPC reativar_sofia_cliente', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        id: 'state-1',
        cliente_id: 'cliente-123',
        sofia_dormindo: false,
        silenciada_ate: null,
      },
      error: null,
    })

    const result = await reativarSofiaClienteAction({
      clienteId: 'cliente-123',
      supabaseClient: mockSupabase,
      usuarioId: 'user-operador-1',
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('reativar_sofia_cliente', {
      p_cliente_id: 'cliente-123',
      p_usuario_id: 'user-operador-1',
    })
    expect(result.sucesso).toBe(true)
    expect(result.dormindo).toBe(false)
  })

  it('consulta o status de silêncio e cooldown chamando verificar_sofia_silenciada', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: true,
      error: null,
    })

    const result = await obterStatusSofiaClienteAction('cliente-123', mockSupabase)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('verificar_sofia_silenciada', {
      p_cliente_id: 'cliente-123',
    })
    expect(result.silenciada).toBe(true)
  })
})
