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

  it('opens the window from the authoritative customer timestamp without legacy messages', async () => {
    const conversation = query({
      data: { clientes: { telefone: '5541999999999', ultima_interacao_recebida_em: new Date(Date.now() - 60 * 60 * 1000).toISOString() } },
      error: null,
    })
    const messages = query({ data: null, error: null })
    const from = vi.fn((table) => table === 'conversas' ? conversation : messages)
    createAdminClient.mockReturnValue({ from })

    await expect(validarJanelaEnvio('conversation-id', { texto: 'customer copy' })).resolves.toMatchObject({ telefone: '5541999999999' })
    expect(conversation.select).toHaveBeenCalledWith('id, cliente_id, clientes (telefone, ultima_interacao_recebida_em)')
    expect(messages.eq).toHaveBeenCalledWith('conversa_id', 'conversation-id')
    expect(from).not.toHaveBeenCalledWith('clientes')
  })

  it.each([
    ['expired', new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()],
    ['invalid', 'not-a-timestamp'],
    ['future', new Date(Date.now() + 60 * 60 * 1000).toISOString()],
  ])('keeps the window closed for a %s authoritative customer timestamp', async (_label, ultima_interacao_recebida_em) => {
    const conversation = query({ data: { clientes: { telefone: '5541999999999', ultima_interacao_recebida_em } }, error: null })
    const messages = query({ data: null, error: null })
    createAdminClient.mockReturnValue({ from: vi.fn((table) => table === 'conversas' ? conversation : messages) })

    await expect(validarJanelaEnvio('conversation-id', { texto: 'customer copy' }))
      .rejects.toBeInstanceOf(WhatsAppWindowClosedError)
  })

  it('keeps the window open at exactly 24 hours and closes it one millisecond later', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-09-04T12:00:00.000Z')
    vi.setSystemTime(now)
    try {
      const atBoundary = query({ data: { clientes: { telefone: '5541999999999', ultima_interacao_recebida_em: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() } }, error: null })
      const afterBoundary = query({ data: { clientes: { telefone: '5541999999999', ultima_interacao_recebida_em: new Date(now.getTime() - 24 * 60 * 60 * 1000 - 1).toISOString() } }, error: null })
      const messages = query({ data: null, error: null })
      createAdminClient.mockReturnValueOnce({ from: vi.fn((table) => table === 'conversas' ? atBoundary : messages) })
      await expect(validarJanelaEnvio('conversation-id', { texto: 'customer copy' })).resolves.toMatchObject({ telefone: '5541999999999' })

      createAdminClient.mockReturnValueOnce({ from: vi.fn((table) => table === 'conversas' ? afterBoundary : messages) })
      await expect(validarJanelaEnvio('conversation-id', { texto: 'customer copy' })).rejects.toBeInstanceOf(WhatsAppWindowClosedError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('continues to open the window from a recent legacy customer message', async () => {
    const conversation = query({ data: { clientes: { telefone: '5541999999999', ultima_interacao_recebida_em: null } }, error: null })
    const messages = query({ data: { data_criacao: new Date(Date.now() - 60 * 60 * 1000).toISOString() }, error: null })
    createAdminClient.mockReturnValue({ from: vi.fn((table) => table === 'conversas' ? conversation : messages) })

    await expect(validarJanelaEnvio('conversation-id', { texto: 'customer copy' })).resolves.toMatchObject({ telefone: '5541999999999' })
  })
})
