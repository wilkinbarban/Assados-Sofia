import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  enviarOtpTelegram: vi.fn(),
  sendOtpEvolution: vi.fn(),
  sendOtpMeta: vi.fn(),
  obterProvedorAtivo: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/telegram/send', () => ({ enviarOtpTelegram: mocks.enviarOtpTelegram }))
vi.mock('@/lib/whatsapp/evolution', () => ({ sendOtpEvolution: mocks.sendOtpEvolution }))
vi.mock('@/lib/whatsapp/send', () => ({ sendOtpMeta: mocks.sendOtpMeta }))
vi.mock('@/lib/whatsapp/provider', () => ({
  obterProvedorAtivo: mocks.obterProvedorAtivo,
  inferirTipoMidia: vi.fn(),
  validarJanelaEnvio: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { hashOtpCode, verifyOtpHash } from '@/lib/otp/hash'
import { deliverOtp } from '@/lib/otp/delivery'
import { requestOtpChallenge, verifyOtpChallenge } from '@/lib/otp/service'

describe('Fase 2: Canonical OTP Delivery & Hashing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('OTP Hashing & Timing-Safe Verification', () => {
    it('produces a reproducible SHA-256 / HMAC hash of the 6-digit OTP', () => {
      const code = '123456'
      const hash = hashOtpCode(code)
      expect(hash).toBeDefined()
      expect(hash.length).toBe(64)
      expect(hashOtpCode(code)).toBe(hash)
      expect(hashOtpCode('654321')).not.toBe(hash)
    })

    it('verifies hash matching correctly and safely', () => {
      const code = '789012'
      const hash = hashOtpCode(code)
      expect(verifyOtpHash(code, hash)).toBe(true)
      expect(verifyOtpHash('000000', hash)).toBe(false)
      expect(verifyOtpHash(code, 'invalidhash')).toBe(false)
    })
  })

  describe('deliverOtp Multi-Channel Routing', () => {
    it('routes to verified Telegram first when preferredTelegramChatId is present', async () => {
      mocks.enviarOtpTelegram.mockResolvedValue({ success: true })

      const result = await deliverOtp('5541999998888', '123456', {
        preferredTelegramChatId: '123456789',
        purpose: 'signup'
      })

      expect(mocks.enviarOtpTelegram).toHaveBeenCalledWith('123456789', '123456')
      expect(mocks.sendOtpEvolution).not.toHaveBeenCalled()
      expect(mocks.sendOtpMeta).not.toHaveBeenCalled()
      expect(result.accepted).toBe(true)
      expect(result.channel).toBe('telegram')
      expect(result.provider).toBe('telegram')
    })

    it('falls back to active WhatsApp provider when Telegram send fails', async () => {
      mocks.enviarOtpTelegram.mockResolvedValue({ success: false, error: 'Telegram blocked' })
      mocks.obterProvedorAtivo.mockResolvedValue('EVOLUTION')
      mocks.sendOtpEvolution.mockResolvedValue({ sucesso: true, whatsappMensagemId: 'evo-msg-1' })

      const result = await deliverOtp('5541999998888', '123456', {
        preferredTelegramChatId: '123456789',
        purpose: 'signup'
      })

      expect(mocks.enviarOtpTelegram).toHaveBeenCalled()
      expect(mocks.sendOtpEvolution).toHaveBeenCalledWith('5541999998888', '123456')
      expect(result.accepted).toBe(true)
      expect(result.channel).toBe('whatsapp')
      expect(result.provider).toBe('evolution')
      expect(result.externalId).toBe('evo-msg-1')
    })

    it('routes directly to Evolution WhatsApp when Telegram is not linked and Evolution is active', async () => {
      mocks.obterProvedorAtivo.mockResolvedValue('EVOLUTION')
      mocks.sendOtpEvolution.mockResolvedValue({ sucesso: true, whatsappMensagemId: 'evo-msg-2' })

      const result = await deliverOtp('5541999998888', '123456')

      expect(mocks.enviarOtpTelegram).not.toHaveBeenCalled()
      expect(mocks.sendOtpEvolution).toHaveBeenCalledWith('5541999998888', '123456')
      expect(result.accepted).toBe(true)
      expect(result.provider).toBe('evolution')
    })

    it('routes directly to Meta WhatsApp when Meta is active', async () => {
      mocks.obterProvedorAtivo.mockResolvedValue('META')
      mocks.sendOtpMeta.mockResolvedValue({ sucesso: true, whatsappMensagemId: 'wamid.HBgM123' })

      const result = await deliverOtp('5541999998888', '123456')

      expect(mocks.sendOtpMeta).toHaveBeenCalledWith('5541999998888', '123456')
      expect(mocks.sendOtpEvolution).not.toHaveBeenCalled()
      expect(result.accepted).toBe(true)
      expect(result.provider).toBe('meta')
      expect(result.externalId).toBe('wamid.HBgM123')
    })

    it('returns delivery failure when the active provider fails without fallback hopping', async () => {
      mocks.obterProvedorAtivo.mockResolvedValue('EVOLUTION')
      mocks.sendOtpEvolution.mockResolvedValue({ sucesso: false, error: 'Evolution disconnected' })

      const result = await deliverOtp('5541999998888', '123456')

      expect(mocks.sendOtpEvolution).toHaveBeenCalled()
      expect(mocks.sendOtpMeta).not.toHaveBeenCalled() // MUST NOT hop to Meta
      expect(result.accepted).toBe(false)
      expect(result.failureCode).toBe('Evolution disconnected')
    })
  })

  describe('requestOtpChallenge and verifyOtpChallenge Service Coordinator', () => {
    it('creates pending challenge and activates it on successful delivery', async () => {
      const mockRpc = vi.fn()
      mockRpc
        .mockResolvedValueOnce({ data: [{ p_desafio_id: 'desafio-123', p_expira_em: '2026-08-16T14:00:00Z' }], error: null })
        .mockResolvedValueOnce({ data: null, error: null })

      mocks.createAdminClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          })
        }),
        rpc: mockRpc
      })

      mocks.obterProvedorAtivo.mockResolvedValue('EVOLUTION')
      mocks.sendOtpEvolution.mockResolvedValue({ sucesso: true, whatsappMensagemId: 'evo-123' })

      const challenge = await requestOtpChallenge(' (41) 99999-8888 ', 'signup', '192.168.1.1')

      expect(challenge.challengeId).toBe('desafio-123')
      expect(mockRpc).toHaveBeenNthCalledWith(1, 'solicitar_desafio_otp', expect.objectContaining({
        p_telefone: '5541999998888',
        p_proposito: 'signup',
        p_ip_origem: '192.168.1.1'
      }))
      expect(mockRpc).toHaveBeenNthCalledWith(2, 'ativar_desafio_otp', expect.objectContaining({
        p_desafio_id: 'desafio-123',
        p_sucesso: true
      }))
    })

    it('marks challenge as delivery_failed on send error and throws generic delivery error', async () => {
      const mockRpc = vi.fn()
      mockRpc
        .mockResolvedValueOnce({ data: [{ p_desafio_id: 'desafio-456', p_expira_em: '2026-08-16T14:00:00Z' }], error: null })
        .mockResolvedValueOnce({ data: null, error: null })

      mocks.createAdminClient.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          })
        }),
        rpc: mockRpc
      })

      mocks.obterProvedorAtivo.mockResolvedValue('EVOLUTION')
      mocks.sendOtpEvolution.mockResolvedValue({ sucesso: false, error: 'Connection refused' })

      await expect(requestOtpChallenge('41999998888', 'signup')).rejects.toThrow('FALHA_ENTREGA_OTP')

      expect(mockRpc).toHaveBeenNthCalledWith(2, 'ativar_desafio_otp', expect.objectContaining({
        p_desafio_id: 'desafio-456',
        p_sucesso: false
      }))
    })

    it('verifies challenge atomically via RPC finalizar_desafio_otp', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [{ sucesso: true, codigo_erro: null, cliente_id: 'cliente-abc' }],
        error: null
      })
      mocks.createAdminClient.mockReturnValue({ rpc: mockRpc })

      const result = await verifyOtpChallenge('desafio-123', '41999998888', 'signup', '123456', {
        nome: 'Novo Cliente'
      })

      expect(result.success).toBe(true)
      expect(result.clienteId).toBe('cliente-abc')
      expect(mockRpc).toHaveBeenCalledWith('finalizar_desafio_otp', expect.objectContaining({
        p_desafio_id: 'desafio-123',
        p_telefone: '5541999998888',
        p_proposito: 'signup',
        p_nome: 'Novo Cliente'
      }))
    })
  })
})
