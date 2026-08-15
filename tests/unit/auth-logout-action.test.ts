import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import { logout } from '@/app/actions/auth'

describe('logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } })
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it('ends the Supabase session on the server and redirects to login', async () => {
    await expect(logout()).rejects.toThrow('NEXT_REDIRECT:/login')

    expect(mocks.createClient).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.redirect).toHaveBeenCalledWith('/login')
  })

  it('does not redirect when Supabase cannot end the session', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('sign out failed') })

    await expect(logout()).rejects.toThrow('sign out failed')
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
