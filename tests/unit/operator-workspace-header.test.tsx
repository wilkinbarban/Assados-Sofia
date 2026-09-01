import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperatorWorkspaceHeader } from '@/components/operator/OperatorWorkspaceHeader'

vi.mock('@/app/actions/auth', () => ({ logout: vi.fn() }))

describe('OperatorWorkspaceHeader', () => {
  afterEach(cleanup)

  it.each([
    ['admin', ['Atendimento', 'Pedidos', 'Administração', 'Meu Perfil']],
    ['supervisor', ['Atendimento', 'Pedidos', 'Operacional & Vendas', 'Governança & Gestão', 'Estoque', 'Base RAG', 'Meu Perfil']],
    ['vendedor', ['Atendimento', 'Pedidos', 'Meu Perfil']],
  ])('renders the %s workspace role matrix with one logout', (role, expected) => {
    render(<OperatorWorkspaceHeader active="perfil" role={role} />)
    const nav = screen.getByRole('navigation', { name: 'Módulos do atendimento' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(expected)
    expect(screen.getAllByRole('button', { name: 'Sair' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Meu Perfil' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('operator-workspace-header')).toHaveClass('overflow-hidden')
  })
})
