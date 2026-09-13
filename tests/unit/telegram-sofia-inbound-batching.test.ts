import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  admin: vi.fn(),
  rag: vi.fn(),
  attach: vi.fn(),
  config: vi.fn(),
  global: vi.fn(),
  hours: vi.fn(),
  contact: vi.fn(),
  intent: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@/lib/ai/openrouter', () => ({ processarRagPipeline: m.rag }))
vi.mock('@/lib/sofia/inbound-batch-producer', () => ({ attachPersistedSofiaInboundMessage: m.attach }))
vi.mock('@/lib/config/sistema', () => ({ obterConfiguracaoSistema: m.config, obterSofiaGlobalChannelConfig: m.global }))
vi.mock('@/lib/horarios/verificar', () => ({ verificarHorarioAtendimento: m.hours }))
vi.mock('@/lib/whatsapp/contact-status', () => ({
  classificarIntencaoMensagem: m.intent,
  processarStatusContatoInbound: m.contact,
}))

import { POST } from '@/app/api/webhooks/telegram/route'

type DatabaseOptions = { existing?: boolean; phone?: string | null; iaAtiva?: boolean }

function db({ existing = false, phone = '5541999990003', iaAtiva = true }: DatabaseOptions = {}) {
  const calls: string[] = []
  const reads: string[] = []
  const client: any = {
    from: vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn(() => {
          reads.push(table)
          return builder
        }),
        eq: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        update: vi.fn(() => builder),
        insert: vi.fn(() => {
          calls.push(`persist:${table}`)
          return builder
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'mensagens') return { data: existing ? { id: 'message-1' } : null, error: null }
          if (table === 'clientes') return { data: { id: 'client-1', telefone: phone }, error: null }
          return { data: { id: 'conversation-1', ia_ativa: iaAtiva }, error: null }
        }),
        single: vi.fn(async () => ({ data: { id: 'message-1', ia_ativa: iaAtiva }, error: null })),
      }
      return builder
    }),
  }
  return { client, calls, reads }
}

