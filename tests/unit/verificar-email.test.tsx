import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import VerificarEmailClient from '@/app/verificar-email/VerificarEmailClient'

afterEach(() => {
  cleanup()
})

describe('VerificarEmailClient', () => {
  it('renders standard redirect link pointing to /cliente/chat if next is not provided', () => {
    render(<VerificarEmailClient sucesso="true" next={null} />)

    const continueBtn = screen.getByRole('link', { name: /continuar/i })
    expect(continueBtn).toHaveAttribute('href', '/cliente/chat')
  })

  it('renders custom redirect link if next is provided', () => {
    render(<VerificarEmailClient sucesso="true" next="/custom-path" />)

    const continueBtn = screen.getByRole('link', { name: /continuar/i })
    expect(continueBtn).toHaveAttribute('href', '/custom-path')
  })
})
