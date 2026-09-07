import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/config/sistema', () => ({ obterConfiguracaoSistema: vi.fn() }))

import { WhatsAppWindowClosedError, validarJanelaEnvio } from '@/lib/whatsapp/provider'

function query(result: unknown) {
  const builder: any = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  builder.single.mockResolvedValue(result)
  builder.maybeSingle.mockResolvedValue(result)
  return builder
}

describe('validarJanelaEnvio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws a typed error only when the 24h window is closed without an approved template', async () => {
    const conversation = query({ data: { clientes: { telefone: '5541999999999' } }, error: null })
    const messages = query({ data: null, error: null })
    createAdminClient.mockReturnValue({ from: vi.fn((table) => table === 'conversas' ? conversation : messages) })

    await expect(validarJanelaEnvio('conversation-id', { texto: 'customer copy' }))
      .rejects.toBeInstanceOf(WhatsAppWindowClosedError)
  })

  it('does not classify unrelated provider lookup failures as a closed WhatsApp window', async () => {
    const conversation = query({ data: null, error: { message: 'database unavailable' } })
    createAdminClient.mockReturnValue({ from: vi.fn(() => conversation) })

    await expect(validarJanelaEnvio('conversation-id', { texto: 'customer copy' }))
      .rejects.not.toBeInstanceOf(WhatsAppWindowClosedError)
  })
})