function req(message: Record<string, unknown> = { text: 'hello' }) {
  return new Request('https://test/api/webhooks/telegram', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'secret' },
    body: JSON.stringify({
      message: {
        message_id: 1,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        ...message,
      },
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  m.config.mockResolvedValue('secret')
  m.global.mockResolvedValue({ enabled: true })
  m.hours.mockResolvedValue({ dentro: true })
  m.contact.mockResolvedValue({ suprimirSofia: false })
  m.intent.mockReturnValue({ tipo: 'conversa_regular' })
  m.rag.mockResolvedValue(undefined)
  m.attach.mockResolvedValue(true)
})

describe('Telegram Sofia inbound batching producer', () => {
  it.each([undefined, 'false', 'TRUE', ' true '])('defaults closed for %s', async (value) => {
    const { client } = db()
    m.admin.mockReturnValue(client)
    if (value !== undefined) vi.stubEnv('SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED', value)

    expect((await POST(req())).status).toBe(200)
    expect(m.attach).not.toHaveBeenCalled()
    expect(m.rag).toHaveBeenCalled()
  })

  it('attaches after persistence only for exact true', async () => {
    const { client, calls } = db()
    m.admin.mockReturnValue(client)
    vi.stubEnv('SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED', 'true')
    m.attach.mockImplementation(async () => {
      calls.push('attach')
      return true
    })

    expect((await POST(req())).status).toBe(200)
    expect(calls).toEqual(['persist:mensagens', 'attach'])
    expect(m.attach).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'message-1', conversationId: 'conversation-1', customerId: 'client-1', channel: 'telegram',
    }))
    expect(m.rag).not.toHaveBeenCalled()
  })

  it.each([
    ['an opt-out request', { text: 'Please stop' }, { tipo: 'opt_out' }, 1],
    ['a human handoff request', { text: 'I need a person' }, { tipo: 'human_handoff' }, 1],
    ['a catalog request', { text: 'Send the menu' }, { tipo: 'conversa_regular' }, 1],
    ['non-proof media', { document: { file_id: 'document-1', mime_type: 'text/plain', file_size: 10 } }, { tipo: 'conversa_regular' }, 0],
  ])('keeps %s on immediate out-of-hours handling when batching is enabled', async (_caseName, message, intent, directReplyCalls) => {
    const { client } = db()
    m.admin.mockReturnValue(client)
    vi.stubEnv('SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED', 'true')
    m.hours.mockResolvedValue({ dentro: false, mensagem: 'Closed' })
    m.intent.mockReturnValue(intent)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(req(message))

    expect(await response.json()).toMatchObject({ ok: true, status: 'out_of_hours' })
    expect(fetchMock).toHaveBeenCalledTimes(directReplyCalls)
    expect(m.attach).not.toHaveBeenCalled()
    expect(m.rag).not.toHaveBeenCalled()
  })

  it('attaches eligible out-of-hours normal text without a direct reply or legacy RAG', async () => {
    const { client, calls } = db()
    m.admin.mockReturnValue(client)
    vi.stubEnv('SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED', 'true')
    m.hours.mockResolvedValue({ dentro: false, mensagem: 'Closed' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    m.attach.mockImplementation(async () => {
      calls.push('attach')
      return true
    })

    expect((await POST(req())).status).toBe(200)
    expect(calls).toEqual(['persist:mensagens', 'attach'])
    expect(m.attach).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'message-1', conversationId: 'conversation-1', customerId: 'client-1', channel: 'telegram',
    }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(m.rag).not.toHaveBeenCalled()
  })

  it('does not attach duplicates', async () => {
    const { client } = db({ existing: true })
    m.admin.mockReturnValue(client)
    vi.stubEnv('SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED', 'true')

    expect((await POST(req())).status).toBe(200)
    expect(m.attach).not.toHaveBeenCalled()
  })

  it('keeps intake and logs only a token on attach failure', async () => {
    const { client } = db()
    m.admin.mockReturnValue(client)
    vi.stubEnv('SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED', 'true')
    m.attach.mockResolvedValue(false)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect((await POST(req())).status).toBe(200)
    expect(error).toHaveBeenCalledWith('[Telegram Webhook] SOFIA_BATCH_ATTACH_FAILED')
    expect(m.rag).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('answers a catalog keyword with one opt-in prompt button and no cards', async () => {
    const { client, calls, reads } = db()
    m.admin.mockReturnValue(client)
    vi.stubEnv('SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED', 'true')
    const fetchMock = vi.fn<
      (url: string, init: { body?: string }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
    >(async () => ({ ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(req({ text: 'Boa noite! Qual é o cardápio?' }))

    expect(await response.json()).toMatchObject({ ok: true, status: 'catalog_prompt_sent' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url.toString()).toContain('/sendMessage')

    const sent = JSON.parse(String(init.body))
    expect(sent.chat_id).toBe('1001')
    expect(sent.reply_markup.inline_keyboard).toEqual([
      [{ text: 'Ver catálogo', callback_data: 'catalog:view' }],
    ])
    expect(sent.text.length).toBeLessThanOrEqual(200)
    expect(JSON.stringify(sent)).not.toContain('catalog:add')

    // The keyword turn keeps the existing early return: the inbound message is
    // persisted once, the product query is skipped, and neither the batching
    // producer nor the legacy RAG dispatch runs.
    expect(reads).not.toContain('produtos')
    expect(calls).toEqual(['persist:mensagens'])
    expect(m.attach).not.toHaveBeenCalled()
    expect(m.rag).not.toHaveBeenCalled()
  })

  it('keeps a regular text on the batching producer and never sends a catalog prompt', async () => {
    const { client, calls } = db()
    m.admin.mockReturnValue(client)
    vi.stubEnv('SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED', 'true')
    m.attach.mockImplementation(async () => {
      calls.push('attach')
      return true
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect((await POST(req({ text: 'Bom dia, tudo bem?' }))).status).toBe(200)
    expect(calls).toEqual(['persist:mensagens', 'attach'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(m.rag).not.toHaveBeenCalled()
  })
})
