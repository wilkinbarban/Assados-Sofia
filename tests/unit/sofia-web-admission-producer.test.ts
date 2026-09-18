import { beforeEach, describe, expect, it, vi } from 'vitest'
import { admitSofiaWebInboundMessage } from '@/lib/sofia/inbound-batch-producer'

type RpcResult = { data?: unknown; error: unknown }

function admin(result: RpcResult = { data: [], error: null }) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc }, rpc }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    message_id: 'message-1',
    batch_id: 'batch-1',
    duplicate: false,
    scheduled_at: '2030-01-01T10:00:25.000Z',
    ...overrides,
  }
}

const input = {
  conversationId: 'conversa-1',
  customerId: 'cliente-1',
  idempotencyKey: 'web-key-1',
  content: 'Olá',
  attachmentUrl: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('admitSofiaWebInboundMessage', () => {
  it('admits a Web message through the Web channel and client idempotency key', async () => {
    const { client, rpc } = admin({ data: [row()], error: null })

    const result = await admitSofiaWebInboundMessage({ supabase: client, ...input })

    expect(rpc).toHaveBeenCalledWith('enqueue_sofia_inbound_message', {
      p_conversa_id: 'conversa-1',
      p_cliente_id: 'cliente-1',
      p_canal: 'web',
      p_delivery_key: 'web-key-1',
      p_conteudo: 'Olá',
      p_url_anexo: null,
    })
    expect(result).toEqual({
      admitted: true,
      messageId: 'message-1',
      batchId: 'batch-1',
      duplicate: false,
      scheduledAt: '2030-01-01T10:00:25.000Z',
    })
  })

  it('reports a replayed key as a duplicate against the original batch', async () => {
    const { client } = admin({ data: [row({ duplicate: true })], error: null })

    const result = await admitSofiaWebInboundMessage({ supabase: client, ...input })

    expect(result).toEqual(expect.objectContaining({ admitted: true, duplicate: true, batchId: 'batch-1' }))
  })

  it('accepts an attachment-only Web message', async () => {
    const { client, rpc } = admin({ data: [row()], error: null })

    const result = await admitSofiaWebInboundMessage({
      supabase: client,
      ...input,
      content: null,
      attachmentUrl: 'cliente/arquivo.pdf',
    })

    expect(result).toMatchObject({ admitted: true })
    expect(rpc).toHaveBeenCalledWith(
      'enqueue_sofia_inbound_message',
      expect.objectContaining({ p_conteudo: null, p_url_anexo: 'cliente/arquivo.pdf' }),
    )
  })

  it('fails closed when the RPC rejects the admission', async () => {
    const { client } = admin({ data: null, error: { message: 'SOFIA_BATCH_BINDING_INVALID' } })

    await expect(admitSofiaWebInboundMessage({ supabase: client, ...input })).resolves.toEqual({ admitted: false })
  })

  it('fails closed when the RPC throws', async () => {
    const { client } = admin()
    client.rpc.mockRejectedValue(new Error('network'))

    await expect(admitSofiaWebInboundMessage({ supabase: client, ...input })).resolves.toEqual({ admitted: false })
  })

  it('fails closed without calling the RPC for a blank idempotency key', async () => {
    const { client, rpc } = admin({ data: [row()], error: null })

    await expect(admitSofiaWebInboundMessage({ supabase: client, ...input, idempotencyKey: '  ' })).resolves.toEqual({
      admitted: false,
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails closed on an unexpected RPC payload', async () => {
    const { client } = admin({ data: [{ unexpected: true }], error: null })

    await expect(admitSofiaWebInboundMessage({ supabase: client, ...input })).resolves.toEqual({ admitted: false })
  })

  it('reads a single-object RPC payload', async () => {
    const { client } = admin({ data: row({ message_id: 'message-2' }), error: null })

    await expect(admitSofiaWebInboundMessage({ supabase: client, ...input })).resolves.toEqual(
      expect.objectContaining({ admitted: true, messageId: 'message-2' }),
    )
  })
})
