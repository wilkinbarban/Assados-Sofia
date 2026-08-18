import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { POST } from '@/app/api/auth/verify-otp/route'

const user = { id: '11111111-1111-4111-8111-111111111111' }

function request(codigo: string) {
  return new Request('https://asados.test/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ telefone: '41 99999-9999', codigo }),
  })
}

function adminClient(otp: Record<string, unknown>) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [otp], error: null }) }),
      }),
    }),
  })

  return {
    from: vi.fn((table: string) => table === 'codigos_verificacao'
      ? { select, update }
      : undefined),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    update,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } })
})

describe('OTP verification', () => {
  it('verifies an active code and merges the authenticated account', async () => {
    const admin = adminClient({ id: 'otp-1', codigo: '123456', tentativas: 0, expira_em: new Date(Date.now() + 60_000).toISOString() })
    mocks.createAdminClient.mockReturnValue(admin)

    const response = await POST(request('123456'))

    expect(response.status).toBe(200)
    expect(admin.update).toHaveBeenCalledWith({ verificado: true })
    expect(admin.rpc).toHaveBeenCalledWith('mesclar_contas', expect.objectContaining({ p_usuario_id: user.id, p_telefone: '5541999999999' }))
  })

  it('rejects an expired code without marking it verified', async () => {
    const admin = adminClient({ id: 'otp-1', codigo: '123456', tentativas: 0, expira_em: new Date(Date.now() - 1).toISOString() })
    mocks.createAdminClient.mockReturnValue(admin)

    const response = await POST(request('123456'))

    expect(response.status).toBe(400)
    expect(admin.update).not.toHaveBeenCalled()
  })

  it('increments attempts for an incorrect active code', async () => {
    const admin = adminClient({ id: 'otp-1', codigo: '123456', tentativas: 1, expira_em: new Date(Date.now() + 60_000).toISOString() })
    mocks.createAdminClient.mockReturnValue(admin)

    const response = await POST(request('654321'))

    expect(response.status).toBe(400)
    expect(admin.rpc).toHaveBeenCalledWith('incrementar_tentativas_otp', { p_otp_id: 'otp-1' })
  })

  it('blocks a code with exhausted attempts before side effects', async () => {
    const admin = adminClient({ id: 'otp-1', codigo: '123456', tentativas: 3, expira_em: new Date(Date.now() + 60_000).toISOString() })
    mocks.createAdminClient.mockReturnValue(admin)

    const response = await POST(request('123456'))

    expect(response.status).toBe(429)
    expect(admin.update).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
  })
})
