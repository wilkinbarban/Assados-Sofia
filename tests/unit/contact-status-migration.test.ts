import { describe, expect, it, vi, beforeEach } from 'vitest'
import { processarStatusContatoInbound } from '@/lib/whatsapp/contact-status'

describe('Integração de Estado de Contatos e Opt-Out/Opt-In com Banco de Dados', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
  })

  it('handles universal opt-out by calling registrar_opt_out_cliente and suppressing Sofia', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null })

    const result = await processarStatusContatoInbound(
      mockSupabase,
      'cliente-uuid-1',
      'STOP! Por favor não quero mais mensagens.'
    )

    expect(mockSupabase.rpc).toHaveBeenCalledWith('atualizar_interacao_cliente', {
      p_cliente_id: 'cliente-uuid-1',
      p_direcao: 'inbound',
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('registrar_opt_out_cliente', {
      p_cliente_id: 'cliente-uuid-1',
      p_motivo: 'Solicitação do cliente via mensagem',
      p_apenas_cardapio: false,
    })

    expect(result.suprimirSofia).toBe(true)
    expect(result.mensagemRespostaCurta).toContain('descadastrado')
    expect(result.intencao.tipo).toBe('opt_out')
  })

  it('handles menu-only opt-out and gives concise menu cancellation confirmation', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null })

    const result = await processarStatusContatoInbound(
      mockSupabase,
      'cliente-uuid-2',
      'Não quero mais receber o cardápio diário'
    )

    expect(mockSupabase.rpc).toHaveBeenCalledWith('registrar_opt_out_cliente', {
      p_cliente_id: 'cliente-uuid-2',
      p_motivo: 'Solicitação do cliente via mensagem',
      p_apenas_cardapio: true,
    })

    expect(result.suprimirSofia).toBe(true)
    expect(result.mensagemRespostaCurta).toContain('Não enviaremos mais o cardápio')
    expect(result.intencao.tipo).toBe('opt_out')
  })

  it('handles candidate message by updating tipo_contato to candidato_emprego and canceling menu subscription', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null })
    mockSupabase.eq.mockResolvedValue({ data: null, error: null })

    const result = await processarStatusContatoInbound(
      mockSupabase,
      'cliente-uuid-3',
      'Olá, segue meu currículo para a vaga de garçom'
    )

    expect(mockSupabase.from).toHaveBeenCalledWith('clientes')
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_contato: 'candidato_emprego',
        inscricao_cardapio: 'cancelado',
      })
    )

    expect(result.suprimirSofia).toBe(false)
    expect(result.intencao.tipo).toBe('candidato_emprego')
  })

  it('handles menu opt-in by calling registrar_opt_in_cardapio', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null })

    const result = await processarStatusContatoInbound(
      mockSupabase,
      'cliente-uuid-4',
      'Sim, quero receber o cardápio'
    )

    expect(mockSupabase.rpc).toHaveBeenCalledWith('registrar_opt_in_cardapio', {
      p_cliente_id: 'cliente-uuid-4',
    })

    expect(result.suprimirSofia).toBe(false)
    expect(result.intencao.tipo).toBe('opt_in_cardapio')
  })
})
