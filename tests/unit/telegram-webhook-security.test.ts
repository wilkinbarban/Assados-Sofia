import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/webhooks/telegram/route'
import { deriveTelegramMessageKey } from '@/lib/telegram/idempotency'
import { enviarMensagemTelegram } from '@/lib/telegram/send'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  obterConfiguracaoSistema: vi.fn(),
  obterSofiaGlobalChannelConfig: vi.fn(),
  verificarHorarioAtendimento: vi.fn(),
  processarRagPipeline: vi.fn(),
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

type SupabaseCallLog = {
  eq: Array<{ table: string; column: string; value: unknown }>
  inserts: Array<{ table: string; payload: unknown }>
  updates: Array<{ table: string; payload: unknown }>
}

function makeRequest(body: unknown, secret = 'secret-token') {
  return new Request('https://asados.test/api/webhooks/telegram', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify(body),
  })
}

function makeRejectingBodyRequest(secret?: string) {
  return {
    headers: new Headers(secret ? { 'x-telegram-bot-api-secret-token': secret } : undefined),
    json: vi.fn(() => {
      throw new Error('Body should not be parsed')
    }),
  } as unknown as Request & { json: ReturnType<typeof vi.fn> }
}

function createSupabaseMock(options: { persistTelegramKeys?: boolean; cliente?: { id: string; telefone: string | null } | null } = {}): { client: { from: ReturnType<typeof vi.fn> }; log: SupabaseCallLog } {
  const log: SupabaseCallLog = { eq: [], inserts: [], updates: [] }
  const persistedTelegramKeys = new Set<string>()

  const client = {
    from: vi.fn((table: string) => {
      let lastTelegramMessageKey: string | null = null

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          log.eq.push({ table, column, value })
          if (table === 'mensagens' && column === 'telegram_mensagem_id') {
            lastTelegramMessageKey = String(value)
          }
          return builder
        }),
        neq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        insert: vi.fn((payload: unknown) => {
          log.inserts.push({ table, payload })
          if (
            options.persistTelegramKeys &&
            table === 'mensagens' &&
            payload &&
            typeof payload === 'object' &&
            'telegram_mensagem_id' in payload
          ) {
            persistedTelegramKeys.add(String(payload.telegram_mensagem_id))
          }
          return builder
        }),
        update: vi.fn((payload: unknown) => {
          log.updates.push({ table, payload })
          return builder
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'mensagens') {
            return {
              data: lastTelegramMessageKey && persistedTelegramKeys.has(lastTelegramMessageKey)
                ? { id: `message-${lastTelegramMessageKey}` }
                : null,
              error: null,
            }
          }
          if (table === 'clientes') {
            return { data: options.cliente === undefined ? { id: 'client-1', telefone: '5541999999999' } : options.cliente, error: null }
          }
          if (table === 'conversas') return { data: { id: 'conversation-1', ia_ativa: true }, error: null }
          return { data: null, error: null }
        }),
        single: vi.fn(async () => {
          if (table === 'conversas') {
            return {
              data: { id: 'conversation-1', cliente_id: 'client-1', clientes: { telegram_chat_id: '1001' }, ia_ativa: true },
              error: null,
            }
          }
          return { data: { id: `${table}-1`, ia_ativa: true }, error: null }
        }),
      }

      return builder
    }),
  }

  return { client, log }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.obterConfiguracaoSistema.mockResolvedValue('secret-token')
  mocks.obterSofiaGlobalChannelConfig.mockResolvedValue({ channel: 'telegram', key: 'SOFIA_GLOBAL_TELEGRAM_ENABLED', enabled: true, rawValue: 'true' })
  mocks.verificarHorarioAtendimento.mockResolvedValue({ dentro: true })
  mocks.processarRagPipeline.mockReturnValue(Promise.resolve())
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 44 } }), { status: 200 })))
})

