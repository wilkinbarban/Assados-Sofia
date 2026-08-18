import crypto from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as postMetaWhatsApp } from '@/app/api/webhooks/whatsapp/route'
import { POST as postEvolution } from '@/app/api/webhooks/evolution/route'
import { POST as postTelegram } from '@/app/api/webhooks/telegram/route'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  obterConfiguracaoSistema: vi.fn(),
  obterSofiaGlobalChannelConfig: vi.fn(),
  verificarHorarioAtendimento: vi.fn(),
  processarRagPipeline: vi.fn(),
  enviarMensagemWhatsapp: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/config/sistema', () => ({
  obterConfiguracaoSistema: mocks.obterConfiguracaoSistema,
  obterSofiaGlobalChannelConfig: mocks.obterSofiaGlobalChannelConfig,
}))

vi.mock('@/lib/horarios/verificar', () => ({
  verificarHorarioAtendimento: mocks.verificarHorarioAtendimento,
}))

vi.mock('@/lib/ai/openrouter', () => ({
  processarRagPipeline: mocks.processarRagPipeline,
}))

vi.mock('@/lib/whatsapp/send', () => ({
  enviarMensagemWhatsapp: mocks.enviarMensagemWhatsapp,
}))

type SupabaseLog = {
  inserts: Array<{ table: string; payload: any }>
  eq: Array<{ table: string; column: string; value: unknown }>
}

function createSupabaseMock(): { client: { from: ReturnType<typeof vi.fn>; storage: any }; log: SupabaseLog } {
  const log: SupabaseLog = { inserts: [], eq: [] }

  const client = {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          log.eq.push({ table, column, value })
          return builder
        }),
        neq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        insert: vi.fn((payload: any) => {
          log.inserts.push({ table, payload })
          return builder
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'mensagens') return { data: null, error: null }
          if (table === 'clientes') return { data: { id: 'client-1', telefone: '5541999990003' }, error: null }
          if (table === 'conversas') return { data: { id: 'conversation-1', ia_ativa: true }, error: null }
          return { data: null, error: null }
        }),
        single: vi.fn(async () => ({ data: { id: `${table}-1`, ia_ativa: true }, error: null })),
      }
      return builder
    }),
    storage: { from: vi.fn(() => ({ upload: vi.fn(async () => ({ error: null })) })) },
  }

  return { client, log }
}

function signBody(body: string, secret = 'test_secret') {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
}

function metaTextPayload(messageId: string, text = 'Hello') {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      contacts: [{ profile: { name: 'Ana' }, wa_id: '5541999990003' }],
      messages: [{ from: '5541999990003', id: messageId, type: 'text', text: { body: text } }],
    } }] }],
  }
}

function metaRequest(payload: unknown) {
  const body = JSON.stringify(payload)
  return new Request('https://asados.test/api/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'x-hub-signature-256': signBody(body) },
    body,
  })
}

function evolutionRequest(messageId: string, text = 'Hello', headers: HeadersInit = { apikey: 'evolution-key' }) {
  return new Request('https://asados.test/api/webhooks/evolution', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: 'messages.upsert',
      data: {
        key: { id: messageId, fromMe: false, remoteJid: '5541999990003@s.whatsapp.net' },
        pushName: 'Ana',
        message: { conversation: text },
      },
    }),
  })
}

function telegramRequest(messageId: number, text = 'Hello') {
  return new Request('https://asados.test/api/webhooks/telegram', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'secret-token' },
    body: JSON.stringify({ message: { message_id: messageId, chat: { id: 1001, first_name: 'Ana' }, from: { id: 1001 }, text } }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => {
    if (key === 'WHATSAPP_APP_SECRET') return 'test_secret'
    if (key === 'EVOLUTION_API_KEY') return 'evolution-key'
    if (key === 'EVOLUTION_WEBHOOK_SECRET') return 'evolution-webhook-secret'
    if (key === 'EVOLUTION_API_URL') return 'https://evolution.test'
    if (key === 'EVOLUTION_INSTANCE_NAME') return 'asados-main'
    if (key === 'TELEGRAM_WEBHOOK_SECRET_TOKEN') return 'secret-token'
    return null
  })
  mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ channel: 'whatsapp', key: 'SOFIA_GLOBAL_WHATSAPP_ENABLED', enabled: true, rawValue: 'true' })
  mocks.verificarHorarioAtendimento.mockResolvedValue({ dentro: true })
  mocks.processarRagPipeline.mockReturnValue(Promise.resolve())
  mocks.enviarMensagemWhatsapp.mockResolvedValue({ sucesso: true })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
})

