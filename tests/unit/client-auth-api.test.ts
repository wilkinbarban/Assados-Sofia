import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  requestOtpChallenge: vi.fn(),
  finalizeClientSignupSaga: vi.fn(),
  executePasswordRecoverySaga: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/otp/service', () => ({ requestOtpChallenge: mocks.requestOtpChallenge }))
vi.mock('@/lib/auth/client-auth', () => ({
  finalizeClientSignupSaga: mocks.finalizeClientSignupSaga,
  executePasswordRecoverySaga: mocks.executePasswordRecoverySaga
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST as handleSignup } from '@/app/api/client-auth/signup/route'
import { POST as handleVerifySignup } from '@/app/api/client-auth/verify-signup/route'
import { POST as handleLogin } from '@/app/api/client-auth/login/route'
import { POST as handleRecoveryRequest } from '@/app/api/client-auth/recovery/request/route'
import { POST as handleRecoveryReset } from '@/app/api/client-auth/recovery/reset/route'

describe('Fase 4: Phone-First Client Authentication API Routes', () => {
  let mockSupabaseAdmin: any
  let mockSupabaseServer: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockSupabaseAdmin = {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          updateUserById: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
        }
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    }

    mockSupabaseServer = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' }, session: { access_token: 'tok' } },
          error: null
        })
      }
    }

    mocks.createAdminClient.mockReturnValue(mockSupabaseAdmin)
    mocks.createClient.mockResolvedValue(mockSupabaseServer)
  })

  describe('POST /api/client-auth/signup', () => {
    it('creates unconfirmed user and issues signup OTP without requiring email', async () => {
      mocks.requestOtpChallenge.mockResolvedValue({
        challengeId: 'desafio-sig-1',
        expiraEm: '2026-08-16T14:00:00Z',
        channel: 'whatsapp',
        provider: 'evolution'
      })

      const req = new Request('https://asados.test/api/client-auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          nome: 'Carlos Eduardo',
          telefone: '(41) 98888-7777',
          senha: 'SenhaForte2026!'
        })
      })

      const res = await handleSignup(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.challengeId).toBe('desafio-sig-1')
      expect(body.userId).toBe('user-123')
      expect(mocks.requestOtpChallenge).toHaveBeenCalledWith('5541988887777', 'signup', expect.anything(), 'user-123')
    })

    it('rejects signup with non-Curitiba phone number', async () => {
      const req = new Request('https://asados.test/api/client-auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          nome: 'Carlos',
          telefone: '11 99999-8888', // São Paulo DDD 11
          senha: 'SenhaForte2026!'
        })
      })

      const res = await handleSignup(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Curitiba')
    })

    it('rejects signup with weak password', async () => {
      const req = new Request('https://asados.test/api/client-auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          nome: 'Carlos',
          telefone: '41 99999-8888',
          senha: 'fraca'
        })
      })

      const res = await handleSignup(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('SENHA_FRACA')
    })
  })

  describe('POST /api/client-auth/verify-signup', () => {
    it('delegates to finalizeClientSignupSaga', async () => {
      mocks.finalizeClientSignupSaga.mockResolvedValue({
        success: true,
        clienteId: 'cliente-123'
      })

      const req = new Request('https://asados.test/api/client-auth/verify-signup', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: 'desafio-123',
          telefone: '41 99999-8888',
          codigo: '123456',
          userId: 'user-123',
          nome: 'Carlos'
        })
      })

      const res = await handleVerifySignup(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(mocks.finalizeClientSignupSaga).toHaveBeenCalledWith(expect.objectContaining({
        challengeId: 'desafio-123',
        phone: '5541999998888',
        code: '123456',
        userId: 'user-123',
        nome: 'Carlos'
      }))
    })
  })

  describe('POST /api/client-auth/login', () => {
    it('authenticates client with phone and password', async () => {
      const req = new Request('https://asados.test/api/client-auth/login', {
        method: 'POST',
        body: JSON.stringify({
          telefone: '41 99999-8888',
          senha: 'SenhaForte2026!'
        })
      })

      const res = await handleLogin(req)
      expect(res.status).toBe(200)
      expect(mockSupabaseServer.auth.signInWithPassword).toHaveBeenCalledWith({
        phone: '5541999998888',
        password: 'SenhaForte2026!'
      })
    })

    it('returns generic error on bad credentials', async () => {
      mockSupabaseServer.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' }
      })

      const req = new Request('https://asados.test/api/client-auth/login', {
        method: 'POST',
        body: JSON.stringify({
          telefone: '41 99999-8888',
          senha: 'SenhaIncorreta!'
        })
      })

      const res = await handleLogin(req)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe('Credenciais inválidas. Verifique seu telefone e senha.')
    })
  })

  describe('POST /api/client-auth/recovery/request', () => {
    it('issues recovery challenge for existing client', async () => {
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cli-1' }, error: null })
          })
        })
      })

      mocks.requestOtpChallenge.mockResolvedValue({
        challengeId: 'desafio-rec-1',
        expiraEm: '2026-08-16T14:00:00Z',
        channel: 'whatsapp',
        provider: 'evolution'
      })

      const req = new Request('https://asados.test/api/client-auth/recovery/request', {
        method: 'POST',
        body: JSON.stringify({ telefone: '41 99999-8888' })
      })

      const res = await handleRecoveryRequest(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.challengeId).toBe('desafio-rec-1')
    })
  })

  describe('POST /api/client-auth/recovery/reset', () => {
    it('delegates to executePasswordRecoverySaga', async () => {
      mocks.executePasswordRecoverySaga.mockResolvedValue({ success: true })

      const req = new Request('https://asados.test/api/client-auth/recovery/reset', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: 'desafio-rec-1',
          telefone: '41 99999-8888',
          codigo: '654321',
          novaSenha: 'NovaSenhaForte2026!'
        })
      })

      const res = await handleRecoveryReset(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(mocks.executePasswordRecoverySaga).toHaveBeenCalledWith(expect.objectContaining({
        challengeId: 'desafio-rec-1',
        phone: '5541999998888',
        code: '654321',
        newPassword: 'NovaSenhaForte2026!'
      }))
    })
  })

  describe('Server Action: atualizarPerfilCliente', () => {
    it('allows updating optional email and name for authenticated client', async () => {
      const { atualizarPerfilCliente } = await import('@/app/actions/perfil')

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })

      mockSupabaseServer.auth.getUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      })
      mockSupabaseServer.from = vi.fn().mockReturnValue({
        update: updateMock
      })

      const res = await atualizarPerfilCliente({
        nome: 'Carlos Silva',
        email: 'carlos@exemplo.com',
        endereco: 'Rua XV de Novembro, 1000'
      })

      expect(res.success).toBe(true)
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        nome: 'Carlos Silva',
        email: 'carlos@exemplo.com',
        endereco: 'Rua XV de Novembro, 1000'
      }))
    })

    it('rejects invalid email format when provided', async () => {
      const { atualizarPerfilCliente } = await import('@/app/actions/perfil')

      mockSupabaseServer.auth.getUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      })

      const res = await atualizarPerfilCliente({
        email: 'email-invalido'
      })

      expect(res.success).toBe(false)
      expect(res.error).toBe('EMAIL_INVALIDO')
    })
  })
})
