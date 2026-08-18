import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import ClienteNav from '@/components/cliente/ClienteNav'

const mockUsePathname = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

describe('ClienteNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders both navigation links', () => {
    mockUsePathname.mockReturnValue('/cliente/chat')
    render(<ClienteNav />)

    expect(screen.getByRole('link', { name: /chat/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /perfil/i })).toBeInTheDocument()
  })

  it('highlights Chat link when path is /cliente/chat', () => {
    mockUsePathname.mockReturnValue('/cliente/chat')
    render(<ClienteNav />)

    const chatLink = screen.getByRole('link', { name: /chat/i })
    const perfilLink = screen.getByRole('link', { name: /perfil/i })

    expect(chatLink.className).toContain('text-amber-400')
    expect(chatLink.className).toContain('bg-amber-500/15')
    expect(perfilLink.className).not.toContain('bg-amber-500/15')
    expect(perfilLink.className).toContain('text-zinc-400')
  })

  it('highlights Perfil link when path is /cliente/perfil', () => {
    mockUsePathname.mockReturnValue('/cliente/perfil')
    render(<ClienteNav />)

    const chatLink = screen.getByRole('link', { name: /chat/i })
    const perfilLink = screen.getByRole('link', { name: /perfil/i })

    expect(perfilLink.className).toContain('text-amber-400')
    expect(perfilLink.className).toContain('bg-amber-500/15')
    expect(chatLink.className).not.toContain('bg-amber-500/15')
    expect(chatLink.className).toContain('text-zinc-400')
  })
})