describe('Telegram webhook security', () => {
  it('rejects missing and mismatched secret headers before parsing the request body', async () => {
    for (const request of [makeRejectingBodyRequest(), makeRejectingBodyRequest('wrong-secret')]) {
      const response = await POST(request)

      expect(response.status).toBe(401)
      expect(request.json).not.toHaveBeenCalled()
    }
  })

  it('continues processing when the secret header matches', async () => {
    const { client } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(makeRequest({
      message: {
        message_id: 12,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        text: 'Olá',
      },
    }))

    expect(response.status).toBe(200)
    expect(mocks.createAdminClient).toHaveBeenCalled()
  })

  it('warns but accepts and processes a valid request when the webhook secret is unset', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)
    mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => {
      if (key === 'TELEGRAM_WEBHOOK_SECRET_TOKEN') return null
      return 'bot-token'
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await POST(makeRequest({
      message: {
        message_id: 13,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        text: 'Olá',
      },
    }, 'any-secret'))

    expect(response.status).toBe(200)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('TELEGRAM_WEBHOOK_SECRET_TOKEN is not configured'))
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({
          conteudo: 'Olá',
          telegram_mensagem_id: 'telegram:1001:13',
        }),
      }),
    ]))
    expect(mocks.processarRagPipeline).toHaveBeenCalledWith('conversation-1', 'Olá', 'telegram')

    warnSpy.mockRestore()
  })

  it('rejects an unset webhook secret outside local/test mode before parsing the request body', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.obterConfiguracaoSistema.mockImplementation(async (key: string) => {
      if (key === 'TELEGRAM_WEBHOOK_SECRET_TOKEN') return null
      return 'bot-token'
    })
    const request = makeRejectingBodyRequest('any-secret')

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(request.json).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('derives scoped idempotency keys for equal message ids in different chats', async () => {
    expect(deriveTelegramMessageKey(1001, 7)).toBe('telegram:1001:7')
    expect(deriveTelegramMessageKey(2002, 7)).toBe('telegram:2002:7')

    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)

    await POST(makeRequest({ message: { message_id: 7, chat: { id: 1001 }, from: { id: 1001 }, text: 'Oi' } }))
    await POST(makeRequest({ message: { message_id: 7, chat: { id: 2002 }, from: { id: 2002 }, text: 'Oi' } }))

    expect(log.eq).toEqual(expect.arrayContaining([
      { table: 'mensagens', column: 'telegram_mensagem_id', value: 'telegram:1001:7' },
      { table: 'mensagens', column: 'telegram_mensagem_id', value: 'telegram:2002:7' },
    ]))
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({ telegram_mensagem_id: 'telegram:1001:7' }),
      }),
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({ telegram_mensagem_id: 'telegram:2002:7' }),
      }),
    ]))
  })



  it('stores outbound Telegram messages with the same scoped key shape', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)

    const result = await enviarMensagemTelegram('conversation-1', { texto: 'Resposta', remetente: 'ia' })

    expect(result.messageId).toBe('telegram:1001:44')
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({ telegram_mensagem_id: 'telegram:1001:44' }),
      }),
    ]))
  })

  it('persists missing-phone text before welcome prompts and ignores duplicate retries before sending them again', async () => {
    const { client, log } = createSupabaseMock({ persistTelegramKeys: true, cliente: null })
    mocks.createAdminClient.mockReturnValue(client)

    const update = {
      message: {
        message_id: 79,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        text: 'Olá',
      },
    }

    const firstResponse = await POST(makeRequest(update))
    const firstBody = await firstResponse.json()
    const secondResponse = await POST(makeRequest(update))
    const secondBody = await secondResponse.json()

    expect(firstResponse.status).toBe(200)
    expect(firstBody).toEqual({ ok: true })
    expect(secondResponse.status).toBe(200)
    expect(secondBody).toEqual({ ok: true, status: 'duplicate' })
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'clientes',
        payload: expect.objectContaining({
          nome: 'Ana',
          telegram_chat_id: '1001',
          telefone: null,
        }),
      }),
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({
          conversa_id: 'conversation-1',
          remetente: 'cliente',
          conteudo: 'Olá',
          telegram_mensagem_id: 'telegram:1001:79',
        }),
      }),
    ]))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mocks.verificarHorarioAtendimento).toHaveBeenCalledTimes(1)
    expect(mocks.processarRagPipeline).not.toHaveBeenCalled()
  })

  it('persists existing-client missing-phone text before direct prompts', async () => {
    const { client, log } = createSupabaseMock({ cliente: { id: 'client-1', telefone: null } })
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(makeRequest({
      message: {
        message_id: 80,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        text: 'Olá',
      },
    }))

    expect(response.status).toBe(200)
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({
          conversa_id: 'conversation-1',
          conteudo: 'Olá',
          telegram_mensagem_id: 'telegram:1001:80',
        }),
      }),
    ]))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mocks.processarRagPipeline).not.toHaveBeenCalled()
  })

  it('persists out-of-hours messages before direct response and ignores duplicate retries before sending again', async () => {
    const { client, log } = createSupabaseMock({ persistTelegramKeys: true })
    mocks.createAdminClient.mockReturnValue(client)
    mocks.verificarHorarioAtendimento.mockResolvedValue({ dentro: false, mensagem: 'We are closed now.' })

    const update = {
      message: {
        message_id: 77,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        text: 'Olá',
      },
    }

    const firstResponse = await POST(makeRequest(update))
    const firstBody = await firstResponse.json()
    const secondResponse = await POST(makeRequest(update))
    const secondBody = await secondResponse.json()

    expect(firstResponse.status).toBe(200)
    expect(firstBody).toEqual({ ok: true, status: 'out_of_hours' })
    expect(secondResponse.status).toBe(200)
    expect(secondBody).toEqual({ ok: true, status: 'duplicate' })
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({
          conversa_id: 'conversation-1',
          remetente: 'cliente',
          conteudo: 'Olá',
          telegram_mensagem_id: 'telegram:1001:77',
        }),
      }),
    ]))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '1001', text: 'We are closed now.' }),
      })
    )
    expect(mocks.verificarHorarioAtendimento).toHaveBeenCalledTimes(1)
    expect(mocks.processarRagPipeline).not.toHaveBeenCalled()
  })

  it('stores normal text messages and invokes the Telegram RAG pipeline with the resolved conversation', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(makeRequest({
      message: {
        message_id: 78,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        text: 'Olá',
      },
    }))

    expect(response.status).toBe(200)
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({
          conversa_id: 'conversation-1',
          remetente: 'cliente',
          conteudo: 'Olá',
          telegram_mensagem_id: 'telegram:1001:78',
        }),
      }),
    ]))
    expect(mocks.processarRagPipeline).toHaveBeenCalledWith('conversation-1', 'Olá', 'telegram')
  })

  it('updates the client from an owned contact and continues with direct confirmation plus RAG', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(makeRequest({
      message: {
        message_id: 35,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        contact: { first_name: 'Ana Contact', phone_number: '+55 41 99999-0000', user_id: 1001 },
      },
    }))
    const safeContactDisplay = '[📱 Contact shared: Ana Contact — +5541999990000]'
    const clientUpdate = log.updates.find((entry) => entry.table === 'clientes')
    const dataAtualizacao = (clientUpdate?.payload as { data_atualizacao?: string } | undefined)?.data_atualizacao

    expect(response.status).toBe(200)
    expect(clientUpdate?.payload).toEqual(expect.objectContaining({
      telefone: '5541999990000',
      nome: 'Ana Contact',
      data_atualizacao: expect.any(String),
    }))
    expect(typeof dataAtualizacao).toBe('string')
    expect(Number.isNaN(Date.parse(dataAtualizacao as string))).toBe(false)
    expect(log.eq).toEqual(expect.arrayContaining([
      { table: 'clientes', column: 'id', value: 'client-1' },
    ]))
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({
          conversa_id: 'conversation-1',
          remetente: 'cliente',
          conteudo: safeContactDisplay,
          telegram_mensagem_id: 'telegram:1001:35',
        }),
      }),
    ]))
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Obrigado, Ana Contact'),
      })
    )
    expect(mocks.processarRagPipeline).toHaveBeenCalledWith('conversation-1', safeContactDisplay, 'telegram')
  })

  it('stores unverified contact messages without updating the client phone', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(makeRequest({
      message: {
        message_id: 33,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        contact: { first_name: 'Outro', phone_number: '+55 41 99999-0000', user_id: 9999 },
      },
    }))
    const responseBody = await response.json()

    expect(response.status).toBe(200)
    expect(responseBody.status).toBe('contact_unverified')
    expect(log.updates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'clientes',
        payload: expect.objectContaining({ telefone: expect.any(String) }),
      }),
    ]))
    expect(log.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'mensagens',
        payload: expect.objectContaining({
          conteudo: '[📱 Contact shared without verified ownership: Outro]',
          telegram_mensagem_id: 'telegram:1001:33',
        }),
      }),
    ]))
  })

  it('does not update the client phone when contact ownership is missing', async () => {
    const { client, log } = createSupabaseMock()
    mocks.createAdminClient.mockReturnValue(client)

    await POST(makeRequest({
      message: {
        message_id: 34,
        chat: { id: 1001, first_name: 'Ana' },
        from: { id: 1001 },
        contact: { first_name: 'Contato', phone_number: '+55 41 99999-0000' },
      },
    }))

    expect(log.updates).toHaveLength(0)
  })
})
