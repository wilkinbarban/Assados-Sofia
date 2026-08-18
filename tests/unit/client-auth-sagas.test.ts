import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  verifyOtpChallenge: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/otp/service', () => ({
  verifyOtpChallenge: mocks.verifyOtpChallenge,
  requestOtpChallenge: vi.fn()
}))

import { finalizeClientSignupSaga, executePasswordRecoverySaga } from '@/lib/auth/client-auth'

describe('Fase 3: Atomic Finalization & Idempotent GoTrue Sagas', () => {
  let mockSupabaseAdmin: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockSupabaseAdmin = {
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
          listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: 'user-1', phone: '5541999998888' }] }, error: null })
        }
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { usuario_id: 'user-1' }, error: null })
          })
        })
      }),
      rpc: vi.fn()
    }

    mocks.createAdminClient.mockReturnValue(mockSupabaseAdmin)
  })

  describe('finalizeClientSignupSaga', () => {
    it('successfully confirms Supabase phone when OTP verification succeeds', async () => {
      mocks.verifyOtpChallenge.mockResolvedValue({ success: true, clienteId: 'cliente-1' })

      const result = await finalizeClientSignupSaga({
        challengeId: 'desafio-1',
        phone: '41999998888',
        code: '123456',
        userId: 'user-1',
        nome: 'Cliente Teste'
      })

      expect(result.success).toBe(true)
      expect(mocks.verifyOtpChallenge).toHaveBeenCalledWith('desafio-1', '41999998888', 'signup', '123456', {
        userId: 'user-1',
        nome: 'Cliente Teste',
        origemVerificacao: 'whatsapp'
      })
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', {
        phone_confirm: true
      })
    })

    it('aborts and never calls GoTrue when OTP verification fails', async () => {
      mocks.verifyOtpChallenge.mockResolvedValue({ success: false, error: 'CODIGO_INVALIDO' })

      const result = await finalizeClientSignupSaga({
        challengeId: 'desafio-1',
        phone: '41999998888',
        code: '000000',
        userId: 'user-1'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('CODIGO_INVALIDO')
      expect(mockSupabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    })

    it('returns retryable error state when GoTrue phone confirmation fails', async () => {
      mocks.verifyOtpChallenge.mockResolvedValue({ success: true, clienteId: 'cliente-1' })
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: null,
        error: { message: 'Database lock timeout in Auth' }
      })

      const result = await finalizeClientSignupSaga({
        challengeId: 'desafio-1',
        phone: '41999998888',
        code: '123456',
        userId: 'user-1'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('FALHA_CONFIRMACAO_AUTH')
    })
  })

  describe('executePasswordRecoverySaga', () => {
    it('executes atomic recovery grant consumption and idempotent GoTrue password update', async () => {
      // 1. RPC consumir_desafio_recuperacao returns token and grant id
      mockSupabaseAdmin.rpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'consumir_desafio_recuperacao') {
          return Promise.resolve({
            data: [{ sucesso: true, codigo_erro: null, token: 'raw-token-123', concessao_id: 'grant-456' }],
            error: null
          })
        }
        if (rpcName === 'aplicar_concessao_recuperacao') {
          return Promise.resolve({
            data: [{ sucesso: true, usuario_id: 'user-1' }],
            error: null
          })
        }
        return Promise.resolve({ data: null, error: null })
      })

      const result = await executePasswordRecoverySaga({
        challengeId: 'desafio-rec-1',
        phone: '5541999998888',
        code: '654321',
        newPassword: 'NovaSenhaForte2026!'
      })

      expect(result.success).toBe(true)
      expect(mockSupabaseAdmin.rpc).toHaveBeenNthCalledWith(1, 'consumir_desafio_recuperacao', expect.objectContaining({
        p_desafio_id: 'desafio-rec-1',
        p_telefone: '5541999998888'
      }))
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', {
        password: 'NovaSenhaForte2026!'
      })
      expect(mockSupabaseAdmin.rpc).toHaveBeenNthCalledWith(2, 'aplicar_concessao_recuperacao', {
        p_concessao_id: 'grant-456',
        p_token: 'raw-token-123'
      })
    })

    it('rejects passwords that violate complexity before executing any database mutations', async () => {
      const result = await executePasswordRecoverySaga({
        challengeId: 'desafio-rec-1',
        phone: '5541999998888',
        code: '654321',
        newPassword: 'fraca'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('SENHA_FRACA')
      expect(mockSupabaseAdmin.rpc).not.toHaveBeenCalled()
      expect(mockSupabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    })

    it('leaves grant unapplied when GoTrue password update fails', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValueOnce({
        data: [{ sucesso: true, codigo_erro: null, token: 'raw-token-123', concessao_id: 'grant-456' }],
        error: null
      })

      // GoTrue fails
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: null,
        error: { message: 'Auth service down' }
      })

      const result = await executePasswordRecoverySaga({
        challengeId: 'desafio-rec-1',
        phone: '5541999998888',
        code: '654321',
        newPassword: 'NovaSenhaForte2026!'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('FALHA_ATUALIZACAO_SENHA')
      // Must not mark grant as applied if password update failed
      expect(mockSupabaseAdmin.rpc).not.toHaveBeenCalledWith('aplicar_concessao_recuperacao', expect.any(Object))
    })
  })
})
