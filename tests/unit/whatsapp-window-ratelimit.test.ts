import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  validarEnvioWhatsAppSafety,
  resetarContadoresJanelaProativa,
  obterContadorJanelaProativa,
} from '@/lib/whatsapp/safety'

describe('WhatsApp Window Rate Limiting: Controle de Vazão Proativa', () => {
  let mockSupabase: any

  beforeEach(() => {
    resetarContadoresJanelaProativa()
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
      rpc: vi.fn(),
    }
  })

  it('permite envios proativos dentro do limite da janela por minuto (máx 20)', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        id: 'cliente-marketing-1',
        telefone: '5541999998888',
        status_whatsapp: 'ativo',
        tipo_contato: 'cliente',
        inscricao_cardapio: 'inscrito',
        automacao_permitida: true,
      },
      error: null,
    })
    mockSupabase.limit.mockResolvedValue({ data: [], error: null })
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null })

    const result = await validarEnvioWhatsAppSafety({
      supabase: mockSupabase,
      clienteId: 'cliente-marketing-1',
      texto: 'Oferta especial de Picanha!',
      categoria: 'MARKETING',
    })

    expect(result.permitido).toBe(true)
    expect(obterContadorJanelaProativa()).toBe(1)
  })

  it('bloqueia novos envios proativos quando o limite da janela é atingido', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        id: 'cliente-marketing-burst',
        telefone: '5541999998888',
        status_whatsapp: 'ativo',
        tipo_contato: 'cliente',
        inscricao_cardapio: 'inscrito',
        automacao_permitida: true,
      },
      error: null,
    })
    mockSupabase.limit.mockResolvedValue({ data: [], error: null })
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null })

    // Simular 20 envios no mesmo minuto
    for (let i = 0; i < 20; i++) {
      await validarEnvioWhatsAppSafety({
        supabase: mockSupabase,
        clienteId: `cliente-m-${i}`,
        texto: 'Oferta',
        categoria: 'MARKETING',
      })
    }

    expect(obterContadorJanelaProativa()).toBe(20)

    // O 21º envio deve ser bloqueado preventivamente
    const result21 = await validarEnvioWhatsAppSafety({
      supabase: mockSupabase,
      clienteId: 'cliente-m-21',
      texto: 'Oferta excedida',
      categoria: 'MARKETING',
    })

    expect(result21.permitido).toBe(false)
    expect(result21.motivo).toBe('RATE_LIMIT_PROATIVO_EXCEDIDO')
  })
})
