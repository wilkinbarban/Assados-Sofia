import { beforeEach, describe, expect, it, vi } from 'vitest'
const config = vi.hoisted(() => vi.fn())
vi.mock('@/lib/config/sistema', () => ({ obterConfiguracaoSistema: config }))
import { sendPaymentProofAdminAlert } from '@/lib/telegram/admin-alert'

describe('private Telegram admin alerts', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); config.mockImplementation(async (key: string) => key === 'TELEGRAM_BOT_TOKEN' ? 'token-secret' : 'chat-secret') })
  it('sends plain fixed enum-derived text and safe aggregate numbers only', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))
    await sendPaymentProofAdminAlert({ family: 'dead_letter_growth', kind: 'initial', count: 2, severity: 1 })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.telegram.org/bottoken-secret/sendMessage')
    expect(JSON.parse(String(init?.body))).toEqual({ chat_id: 'chat-secret', text: 'Payment proof alert: dead letter growth. Count 2. Severity 1.' })
    expect(String(init?.body)).not.toMatch(/parse_mode|reply_markup|caption|document/)
    expect(init?.redirect).toBe('error')
  })
  it('uses fixed errors without reflecting response, token, chat, or body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('sensitive raw response', { status: 500 }))
    await expect(sendPaymentProofAdminAlert({ family: 'expired_quarantines', kind: 'recovery', count: 0, severity: 0 })).rejects.toThrow('ADMIN_ALERT_SEND_FAILED')
  })
})
