import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pending: false }))

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, useFormStatus: () => ({ pending: mocks.pending, data: null, method: null, action: null }) }
})
vi.mock('@/app/actions/auth', () => ({ logout: vi.fn() }))

import { OperatorLogoutButton } from '@/components/operator/OperatorLogoutButton'

describe('OperatorLogoutButton', () => {
  afterEach(() => {
    cleanup()
    mocks.pending = false
  })

  it('offers an accessible pt-BR logout control', () => {
    render(<OperatorLogoutButton />)

    expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled()
  })

  it('disables the control and announces progress while logout is pending', () => {
    mocks.pending = true
    render(<OperatorLogoutButton />)

    expect(screen.getByRole('button', { name: 'Saindo…' })).toBeDisabled()
  })
})
