import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import ChatContainer from '@/components/chat/ChatContainer'
import ClienteChatPage from '@/app/cliente/chat/page'
import { processarIaChat } from '@/app/actions/chat'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Mock Supabase Server Client
const mockServerSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockServerSupabase,
}))

beforeAll(() => {
  window.HTMLElement.prototype.scrollTo = vi.fn()
})

afterEach(() => {
  cleanup()
})

// Mock Supabase Client
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}

const mockSupabase = {
  storage: {
    from: vi.fn().mockReturnValue({
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
  processarIaChat: vi.fn(),
}))

const baseConversa = {
  id: 'conversa-123',
  cliente_id: 'cliente-123',
  status: 'ia_atendendo' as const,
  ia_ativa: true,
  data_criacao: '2026-07-10T12:00:00Z',
  data_atualizacao: '2026-07-10T12:00:00Z',
}

const mockProdutos = [
  {
    id: 'prod-1',
    nome: 'Costela Premium',
    descricao: 'Deliciosa costela assada na brasa',
    preco_centavos: 8990, // R$ 89,90
    url_imagem: '/images/costela.jpg',
    url_imagem_thumb: '/images/costela_thumb.jpg',
  },
  {
    id: 'prod-2',
    nome: 'Pão de Alho',
    descricao: 'Pão recheado com creme de alho especial',
    preco_centavos: 1500, // R$ 15,00
    url_imagem: null,
    url_imagem_thumb: null,
  }
]

describe('ChatContainer Core UI Tests (Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Task 2.1: Aligns client messages to the right and IA/Operator messages to the left', () => {
    const mensagens = [
      {
        id: 'msg-1',
        conversa_id: 'conversa-123',
        remetente: 'cliente' as const,
        conteudo: 'Quero fazer um pedido',
        url_anexo: null,
        data_criacao: '2026-07-10T12:01:00Z',
      },
      {
        id: 'msg-2',
        conversa_id: 'conversa-123',
        remetente: 'ia' as const,
        conteudo: 'Olá! Sou a Sofia.',
        url_anexo: null,
        data_criacao: '2026-07-10T12:01:30Z',
      },
      {
        id: 'msg-3',
        conversa_id: 'conversa-123',
        remetente: 'operador' as const,
        conteudo: 'Posso te ajudar?',
        url_anexo: null,
        data_criacao: '2026-07-10T12:02:00Z',
      },
    ]

    render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={mensagens}
        produtos={[]}
      />
    )

    // Find the message wrappers
    const clientMsgElement = screen.getByText('Quero fazer um pedido').closest('.flex.w-full')
    const iaMsgElement = screen.getByText('Olá! Sou a Sofia.').closest('.flex.w-full')
    const operatorMsgElement = screen.getByText('Posso te ajudar?').closest('.flex.w-full')

    expect(clientMsgElement).toHaveClass('justify-end')
    expect(iaMsgElement).toHaveClass('justify-start')
    expect(operatorMsgElement).toHaveClass('justify-start')
  })

  it('Task 2.2: Renders correct channel source badges based on message database indicators', () => {
    const mensagens = [
      {
        id: 'msg-wa',
        conversa_id: 'conversa-123',
        remetente: 'cliente' as const,
        conteudo: 'Mensagem via WhatsApp',
        url_anexo: null,
        data_criacao: '2026-07-10T12:01:00Z',
        whatsapp_mensagem_id: 'wa-id-123',
      },
      {
        id: 'msg-tg',
        conversa_id: 'conversa-123',
        remetente: 'cliente' as const,
        conteudo: 'Mensagem via Telegram',
        url_anexo: null,
        data_criacao: '2026-07-10T12:01:30Z',
        telegram_mensagem_id: 'tg-id-123',
      },
      {
        id: 'msg-web',
        conversa_id: 'conversa-123',
        remetente: 'cliente' as const,
        conteudo: 'Mensagem via Web',
        url_anexo: null,
        data_criacao: '2026-07-10T12:02:00Z',
      },
    ]

    render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={mensagens}
        produtos={[]}
      />
    )

    // Check for WhatsApp indicator/badge
    const waBadge = screen.getAllByText('WhatsApp')[0]
    expect(waBadge).toBeInTheDocument()
    // It should have classes representing a green style
    expect(waBadge.className).toContain('emerald') // or similar green-based style

    // Check for Telegram indicator/badge
    const tgBadge = screen.getAllByText('Telegram')[0]
    expect(tgBadge).toBeInTheDocument()
    // It should have classes representing a blue style
    expect(tgBadge.className).toContain('blue')

    // Check for Web indicator/badge
    const webBadge = screen.getAllByText('Web')[0]
    expect(webBadge).toBeInTheDocument()
  })

  it('Task 2.3: Displays correct sender labels for IA, Operator, and Client', () => {
    const mensagens = [
      {
        id: 'msg-ia',
        conversa_id: 'conversa-123',
        remetente: 'ia' as const,
        conteudo: 'Resposta IA',
        url_anexo: null,
        data_criacao: '2026-07-10T12:01:00Z',
      },
      {
        id: 'msg-op',
        conversa_id: 'conversa-123',
        remetente: 'operador' as const,
        conteudo: 'Resposta Operador',
        url_anexo: null,
        data_criacao: '2026-07-10T12:02:00Z',
      },
      {
        id: 'msg-cli',
        conversa_id: 'conversa-123',
        remetente: 'cliente' as const,
        conteudo: 'Mensagem Cliente',
        url_anexo: null,
        data_criacao: '2026-07-10T12:03:00Z',
      },
    ]

    render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={mensagens}
        produtos={[]}
      />
    )

    // Expecting sender names to identify the sender
    expect(screen.getAllByText('Sofia (IA)')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Atendente')[0]).toBeInTheDocument()
    
    // Client message should show customer's name ("Ana Silva") or "Você"
    expect(screen.getAllByText('Ana Silva')[0]).toBeInTheDocument()
  })

  it('Task 2.4: Renders the product catalog sidebar in the chat layout', () => {
    render(
      <ChatContainer
        clienteNome="Ana Silva"
        conversaInicial={baseConversa}
        mensagensIniciais={[]}
        produtos={mockProdutos}
      />
    )

    // Check if sidebar header exists
    expect(screen.getAllByText(/Catálogo de Produtos/i)[0]).toBeInTheDocument()

    // Check if products exist in the document
    expect(screen.getByText('Costela Premium')).toBeInTheDocument()
    expect(screen.getByText('Pão de Alho')).toBeInTheDocument()

    // Prices must be formatted: preco_centavos / 100
    expect(screen.getByText(/R\$\s*89,90/)).toBeInTheDocument()
    expect(screen.getByText(/R\$\s*15,00/)).toBeInTheDocument()

    // Check descriptions
    expect(screen.getByText('Deliciosa costela assada na brasa')).toBeInTheDocument()

    // Cards should be draggable
    const costelaCard = screen.getByText('Costela Premium').closest('[draggable="true"]')
    expect(costelaCard).toBeInTheDocument()
  })

  describe('ClienteChatPage Server Component (Task 3.1)', () => {
    it('queries available products in stock and passes them to ChatContainer', async () => {
      // Mock getUser to return authenticated user
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      })

      // Mock clientes query
      const mockSingleCliente = vi.fn().mockResolvedValue({
        data: { id: 'cliente-123', nome: 'Cliente Teste', telefone: '5541999999999' },
        error: null,
      })
      const mockEqCliente = vi.fn().mockReturnValue({ single: mockSingleCliente })
      const mockSelectCliente = vi.fn().mockReturnValue({ eq: mockEqCliente })

      // Mock conversas query
      const mockMaybeSingleConversa = vi.fn().mockResolvedValue({
        data: { id: 'conversa-123', cliente_id: 'cliente-123', status: 'ia_atendendo', ia_ativa: true },
        error: null,
      })
      const mockLimitConversa = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingleConversa })
      const mockOrderConversa = vi.fn().mockReturnValue({ limit: mockLimitConversa })
      const mockNeqConversa = vi.fn().mockReturnValue({ order: mockOrderConversa })
      const mockEqConversa = vi.fn().mockReturnValue({ neq: mockNeqConversa })
      const mockSelectConversa = vi.fn().mockReturnValue({ eq: mockEqConversa })

      // Mock mensagens query
      const mockMessagesLimit = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      })
      const mockMessagesOrder = vi.fn().mockReturnValue({ limit: mockMessagesLimit })
      const mockMessagesEq = vi.fn().mockReturnValue({ order: mockMessagesOrder })
      const mockMessagesSelect = vi.fn().mockReturnValue({ eq: mockMessagesEq })

      mockServerSupabase.from.mockImplementation((table: string) => {
        if (table === 'clientes') {
          return { select: mockSelectCliente }
        }
        if (table === 'conversas') {
          return { select: mockSelectConversa }
        }
        if (table === 'mensagens') {
          return { select: mockMessagesSelect }
        }
        return {}
      })

      // Mock buscar_produtos_disponiveis RPC
      mockServerSupabase.rpc.mockResolvedValue({
        data: [
          {
            id: 'prod-server-1',
            nome: 'Picanha na Grelha',
            descricao: 'Picanha macia e suculenta',
            preco_centavos: 12000,
            url_imagem: null,
            url_imagem_thumb: null,
          }
        ],
        error: null,
      })

      const PageComponent = await ClienteChatPage()
      render(PageComponent)

      // Verify that the product from the RPC is rendered in the page/container
      expect(screen.getByText('Picanha na Grelha')).toBeInTheDocument()
      expect(screen.getByText(/R\$\s*120,00/)).toBeInTheDocument()
      expect(mockServerSupabase.rpc).toHaveBeenCalledWith('buscar_produtos_disponiveis')
    })
  })

  describe('ChatContainer Drag & Drop / Click Interactions (Tasks 3.2 - 3.4)', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('Task 3.2 & 3.4: onDragStart sets product JSON and dropping sends message and calls processarIaChat', async () => {
      // Mock insert message to resolve with the new message data
      const mockInsertResult = {
        id: 'msg-inserted-123',
        conversa_id: 'conversa-123',
        remetente: 'cliente' as const,
        conteudo: 'Quero adicionar Costela Premium ao meu pedido',
        url_anexo: null,
        data_criacao: new Date().toISOString(),
      }

      const mockSingleInsert = vi.fn().mockResolvedValue({ data: mockInsertResult, error: null })
      const mockSelectInsert = vi.fn().mockReturnValue({ single: mockSingleInsert })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelectInsert })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'mensagens') {
          return { insert: mockInsert }
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      })

      // Mock processarIaChat to return success
      const processarIaChatMock = vi.mocked(processarIaChat)
      processarIaChatMock.mockResolvedValue({ success: true })

      render(
        <ChatContainer
          clienteNome="Ana Silva"
          conversaInicial={baseConversa}
          mensagensIniciais={[]}
          produtos={mockProdutos}
        />
      )

      // Find draggable product card
      const costelaCard = screen.getAllByText('Costela Premium')[0].closest('[draggable="true"]')
      expect(costelaCard).toBeInTheDocument()

      // Drag start event
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue(JSON.stringify(mockProdutos[0])),
      }
      fireEvent.dragStart(costelaCard!, { dataTransfer })
      expect(dataTransfer.setData).toHaveBeenCalledWith('application/json', JSON.stringify(mockProdutos[0]))

      // Find drop zone (e.g., the messages container or input form)
      const chatArea = screen.getByTestId('chat-dropzone')
      fireEvent.dragOver(chatArea)
      fireEvent.drop(chatArea, { dataTransfer })

      // Verify message was sent/inserted via database
      expect(mockInsert).toHaveBeenCalledWith({
        conversa_id: 'conversa-123',
        remetente: 'cliente',
        conteudo: 'Quero adicionar Costela Premium ao meu pedido',
        url_anexo: null,
      })

      // Verify processarIaChat was called
      await waitFor(() => {
        expect(processarIaChatMock).toHaveBeenCalledWith('conversa-123', 'Quero adicionar Costela Premium ao meu pedido')
      })
    })

    it('Task 3.3 & 3.4: clicking on product card (mobile fallback) sends message and calls processarIaChat', async () => {
      // Mock insert message
      const mockInsertResult = {
        id: 'msg-inserted-456',
        conversa_id: 'conversa-123',
        remetente: 'cliente' as const,
        conteudo: 'Quero adicionar Pão de Alho ao meu pedido',
        url_anexo: null,
        data_criacao: new Date().toISOString(),
      }

      const mockSingleInsert = vi.fn().mockResolvedValue({ data: mockInsertResult, error: null })
      const mockSelectInsert = vi.fn().mockReturnValue({ single: mockSingleInsert })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelectInsert })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'mensagens') {
          return { insert: mockInsert }
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      })

      const processarIaChatMock = vi.mocked(processarIaChat)
      processarIaChatMock.mockResolvedValue({ success: true })

      render(
        <ChatContainer
          clienteNome="Ana Silva"
          conversaInicial={baseConversa}
          mensagensIniciais={[]}
          produtos={mockProdutos}
        />
      )

      // Find product card for clicking
      const paodeAlhoCard = screen.getAllByText('Pão de Alho')[0].closest('li, div')
      expect(paodeAlhoCard).toBeInTheDocument()

      fireEvent.click(paodeAlhoCard!)

      // Verify message was inserted
      expect(mockInsert).toHaveBeenCalledWith({
        conversa_id: 'conversa-123',
        remetente: 'cliente',
        conteudo: 'Quero adicionar Pão de Alho ao meu pedido',
        url_anexo: null,
      })

      // Verify processarIaChat was called
      await waitFor(() => {
        expect(processarIaChatMock).toHaveBeenCalledWith('conversa-123', 'Quero adicionar Pão de Alho ao meu pedido')
      })
    })
  })
})
