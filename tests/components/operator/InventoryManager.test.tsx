import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InventoryManager from '@/components/operator/InventoryManager'
import { ajustarEstoque, atualizarProduto, criarProduto, listarProdutos } from '@/app/actions/estoque'
import { reordenarProdutosVisiveis } from '@/app/actions/produtos'
vi.mock('@/app/actions/estoque', () => ({
  listarProdutos: vi.fn(), criarProduto: vi.fn(), atualizarProduto: vi.fn(), excluirProduto: vi.fn(),
  alternarStatusProduto: vi.fn(), ajustarEstoque: vi.fn(), listarMovimentacoes: vi.fn(),
  uploadImagemProduto: vi.fn(), removerImagemProduto: vi.fn(),
}))
vi.mock('@/app/actions/produtos', () => ({ reordenarProdutosVisiveis: vi.fn() }))
const products = Array.from({ length: 6 }, (_, index) => ({
  id: `product-${index + 1}`, nome: `Produto ${index + 1}`, descricao: null,
  preco_centavos: 1000 + index, quantidade_estoque: 10, estoque_minimo: 2,
  controlar_estoque: true, ativo: index !== 5, url_imagem: null,
  url_imagem_thumb: null, url_imagem_2: null, url_imagem_2_thumb: null,
  ordem_exibicao: index + 1,
}))
const renderedNames = () => screen.getAllByRole('listitem').map((card) => within(card).getByRole('heading').textContent)
describe('InventoryManager official product surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listarProdutos).mockResolvedValue({ success: true, data: products })
    vi.mocked(reordenarProdutosVisiveis).mockResolvedValue({ success: true })
  })
  afterEach(cleanup)
  it.each(['admin', 'supervisor'])('renders all responsive product cards for an active %s', async (role) => {
    render(<InventoryManager perfilFuncao={role} perfilAtivo />)
    expect(await screen.findByRole('list', { name: /grade responsiva.*seis colunas/i })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
  })
  it('keeps every inventory action accessible after a small-viewport reflow', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    window.dispatchEvent(new Event('resize'))

    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)

    const firstCard = within((await screen.findAllByRole('listitem'))[0])
    expect(firstCard.getByRole('button', { name: 'Reordenar Produto 1' })).toBeEnabled()
    expect(firstCard.getByRole('button', { name: 'Desativar Produto 1' })).toBeEnabled()
    expect(firstCard.getByRole('button', { name: 'Diminuir estoque de Produto 1' })).toBeEnabled()
    expect(firstCard.getByRole('button', { name: 'Aumentar estoque de Produto 1' })).toBeEnabled()
    expect(firstCard.getByRole('button', { name: 'Editar Produto 1' })).toBeEnabled()
    expect(firstCard.getByRole('button', { name: 'Excluir Produto 1' })).toBeEnabled()
  })
  it('keeps the latest filter results when an older request resolves afterward', async () => {
    let resolveActiveProducts!: (result: { success: true; data: typeof products }) => void
    const activeProducts = products.filter((product) => product.ativo)
    vi.mocked(listarProdutos)
      .mockResolvedValueOnce({ success: true, data: products })
      .mockReturnValueOnce(new Promise((resolve) => { resolveActiveProducts = resolve }))
      .mockResolvedValueOnce({ success: true, data: products })

    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    await screen.findByText('Produto 6')

    fireEvent.click(screen.getByRole('button', { name: 'Ativos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await screen.findByText('Produto 6')

    await act(async () => resolveActiveProducts({ success: true, data: activeProducts }))

    expect(screen.getByText('Produto 6')).toBeVisible()
  })
  it('submits product edits without exposing or sending the stock quantity', async () => {
    vi.mocked(atualizarProduto).mockResolvedValueOnce({ success: true, data: products[0] })
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    fireEvent.click(within((await screen.findAllByRole('listitem'))[0]).getByRole('button', { name: 'Editar Produto 1' }))

    expect(screen.queryByLabelText(/quantidade em estoque/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(atualizarProduto).toHaveBeenCalled())
    expect(vi.mocked(atualizarProduto).mock.calls[0][1]).not.toHaveProperty('quantidade_estoque')
    expect(await screen.findByText('Produto atualizado com sucesso!')).toBeVisible()
  })
  it('reuses one creation correlation after an error and sends controlled initial stock', async () => {
    vi.mocked(criarProduto)
      .mockResolvedValueOnce({ success: false, error: 'ERRO_TRANSITORIO' })
      .mockResolvedValueOnce({ success: true, data: { ...products[0], produto_id: products[0].id } })
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    fireEvent.click(await screen.findByRole('button', { name: /novo produto/i }))
    fireEvent.change(screen.getByPlaceholderText('Ex: Picanha Premium'), { target: { value: 'Picanha' } })
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '10,00' } })
    fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /cadastrar/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERRO_TRANSITORIO')
    fireEvent.click(screen.getByRole('button', { name: /cadastrar/i }))

    await waitFor(() => expect(criarProduto).toHaveBeenCalledTimes(2))
    const [first, retry] = vi.mocked(criarProduto).mock.calls.map(([payload]) => payload)
    expect(first).toEqual(expect.objectContaining({ quantidade_estoque: 4, controlar_estoque: true }))
    expect(first.correlation_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(retry.correlation_id).toBe(first.correlation_id)
  })
  it('reuses the adjustment correlation after rejection, then clears it after success', async () => {
    let rejectFirst!: (result: { success: false; error: string }) => void
    vi.mocked(ajustarEstoque)
      .mockReturnValueOnce(new Promise((resolve) => { rejectFirst = resolve }))
      .mockResolvedValueOnce({ success: true, data: { qtd_anterior: 10, qtd_nova: 11, movimentacao_id: 'move', produto_ativo: true } })
      .mockResolvedValueOnce({ success: true, data: { qtd_anterior: 11, qtd_nova: 12, movimentacao_id: 'move-2', produto_ativo: true } })
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    const increase = within((await screen.findAllByRole('listitem'))[0]).getByRole('button', { name: 'Aumentar estoque de Produto 1' })

    fireEvent.click(increase)
    fireEvent.click(increase)
    expect(ajustarEstoque).toHaveBeenCalledTimes(1)
    rejectFirst({ success: false, error: 'ERRO_TRANSITORIO' })
    await waitFor(() => expect(increase).toBeEnabled())
    fireEvent.click(increase)
    await waitFor(() => expect(ajustarEstoque).toHaveBeenCalledTimes(2))
    expect(vi.mocked(ajustarEstoque).mock.calls[1][4]).toBe(vi.mocked(ajustarEstoque).mock.calls[0][4])

    fireEvent.click(increase)
    await waitFor(() => expect(ajustarEstoque).toHaveBeenCalledTimes(3))
    expect(vi.mocked(ajustarEstoque).mock.calls[2][4]).not.toBe(vi.mocked(ajustarEstoque).mock.calls[1][4])
  })
  it('uses a different correlation when the adjustment intent changes', async () => {
    vi.mocked(ajustarEstoque).mockResolvedValue({ success: false, error: 'ERRO_TRANSITORIO' })
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    const card = within((await screen.findAllByRole('listitem'))[0])

    fireEvent.click(card.getByRole('button', { name: 'Aumentar estoque de Produto 1' }))
    await waitFor(() => expect(ajustarEstoque).toHaveBeenCalledTimes(1))
    fireEvent.click(card.getByRole('button', { name: 'Diminuir estoque de Produto 1' }))
    await waitFor(() => expect(ajustarEstoque).toHaveBeenCalledTimes(2))

    const [first, changed] = vi.mocked(ajustarEstoque).mock.calls
    expect(changed[4]).not.toBe(first[4]); expect(first[5]).toBe(true); expect(changed[5]).toBe(true)
  })
  it('invalidates only the successful product correlations before revisiting an ambiguous intent', async () => {
    vi.mocked(ajustarEstoque)
      .mockResolvedValueOnce({ success: false, error: 'RESPOSTA_AMBIGUA_COMMITADA' })
      .mockResolvedValueOnce({ success: false, error: 'RESPOSTA_AMBIGUA' })
      .mockResolvedValueOnce({ success: true, data: { qtd_anterior: 11, qtd_nova: 10, movimentacao_id: 'move-b', produto_ativo: true } })
      .mockResolvedValueOnce({ success: true, data: { qtd_anterior: 10, qtd_nova: 11, movimentacao_id: 'move-a-fresh', produto_ativo: true } })
      .mockResolvedValueOnce({ success: true, data: { qtd_anterior: 10, qtd_nova: 11, movimentacao_id: 'move-other', produto_ativo: true } })
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    const [firstCard, otherCard] = await screen.findAllByRole('listitem')
    const increaseFirst = within(firstCard).getByRole('button', { name: 'Aumentar estoque de Produto 1' })
    const decreaseFirst = within(firstCard).getByRole('button', { name: 'Diminuir estoque de Produto 1' })
    const increaseOther = within(otherCard).getByRole('button', { name: 'Aumentar estoque de Produto 2' })

    fireEvent.click(increaseFirst)
    await waitFor(() => expect(increaseFirst).toBeEnabled())
    fireEvent.click(increaseOther)
    await waitFor(() => expect(increaseOther).toBeEnabled())
    fireEvent.click(decreaseFirst)
    await waitFor(() => expect(decreaseFirst).toBeEnabled())
    fireEvent.click(increaseFirst)
    await waitFor(() => expect(increaseFirst).toBeEnabled())
    fireEvent.click(increaseOther)
    await waitFor(() => expect(ajustarEstoque).toHaveBeenCalledTimes(5))

    const calls = vi.mocked(ajustarEstoque).mock.calls
    expect(calls[3][4]).not.toBe(calls[0][4])
    expect(calls[4][4]).toBe(calls[1][4])
    expect(within(firstCard).getByText('11')).toBeInTheDocument()
    expect(within(otherCard).getByText('11')).toBeInTheDocument()
  })
  it('blocks inactive or unauthorized profiles without loading inventory', () => {
    const { rerender } = render(<InventoryManager perfilFuncao="cliente" perfilAtivo />)
    expect(screen.getByRole('alert')).toHaveTextContent('Acesso não autorizado')
    rerender(<InventoryManager perfilFuncao="admin" perfilAtivo={false} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Acesso não autorizado')
    expect(listarProdutos).not.toHaveBeenCalled()
  })
  it('disables every ordering handle while search or status filtering is active', async () => {
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    await screen.findByText('Produto 1')
    fireEvent.change(screen.getByPlaceholderText(/buscar por nome/i), { target: { value: 'Produto 1' } })
    expect(screen.getByRole('button', { name: /reordenar produto 1/i })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/buscar por nome/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ativos' }))
    expect(screen.getAllByRole('button', { name: /reordenar produto/i }).every((button) => button.hasAttribute('disabled'))).toBe(true)
  })
  it('reorders the global collection by keyboard and announces the saved position', async () => {
    render(<InventoryManager perfilFuncao="supervisor" perfilAtivo />)
    const handle = await screen.findByRole('button', { name: /reordenar produto 2/i })
    fireEvent.keyDown(handle, { key: 'Enter' })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'Enter' })
    await waitFor(() => expect(reordenarProdutosVisiveis).toHaveBeenCalledWith([
      { id: 'product-2', ordem_exibicao: 1 }, { id: 'product-1', ordem_exibicao: 2 },
      ...products.slice(2).map(({ id }, index) => ({ id, ordem_exibicao: index + 3 })),
    ]))
    expect(screen.getByRole('status')).toHaveTextContent('Produto 2 movido para a posição 1')
    expect(renderedNames()).toEqual(['Produto 2', 'Produto 1', 'Produto 3', 'Produto 4', 'Produto 5', 'Produto 6'])
  })
  it('persists a keyboard reorder when activation, movement, and confirmation share one React update', async () => {
    render(<InventoryManager perfilFuncao="supervisor" perfilAtivo />)
    const handle = await screen.findByRole('button', { name: /reordenar produto 2/i })

    act(() => {
      fireEvent.keyDown(handle, { key: 'Enter' })
      fireEvent.keyDown(handle, { key: 'ArrowUp' })
      fireEvent.keyDown(handle, { key: 'Enter' })
    })

    await waitFor(() => expect(reordenarProdutosVisiveis).toHaveBeenCalledWith([
      { id: 'product-2', ordem_exibicao: 1 }, { id: 'product-1', ordem_exibicao: 2 },
      ...products.slice(2).map(({ id }, index) => ({ id, ordem_exibicao: index + 3 })),
    ]))
    expect(screen.getByRole('status')).toHaveTextContent('Produto 2 movido para a posição 1')
  })
  it('announces the moved product position when product names are duplicated', async () => {
    const duplicateNames = products.map((product, index) => index < 2 ? { ...product, nome: 'Produto duplicado' } : product)
    vi.mocked(listarProdutos).mockResolvedValueOnce({ success: true, data: duplicateNames })
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    const handles = await screen.findAllByRole('button', { name: /reordenar produto duplicado/i })

    fireEvent.dragStart(handles[1])
    fireEvent.dragOver(screen.getAllByRole('listitem')[2])
    fireEvent.drop(screen.getAllByRole('listitem')[2])

    expect(await screen.findByRole('status')).toHaveTextContent('Produto duplicado movido para a posição 3')
  })
  it('uses Space to start and confirm keyboard ordering', async () => {
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    const handle = await screen.findByRole('button', { name: /reordenar produto 2/i })

    fireEvent.keyDown(handle, { key: ' ' })
    expect(handle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: ' ' })

    await waitFor(() => expect(reordenarProdutosVisiveis).toHaveBeenCalledWith([
      { id: 'product-2', ordem_exibicao: 1 }, { id: 'product-1', ordem_exibicao: 2 },
      ...products.slice(2).map(({ id }, index) => ({ id, ordem_exibicao: index + 3 })),
    ]))
    expect(handle).toHaveAttribute('aria-pressed', 'false')
  })
  it('uses Escape to cancel keyboard ordering without persisting the tentative move', async () => {
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    const handle = await screen.findByRole('button', { name: /reordenar produto 2/i })

    fireEvent.keyDown(handle, { key: ' ' })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(renderedNames()).toEqual(['Produto 1', 'Produto 3', 'Produto 2', 'Produto 4', 'Produto 5', 'Produto 6'])
    fireEvent.keyDown(handle, { key: 'Escape' })

    expect(reordenarProdutosVisiveis).not.toHaveBeenCalled()
    expect(renderedNames()).toEqual(['Produto 1', 'Produto 2', 'Produto 3', 'Produto 4', 'Produto 5', 'Produto 6'])
    expect(screen.getByRole('status')).toHaveTextContent('Movimento de Produto 2 cancelado')
  })
  it('restores the persisted global order after a reload refetch', async () => {
    const persistedProducts = [products[2], products[0], products[1], ...products.slice(3)]
      .map((product, index) => ({ ...product, ordem_exibicao: index + 1 }))
    vi.mocked(listarProdutos)
      .mockReset()
      .mockResolvedValueOnce({ success: true, data: products })
      .mockResolvedValueOnce({ success: true, data: persistedProducts })

    const firstLoad = render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    await screen.findByText('Produto 1')
    expect(renderedNames()).toEqual(['Produto 1', 'Produto 2', 'Produto 3', 'Produto 4', 'Produto 5', 'Produto 6'])
    firstLoad.unmount()

    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    await waitFor(() => expect(renderedNames()).toEqual([
      'Produto 3', 'Produto 1', 'Produto 2', 'Produto 4', 'Produto 5', 'Produto 6',
    ]))
    expect(listarProdutos).toHaveBeenCalledTimes(2)
  })
  it('rolls back optimistic ordering and exposes the persistence error', async () => {
    vi.mocked(reordenarProdutosVisiveis).mockResolvedValueOnce({ success: false, error: 'Falha ao salvar ordem' })
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    const handles = await screen.findAllByRole('button', { name: /reordenar produto/i })
    fireEvent.dragStart(handles[1])
    fireEvent.dragOver(screen.getAllByRole('listitem')[0])
    fireEvent.drop(screen.getAllByRole('listitem')[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar ordem')
    expect(renderedNames()).toEqual(['Produto 1', 'Produto 2', 'Produto 3', 'Produto 4', 'Produto 5', 'Produto 6'])
  })
  it('restores ordering and controls when persistence rejects', async () => {
    vi.mocked(reordenarProdutosVisiveis).mockRejectedValueOnce(new Error('Conexão interrompida'))
    render(<InventoryManager perfilFuncao="admin" perfilAtivo />)
    const handles = await screen.findAllByRole('button', { name: /reordenar produto/i })
    fireEvent.dragStart(handles[1])
    fireEvent.drop(screen.getAllByRole('listitem')[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('Conexão interrompida')
    expect(renderedNames()).toEqual(['Produto 1', 'Produto 2', 'Produto 3', 'Produto 4', 'Produto 5', 'Produto 6'])
    expect(screen.getAllByRole('button', { name: /reordenar produto/i }).every((button) => !button.hasAttribute('disabled'))).toBe(true)
  })
})
