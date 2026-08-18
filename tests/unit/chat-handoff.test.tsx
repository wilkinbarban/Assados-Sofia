import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import ChatContainer from '@/components/chat/ChatContainer'
import { processarIaChat } from '@/app/actions/chat'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Mock Chat Server Action
vi.mock('@/app/actions/chat', () => ({
  processarIaChat: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock Supabase Client
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}

const mockSupabase = {
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'valid_receipt.pdf' }, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'http://mock-signed-url.pdf' }, error: null }),
    }),
  },
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
  from: vi.fn(),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

const baseConversa = {
  id: 'conversa-123',
  cliente_id: 'cliente-123',
  status: 'ia_atendendo' as const,
  ia_ativa: true,
  data_criacao: '2026-07-10T12:00:00Z',
  data_atualizacao: '2026-07-10T12:00:00Z',
}

describe('Chat Handoff & PDF Upload Database Interactions (Tasks 2.5 & 2.6)', () => {
  let mockFileReaderResult: ArrayBuffer | null = null

  class MockFileReader {
    onloadend: (() => void) | null = null
    get result() {
      return mockFileReaderResult
    }
    readAsArrayBuffer() {
      if (this.onloadend) {
        this.onloadend()
      }
    }
  }

  let insertedMessages: any[]
  let insertedComprovantes: any[]
  let updatedConversas: any[]

  beforeAll(() => {
    window.HTMLElement.prototype.scrollTo = vi.fn()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    insertedMessages = []
    insertedComprovantes = []
    updatedConversas = []

    // Mock DB operations
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'mensagens') {
        return {
          insert: vi.fn().mockImplementation((data: any) => {
            insertedMessages.push(data)
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: `msg-${Date.now()}`,
                    conversa_id: 'conversa-123',
                    remetente: data.remetente,
                    conteudo: data.conteudo,
                    url_anexo: data.url_anexo,
                    data_criacao: new Date().toISOString(),
                  },
                  error: null,
                })
              })
            }
          }),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      if (table === 'conversas') {
        return {
          update: vi.fn().mockImplementation((data: any) => {
            updatedConversas.push(data)
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            }
          })
        }
      }
      if (table === 'comprovantes') {
        return {
          insert: vi.fn().mockImplementation((data: any) => {
            insertedComprovantes.push(data)
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'comprovante-id', ...data },
                  error: null,
                })
              })
            }
          })
        }
      }
      return {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    mockFileReaderResult = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer // %PDF magic bytes
    vi.stubGlobal('FileReader', MockFileReader)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('performs DB updates for handoff and skips processarIaChat on valid PDF send', async () => {
    const processarIaChatMock = vi.mocked(processarIaChat)

    const { container } = render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={[]}
        produtos={[]}
      />
    )

    const fileInput = screen.getByTitle('Anexar arquivo').previousElementSibling as HTMLInputElement
    const validPdfFile = new File(['%PDF-1.4...'], 'recibo.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [validPdfFile], configurable: true })
    fireEvent.change(fileInput)

    // Wait for the attachment preview to appear
    await waitFor(() => {
      expect(screen.getByText('recibo.pdf')).toBeInTheDocument()
    })

    // Type a message optionally or just send
    const textInput = screen.getByPlaceholderText('Digite sua mensagem...')
    fireEvent.change(textInput, { target: { value: 'Segue comprovante' } })

    // Click send
    const sendButton = container.querySelector('button[type="submit"]')
    if (sendButton) {
      fireEvent.click(sendButton)
    } else {
      throw new Error('Send button not found')
    }

    await waitFor(() => {
      // Expect client message to be inserted
      expect(insertedMessages.some(m => m.remetente === 'cliente' && m.conteudo === 'Segue comprovante')).toBe(true)
    })

    // 2. Expect comprovantes entry to be inserted
    expect(insertedComprovantes.length).toBe(1)
    expect(insertedComprovantes[0]).toEqual(expect.objectContaining({
      cliente_id: 'cliente-123',
      nome_arquivo: 'recibo.pdf',
      tamanho_bytes: validPdfFile.size,
    }))
    expect(insertedComprovantes[0].url_arquivo).toContain('recibo')

    // 3. Expect conversa status to be set to status = 'aberta' and ia_ativa = false
    expect(updatedConversas.length).toBe(1)
    expect(updatedConversas[0]).toEqual({
      ia_ativa: false,
      status: 'aberta',
    })

    // 4. Expect confirmation message from 'ia' to be inserted
    expect(insertedMessages.some(m => m.remetente === 'ia' && m.conteudo.toLowerCase().includes('recebemos'))).toBe(true)

    // 5. Expect processarIaChat NOT to have been called
    expect(processarIaChatMock).not.toHaveBeenCalled()
  })
})
