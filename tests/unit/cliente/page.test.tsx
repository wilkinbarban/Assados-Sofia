import { describe, expect, it, vi } from 'vitest'
import ClientePage from '@/app/cliente/page'
import { redirect } from 'next/navigation'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('ClientePage', () => {
  it('redirects from /cliente to /cliente/chat', () => {
    ClientePage()
    expect(redirect).toHaveBeenCalledWith('/cliente/chat')
  })
})
