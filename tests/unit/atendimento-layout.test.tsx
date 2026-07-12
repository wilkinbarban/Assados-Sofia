import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import AtendimentoLayout from '@/app/atendimento/layout'

// Mock InactivityLogout
vi.mock('@/components/operator/InactivityLogout', () => ({
  default: () => <div data-testid="inactivity-mock" />
}))

describe('AtendimentoLayout', () => {
  it('renders children and mounts InactivityLogout', () => {
    render(
      <AtendimentoLayout>
        <div data-testid="child-content">Atendimento page content</div>
      </AtendimentoLayout>
    )

    expect(screen.getByTestId('inactivity-mock')).toBeInTheDocument()
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })
})
