import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OperatorTopNavigation } from '@/components/operator/OperatorTopNavigation'

const linkNames = () => within(screen.getByRole('navigation', { name: 'Módulos do atendimento' }))
  .getAllByRole('link')
  .map((link) => link.textContent)

describe('OperatorTopNavigation', () => {
  afterEach(cleanup)

  it('shows the compact admin navigation without redundant stock or RAG links', () => {
    render(<OperatorTopNavigation active="atendimento" role="admin" />)

    const navigation = screen.getByRole('navigation', { name: 'Módulos do atendimento' })
    expect(navigation).toHaveAttribute('data-visual-treatment', 'segmented')
    expect(navigation).toHaveAttribute('data-header-alignment', 'adjacent-to-logout')
    expect(screen.getByRole('link', { name: 'Atendimento' })).toHaveAttribute('aria-current', 'page')
    expect(linkNames()).toEqual(['Atendimento', 'Pedidos', 'Administração', 'Meu Perfil'])
    expect(screen.queryByRole('link', { name: 'Estoque' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Base RAG' })).not.toBeInTheDocument()
  })

  it('keeps restricted and unavailable modules out of seller navigation', () => {
    render(<OperatorTopNavigation active="pedidos" role="vendedor" />)

    expect(screen.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('aria-current', 'page')
    expect(linkNames()).toEqual(['Atendimento', 'Pedidos', 'Meu Perfil'])
    expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Base RAG' })).not.toBeInTheDocument()
  })

  it('replaces generic administration with safe admin-group landing links for supervisors', () => {
    render(<OperatorTopNavigation active="atendimento" role="supervisor" />)

    expect(linkNames()).toEqual([
      'Atendimento',
      'Pedidos',
      'Operacional & Vendas',
      'Governança & Gestão',
      'Estoque',
      'Base RAG',
      'Meu Perfil',
    ])
    expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Operacional & Vendas' })).toHaveAttribute(
      'href',
      '/atendimento/admin?tab=estoque',
    )
    expect(screen.getByRole('link', { name: 'Governança & Gestão' })).toHaveAttribute(
      'href',
      '/atendimento/admin?tab=operadores',
    )
  })
})

  it('distinguishes the active supervisor administration destination by tab', () => {
    const { rerender } = render(<OperatorTopNavigation active="admin" role="supervisor" adminTab="estoque" />)

    expect(screen.getByRole('link', { name: 'Operacional & Vendas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Governança & Gestão' })).not.toHaveAttribute('aria-current')

    rerender(<OperatorTopNavigation active="admin" role="supervisor" adminTab="operadores" />)
    expect(screen.getByRole('link', { name: 'Governança & Gestão' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Operacional & Vendas' })).not.toHaveAttribute('aria-current')
  })
