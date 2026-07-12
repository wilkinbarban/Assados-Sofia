import React from 'react'
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import PerfilPage from '@/app/cliente/perfil/page'

afterEach(() => {
  cleanup()
})

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

const mockGetUser = vi.fn()
const mockUpdate = vi.fn()
const mockFrom = vi.fn()

const mockSupabaseInstance = {
  auth: {
    getUser: mockGetUser,
    signOut: vi.fn(),
    updateUser: vi.fn(async () => ({ data: {}, error: null })),
  },
  from: mockFrom,
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabaseInstance,
}))

describe('PerfilPage (migrated configurations page)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Explicitly define mock implementation before every single test
    mockGetUser.mockImplementation(async () => ({
      data: { user: { id: 'user-1', email: 'john@example.com' } },
      error: null,
    }))

    mockUpdate.mockImplementation(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }))

    mockFrom.mockImplementation((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(async () => {
          if (table === 'perfis') {
            return { data: { nome: 'John Doe' }, error: null }
          }
          if (table === 'clientes') {
            return { data: { telefone: '5541999999999', endereco: 'Rua das Flores, 123' }, error: null }
          }
          return { data: null, error: null }
        }),
        update: mockUpdate,
      }
      return builder
    })
  })

  it('renders loading state initially and then shows values from Supabase', async () => {
    render(<PerfilPage />)

    expect(screen.getByText(/Carregando configurações de perfil/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByText(/Carregando configurações de perfil/i)).not.toBeInTheDocument()
    })

    expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument()
    expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('(41) 9 9999-9999')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Rua das Flores, 123')).toBeInTheDocument()
  })

  it('validates fields and shows error messages on submit if empty', async () => {
    render(<PerfilPage />)

    await waitFor(() => {
      expect(screen.queryByText(/Carregando configurações de perfil/i)).not.toBeInTheDocument()
    })

    const nomeInput = screen.getByLabelText(/Nome Completo/i) as HTMLInputElement
    const enderecoInput = screen.getByLabelText(/Endereço de Entrega/i) as HTMLTextAreaElement
    const submitBtn = screen.getByText('Salvar Alterações').closest('button')!

    await act(async () => {
      fireEvent.change(nomeInput, { target: { value: 'Jo' } })
      fireEvent.change(enderecoInput, { target: { value: 'Rua' } })
    })

    expect(nomeInput.value).toBe('Jo')
    expect(enderecoInput.value).toBe('Rua')

    const form = submitBtn.closest('form')!

    await act(async () => {
      fireEvent.submit(form)
    })

    await waitFor(() => {
      expect(screen.getByText('O nome deve ter pelo menos 3 caracteres')).toBeInTheDocument()
      expect(screen.getByText('O endereço deve ser detalhado (mínimo 5 caracteres)')).toBeInTheDocument()
    })
  })

  it('calls update queries and displays success message if inputs are valid and unchanged phone', async () => {
    render(<PerfilPage />)

    await waitFor(() => {
      expect(screen.queryByText(/Carregando configurações de perfil/i)).not.toBeInTheDocument()
    })

    const submitBtn = screen.getByText('Salvar Alterações').closest('button')!
    const form = submitBtn.closest('form')!
    
    await act(async () => {
      fireEvent.submit(form)
    })

    await waitFor(() => {
      expect(screen.getByText('Configurações salvas com sucesso!')).toBeInTheDocument()
    })

    expect(mockFrom).toHaveBeenCalledWith('perfis')
    expect(mockFrom).toHaveBeenCalledWith('clientes')
  })
})