describe('webhook global Sofia gates', () => {
  it('rejects a placeholder Meta app secret outside local/test mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => {
      if (key === 'WHATSAPP_APP_SECRET') return 'placeholder'
      return null
    })

    const response = await postMetaWhatsApp(new Request('https://asados.test/api/webhooks/whatsapp', {
      method: 'POST',
      body: JSON.stringify({ object: 'whatsapp_business_account' }),
    }))

    expect(response.status).toBe(503)
    vi.unstubAllEnvs()
  })

  it('rejects Evolution query-string secrets before parsing the request body', async () => {
    const request = new Request('https://asados.test/api/webhooks/evolution?webhook_secret=evolution-key', {
      method: 'POST',
      body: '{',
    })

    const response = await postEvolution(request)

    expect(response.status).toBe(401)
  })

  it('accepts an Evolution webhook authenticated only by the header secret', async () => {
    const { client } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)

    const response = await postEvolution(evolutionRequest(
      'evo-header-secret',
      'Header secret',
      { 'x-webhook-secret': 'evolution-webhook-secret' },
    ))

    expect(response.status).toBe(200)
  })

  it('accepts the dedicated Evolution webhook secret from the configured query parameter', async () => {
    const { client } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)
    const request = new Request('https://asados.test/api/webhooks/evolution?webhook_secret=evolution-webhook-secret', {
      method: 'POST',
      body: JSON.stringify({ event: 'connection.update' }),
    })

    const response = await postEvolution(request)

    expect(response.status).toBe(200)
  })

  it('persists Meta WhatsApp inbound but skips schedule and RAG when global WhatsApp is off', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ channel: 'whatsapp', key: 'SOFIA_GLOBAL_WHATSAPP_ENABLED', enabled: false, rawValue: 'false' })

    const response = await postMetaWhatsApp(metaRequest(metaTextPayload('wamid.global-off-meta', 'Global off')))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.message).toBe('Sofia globalmente desativada para WhatsApp')
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({ conteudo: 'Global off', whatsapp_mensagem_id: 'wamid.global-off-meta' }),
      }),
    ]))
    expect(mocks.verificarHorarioAtendimento).not.toHaveBeenCalled()
    expect(mocks.processarRagPipeline).not.toHaveBeenCalled()
    expect(mocks.enviarMensagemWhatsapp).not.toHaveBeenCalled()
  })

  it('persists Evolution inbound but skips schedule and RAG when shared global WhatsApp is off', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ channel: 'whatsapp', key: 'SOFIA_GLOBAL_WHATSAPP_ENABLED', enabled: false, rawValue: 'false' })

    const response = await postEvolution(evolutionRequest('evo-global-off', 'Global off'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.message).toBe('Sofia globalmente desativada para WhatsApp')
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({ conteudo: 'Global off', whatsapp_mensagem_id: 'evo-global-off' }),
      }),
    ]))
    expect(mocks.verificarHorarioAtendimento).not.toHaveBeenCalled()
    expect(mocks.processarRagPipeline).not.toHaveBeenCalled()
  })

  it('persists Telegram inbound but skips schedule, direct replies, and RAG when global Telegram is off', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ channel: 'telegram', key: 'SOFIA_GLOBAL_TELEGRAM_ENABLED', enabled: false, rawValue: 'false' })

    const response = await postTelegram(telegramRequest(501, 'Global off'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, status: 'global_off' })
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({ conteudo: 'Global off', telegram_mensagem_id: 'telegram:1001:501' }),
      }),
    ]))
    expect(mocks.verificarHorarioAtendimento).not.toHaveBeenCalled()
    expect(mocks.processarRagPipeline).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps schedule-yellow priority on Evolution: sends only configured schedule text and skips RAG', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ channel: 'whatsapp', key: 'SOFIA_GLOBAL_WHATSAPP_ENABLED', enabled: true, rawValue: 'true' })
    mocks.verificarHorarioAtendimento.mockResolvedValue({ dentro: false, mensagem: 'We are closed.' })

    const response = await postEvolution(evolutionRequest('evo-yellow', 'After hours'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.message).toBe('Fora do horário de atendimento')
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({ conteudo: 'After hours', whatsapp_mensagem_id: 'evo-yellow' }),
      }),
    ]))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://evolution.test/message/sendText/asados-main',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: 'evolution-key' }),
        body: JSON.stringify({
          number: '5541999990003',
          text: 'We are closed.',
          textMessage: { text: 'We are closed.' },
        }),
      })
    )
    expect(mocks.processarRagPipeline).not.toHaveBeenCalled()
  })

  it('keeps schedule-yellow priority on Meta WhatsApp: sends only schedule text and skips RAG', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ channel: 'whatsapp', key: 'SOFIA_GLOBAL_WHATSAPP_ENABLED', enabled: true, rawValue: 'true' })
    mocks.verificarHorarioAtendimento.mockResolvedValue({ dentro: false, mensagem: 'We are closed.' })

    const response = await postMetaWhatsApp(metaRequest(metaTextPayload('wamid-yellow-meta', 'After hours')))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.message).toBe('Fora do horário de atendimento')
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({ conteudo: 'After hours', whatsapp_mensagem_id: 'wamid-yellow-meta' }),
      }),
    ]))
    expect(mocks.enviarMensagemWhatsapp).toHaveBeenCalledTimes(1)
    expect(mocks.enviarMensagemWhatsapp).toHaveBeenCalledWith('conversation-1', { texto: 'We are closed.', remetente: 'ia' })
    expect(mocks.processarRagPipeline).not.toHaveBeenCalled()
  })
})
