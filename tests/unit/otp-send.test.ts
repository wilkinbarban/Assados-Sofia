import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  enviarOtpTelegram: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/telegram/send', () => ({ enviarOtpTelegram: mocks.enviarOtpTelegram }))

import { POST } from '@/app/api/auth/otp/route'

function request() {
  return new Request('https://asados.test/api/auth/otp', {
    method: 'POST',
    body: JSON.stringify({ telefone: '41 99999-9999' }),
  })
}

function adminClient(options: { recent?: boolean; client?: { telegram_chat_id: string | null; telefone: string | null } | null }) {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const rateLimit = {
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: options.recent ? [{}] : [], error: null }),
  }
  const customer = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: options.client ?? null, error: null }),
  }

  return {
    from: vi.fn((table: string) => table === 'codigos_verificacao'
      ? { select: vi.fn().mockReturnValue(rateLimit), insert }
      : { select: vi.fn().mockReturnValue(customer) }),
    insert,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
  })
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'whatsapp-token')
  vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'phone-id')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
})

afterEach(() => vi.unstubAllEnvs())

describe('OTP delivery', () => {
  it('enforces the request cooldown before creating or sending a code', async () => {
    const admin = adminClient({ recent: true })
    mocks.createAdminClient.mockReturnValue(admin)

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(admin.insert).not.toHaveBeenCalled()
    expect(mocks.enviarOtpTelegram).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('delivers through Telegram first when both channels are available', async () => {
    const admin = adminClient({ client: { telegram_chat_id: 'telegram-chat', telefone: '5541999999999' } })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.enviarOtpTelegram.mockResolvedValue({ success: true })

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ canal: 'telegram' })
    expect(mocks.enviarOtpTelegram).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to WhatsApp only after Telegram delivery fails', async () => {
    const admin = adminClient({ client: { telegram_chat_id: 'telegram-chat', telefone: '5541999999999' } })
    mocks.createAdminClient.mockReturnValue(admin)
    mocks.enviarOtpTelegram.mockResolvedValue({ success: false, error: 'unavailable' })

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ canal: 'whatsapp' })
    expect(mocks.enviarOtpTelegram).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/phone-id/messages'), expect.any(Object))
  })
})
