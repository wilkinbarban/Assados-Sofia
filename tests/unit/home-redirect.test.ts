import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redirectMock, createClientMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
  createClientMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

import Home from '@/app/page'

function query(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

function supabaseFixture({
  user = { id: 'user-1' },
  profile = { funcao: 'cliente', ativo: true },
  client = null as { id: string } | null,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) =>
      table === 'perfis' ? query({ data: profile }) : query({ data: client }),
    ),
  }
}

describe('home authentication redirect', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    [null, undefined, undefined, '/login'],
    [{ id: 'user-1' }, { funcao: 'admin', ativo: true }, undefined, '/atendimento/admin'],
    [{ id: 'user-1' }, { funcao: 'vendedor', ativo: true }, undefined, '/atendimento'],
    [{ id: 'user-1' }, { funcao: 'cliente', ativo: true }, { id: 'client-1' }, '/cliente/chat'],
    [{ id: 'user-1' }, { funcao: 'cliente', ativo: true }, null, '/cliente/verificar-telefone'],
  ])('redirects the root route to %s session destination', async (user, profile, client, expected) => {
    createClientMock.mockResolvedValue(supabaseFixture({ user, profile, client }))

    await expect(Home()).rejects.toThrow(`REDIRECT:${expected}`)
    expect(redirectMock).toHaveBeenCalledWith(expected)
  })
})
