import { describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { proxy as middleware } from '../../apps/web/proxy'
import AtendimentoPage from '@/app/atendimento/page'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  updateSession: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: mocks.updateSession,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/components/operator/OperatorInboxContainer', () => ({
  default: () => null,
}))

vi.mock('@/app/actions/atendimento', () => ({
  obterStatusSofiaAtendimento: vi.fn(),
}))

function profileClient(funcao: string, ativo = true) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { funcao, ativo },
        error: null,
      }),
    })),
  }
}

function request(pathname: string) {
  return new NextRequest(`https://asados.test${pathname}`)
}

describe('atendimento authorization', () => {
  it('redirects an unauthenticated visitor to login while preserving the internal destination', async () => {
    mocks.updateSession.mockResolvedValue({
      supabase: null,
      user: null,
      response: NextResponse.next(),
    })

    const response = await middleware(request('/atendimento/perfil?tab=inbox'))

    expect(response.headers.get('location')).toBe('https://asados.test/login?next=%2Fatendimento%2Fperfil%3Ftab%3Dinbox')
  })

  it('redirects an authenticated client to login in middleware', async () => {
    mocks.updateSession.mockResolvedValue({
      supabase: profileClient('cliente'),
      user: { id: 'user-123' },
      response: NextResponse.next(),
    })

    const response = await middleware(request('/atendimento'))

    expect(response.headers.get('location')).toBe('https://asados.test/login')
  })

  it.each(['admin', 'supervisor', 'vendedor'])('allows an active %s through middleware', async (funcao) => {
    mocks.updateSession.mockResolvedValue({
      supabase: profileClient(funcao),
      user: { id: 'user-123' },
      response: NextResponse.next(),
    })

    const response = await middleware(request('/atendimento'))

    expect(response.status).toBe(200)
  })

  it('redirects an authenticated client before the atendimento page renders', async () => {
    mocks.createClient.mockResolvedValue(profileClient('cliente'))

    await expect(AtendimentoPage()).rejects.toThrow('redirect:/login')
    expect(mocks.redirect).toHaveBeenCalledWith('/login')
  })
})
