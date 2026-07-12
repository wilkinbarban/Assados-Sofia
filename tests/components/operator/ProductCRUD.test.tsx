import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProductCRUD, { type Produto } from '@/components/operator/ProductCRUD'
import { reordenarProdutosVisiveis } from '@/app/actions/produtos'

vi.mock('@/app/actions/produtos', () => ({
  criarProduto: vi.fn(),
  atualizarProduto: vi.fn(),
  alternarStatusProduto: vi.fn(),
  reordenarProdutosVisiveis: vi.fn(),
}))

const produtos: Produto[] = [
  { id: 'product-a', nome: 'Picanha', descricao: 'Corte premium', preco_centavos: 1000, ativo: true, url_imagem: null, ordem_exibicao: 1 },
  { id: 'product-b', nome: 'Costela', descricao: 'Assada lentamente', preco_centavos: 2000, ativo: true, url_imagem: null, ordem_exibicao: 2 },
  { id: 'product-c', nome: 'Linguiça', descricao: 'Artesanal', preco_centavos: 3000, ativo: false, url_imagem: null, ordem_exibicao: 3 },
]

function productNamesInRenderedOrder() {
  return screen.getAllByTestId('product-row').map((row) => within(row).getByTestId('product-name').textContent)
}

describe('ProductCRUD drag-and-drop ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(reordenarProdutosVisiveis).mockResolvedValue({ success: true })
  })

  afterEach(() => {
    cleanup()
  })

  it('sends only post-drag visible IDs when a visible row is reordered', async () => {
    render(<ProductCRUD produtosIniciais={produtos} perfilFuncao="admin" />)

    const handles = screen.getAllByRole('button', { name: /reordenar produto/i })
    fireEvent.dragStart(handles[1])
    fireEvent.dragOver(screen.getAllByTestId('product-row')[0])
    fireEvent.drop(screen.getAllByTestId('product-row')[0])

    await waitFor(() => {
      expect(reordenarProdutosVisiveis).toHaveBeenCalledWith([
        { id: 'product-b', ordem_exibicao: 1 },
        { id: 'product-a', ordem_exibicao: 2 },
        { id: 'product-c', ordem_exibicao: 3 },
      ])
    })
    expect(productNamesInRenderedOrder()).toEqual(['Costela', 'Picanha', 'Linguiça'])
  })

  it('disables drag-and-drop while search text is active', () => {
    render(<ProductCRUD produtosIniciais={produtos} perfilFuncao="admin" />)

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou descrição...'), {
      target: { value: 'Picanha' },
    })

    expect(screen.getByText(/Ordenação manual pausada/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reordenar produto Picanha/i })).toBeDisabled()
  })

  it('rolls back the optimistic order when the save fails', async () => {
    vi.mocked(reordenarProdutosVisiveis).mockResolvedValueOnce({ success: false, error: 'ERRO_BANCO: update failed' })
    render(<ProductCRUD produtosIniciais={produtos} perfilFuncao="admin" />)

    const handles = screen.getAllByRole('button', { name: /reordenar produto/i })
    fireEvent.dragStart(handles[1])
    fireEvent.dragOver(screen.getAllByTestId('product-row')[0])
    fireEvent.drop(screen.getAllByTestId('product-row')[0])

    await waitFor(() => {
      expect(screen.getByText('ERRO_BANCO: update failed')).toBeInTheDocument()
    })
    expect(productNamesInRenderedOrder()).toEqual(['Picanha', 'Costela', 'Linguiça'])
  })
})
