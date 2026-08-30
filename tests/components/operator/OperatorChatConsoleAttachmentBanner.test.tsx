import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OperatorChatConsole from '@/components/operator/OperatorChatConsole'

vi.mock('@/app/actions/atendimento', () => ({
  alternarIaConversa: vi.fn(),
  enviarMensagemOperador: vi.fn(),
}))
vi.mock('@/components/operator/CreateOrderModal', () => ({ default: () => null }))
vi.mock('@/components/comprovantes/ModalVisualizadorComprovante', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="legacy-pdf-modal" /> : null,
}))

describe('operator receipt banner', () => {
  it('targets the latest attachment card preview instead of the legacy PDF modal', () => {
    Element.prototype.scrollIntoView = vi.fn()
    global.fetch = vi.fn().mockResolvedValue(new Response('not a pdf', {
      headers: { 'Content-Type': 'text/plain' },
    }))
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    render(<OperatorChatConsole conversa={{
      id: 'conversation-1', cliente_id: 'client-1', status: 'aberta', ia_ativa: false,
      data_criacao: '2026-08-25T00:00:00Z', data_atualizacao: '2026-08-25T00:00:00Z',
      clientes: { id: 'client-1', nome: 'Client', telefone: '' },
      mensagens: [
        { id: 'old', conversa_id: 'conversation-1', remetente: 'cliente', conteudo: 'comprovante', url_anexo: 'private/old.pdf', data_criacao: '2026-08-25T01:00:00Z' },
        { id: 'latest', conversa_id: 'conversation-1', remetente: 'cliente', conteudo: 'comprovante pagamento', url_anexo: 'private/latest.pdf', data_criacao: '2026-08-25T02:00:00Z' },
      ],
    }} />)

    fireEvent.click(screen.getByRole('button', { name: /Visualizar Comprovante Anexo/i }))
    expect(screen.queryByTestId('legacy-pdf-modal')).not.toBeInTheDocument()
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'asados:open-attachment-preview',
      detail: { messageId: 'latest' },
    }))
  })
})
