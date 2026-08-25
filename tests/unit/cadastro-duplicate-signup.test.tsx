import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ push: vi.fn(), signInWithPassword: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }) }))
vi.mock('@/components/ui/BrandLogo', () => ({ BrandLogo: () => <div>Brand</div> }))

import CadastroPage from '@/app/cadastro/page'

async function submitSignup() {
  fireEvent.change(screen.getByLabelText('Nome Completo'), { target: { value: 'Maria Silva' } })
  fireEvent.change(screen.getByLabelText('Celular de Curitiba (DDD 41)'), { target: { value: '41999999999' } })
  fireEvent.change(screen.getByLabelText('Senha de Acesso'), { target: { value: 'S3guraSenha' } })
  fireEvent.click(screen.getByRole('button', { name: /continuar para verificação/i }))
}

describe('signup duplicate continuation UI', () => {
  afterEach(cleanup)
  beforeEach(() => { vi.restoreAllMocks(); global.fetch = vi.fn() as any })

  it('keeps duplicate signup in the form and does not expose verification or resend', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: false, continuation: 'CHECK_YOUR_EXISTING_SIGNUP_OR_RECOVER_ACCOUNT' }) })
    render(<CadastroPage />)
    await submitSignup()
    await waitFor(() => expect(screen.getByText(/recupere o acesso/i)).toBeInTheDocument())
    expect(screen.getByLabelText('Nome Completo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Código de 6 dígitos')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reenviar código/i })).not.toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('moves a new signup to verification and allows its resend', async () => {
    ;(global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, challengeId: 'new-challenge', userId: 'new-user', channel: 'whatsapp' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, challengeId: 'resent-challenge', userId: 'new-user', channel: 'whatsapp' }) })
    render(<CadastroPage />)
    await submitSignup()
    await waitFor(() => expect(screen.getByLabelText('Código de 6 dígitos')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /reenviar em/i })).toBeInTheDocument()
  })
})
