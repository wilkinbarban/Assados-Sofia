import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateOrderModal from '@/components/operator/CreateOrderModal'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/app/actions/pedidos', () => ({ criarPedidoOperador: vi.fn() }))

function makeCatalogClient() {
  const order = vi.fn()
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order,
    then: (resolveResult: (value: unknown) => unknown) => resolveResult({
      data: [
        { id: 'product-2', nome: 'Costela', preco_centavos: 9000, ativo: true, ordem_exibicao: 0 },
        { id: 'product-1', nome: 'Picanha', preco_centavos: 12000, ativo: true, ordem_exibicao: 1 },
      ],
      error: null,
    }),
  }
  order.mockReturnValue(query)

  return { client: { from: vi.fn(() => query) }, order }
}

describe('CreateOrderModal catalog selector', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders official ordering and requests deterministic database fallbacks', async () => {
    const { client, order } = makeCatalogClient()
    mocks.createClient.mockReturnValue(client)

    render(
      <CreateOrderModal
        isOpen
        onClose={vi.fn()}
        conversa={{ id: 'conversation-1', clientes: { endereco: null } } as never}
      />,
    )

    await screen.findByRole('option', { name: /costela/i })
    const selector = screen.getAllByRole('combobox')
      .find((element) => (element as HTMLSelectElement).value === 'product-1')
    expect(selector).toBeDefined()
    if (!selector) throw new Error('Product selector was not rendered')
    expect(within(selector).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Picanha - R$ 120,00',
      'Costela - R$ 90,00',
    ])
    expect(selector).toHaveValue('product-1')
    expect(order.mock.calls).toEqual([
      ['ordem_exibicao', { ascending: true, nullsFirst: false }],
      ['nome', { ascending: true }],
      ['id', { ascending: true }],
    ])

    await waitFor(() => expect(screen.queryByText('Carregando catálogo...')).not.toBeInTheDocument())
  })
})
