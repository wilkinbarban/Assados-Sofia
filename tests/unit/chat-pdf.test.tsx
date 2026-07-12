import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import ChatContainer from '@/components/chat/ChatContainer'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Mock Supabase Client
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}

const mockSupabase = {
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'http://mock-signed-url.jpg' }, error: null }),
    }),
  },
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
  from: vi.fn().mockReturnValue({
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

// Mock Chat Server Action
vi.mock('@/app/actions/chat', () => ({
  processarIaChat: vi.fn().mockResolvedValue({ success: true }),
}))

const baseConversa = {
  id: 'conversa-123',
  cliente_id: 'cliente-123',
  status: 'ia_atendendo' as const,
  ia_ativa: true,
  data_criacao: '2026-07-10T12:00:00Z',
  data_atualizacao: '2026-07-10T12:00:00Z',
}

describe('Chat PDF Validation Tests (Tasks 2.3 & 2.4)', () => {
  let mockFileReaderResult: ArrayBuffer | null = null

  class MockFileReader {
    onloadend: (() => void) | null = null
    get result() {
      return mockFileReaderResult
    }
    readAsArrayBuffer(blob: Blob) {
      if (this.onloadend) {
        this.onloadend()
      }
    }
  }

  beforeAll(() => {
    window.HTMLElement.prototype.scrollTo = vi.fn()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockFileReaderResult = null
    vi.stubGlobal('FileReader', MockFileReader)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('rejects files that are not PDF', async () => {
    render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={[]}
        produtos={[]}
      />
    )

    // The file input is before the button with title "Anexar arquivo"
    const fileInput = screen.getByTitle('Anexar arquivo').previousElementSibling as HTMLInputElement
    expect(fileInput).toBeInTheDocument()

    const invalidFile = new File(['hello'], 'test.txt', { type: 'text/plain' })
    Object.defineProperty(fileInput, 'files', { value: [invalidFile], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('Apenas arquivos PDF são permitidos.')).toBeInTheDocument()
    })
    expect(mockSupabase.storage.from).not.toHaveBeenCalled()
  })

  it('rejects PDF files larger than 5MB', async () => {
    render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={[]}
        produtos={[]}
      />
    )

    const fileInput = screen.getByTitle('Anexar arquivo').previousElementSibling as HTMLInputElement

    const largeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'test.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [largeFile], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('O arquivo deve ter no máximo 5MB.')).toBeInTheDocument()
    })
    expect(mockSupabase.storage.from).not.toHaveBeenCalled()
  })

  it('rejects PDF files without %PDF magic bytes', async () => {
    // Setup fileReader to return non-matching bytes (e.g. "HELL")
    const encoder = new TextEncoder()
    const invalidBytes = encoder.encode('HELL').buffer
    mockFileReaderResult = invalidBytes

    render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={[]}
        produtos={[]}
      />
    )

    const fileInput = screen.getByTitle('Anexar arquivo').previousElementSibling as HTMLInputElement

    const fakePdfFile = new File(['HELLopdf'], 'fake.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [fakePdfFile], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('O arquivo não é um PDF válido.')).toBeInTheDocument()
    })
    expect(mockSupabase.storage.from).not.toHaveBeenCalled()
  })

  it('accepts valid PDF files with %PDF magic bytes and <= 5MB', async () => {
    // Setup fileReader to return valid %PDF bytes: [0x25, 0x50, 0x44, 0x46]
    const validBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer
    mockFileReaderResult = validBytes

    render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={[]}
        produtos={[]}
      />
    )

    const fileInput = screen.getByTitle('Anexar arquivo').previousElementSibling as HTMLInputElement

    const validPdfFile = new File(['%PDF-1.4...'], 'valid.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [validPdfFile], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      // It should display the file attachment state card with the file name
      expect(screen.getByText('valid.pdf')).toBeInTheDocument()
    })
    
    // It should have uploaded the file to storage
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('chat-midias')
  })
})
