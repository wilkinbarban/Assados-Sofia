import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/components/operator/ProductCRUD', () => ({
  default: vi.fn(() => null),
}))

function makeAuthorizedSupabaseClient() {
  const productQuery: { select: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn> } = {
    select: vi.fn(() => productQuery),
    order: vi.fn(() => productQuery),
  }
  productQuery.order.mockImplementation(() => {
    if (productQuery.order.mock.calls.length >= 2) {
      return Promise.resolve({ data: [], error: null })
    }

    return productQuery
  })

  return {
    productQuery,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'operator-123' } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'perfis') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { funcao: 'admin', ativo: true },
            error: null,
          }),
        }
      }

      if (table === 'produtos') {
        return productQuery
      }

      throw new Error(`unexpected table ${table}`)
    }),
  }
}

describe('ProdutosPage admin ordering query', () => {
  it('selects ordem_exibicao and orders admin products by manual order before name', async () => {
    const client = makeAuthorizedSupabaseClient()
    mocks.createClient.mockResolvedValue(client)
    const { default: ProdutosPage } = await import('@/app/atendimento/produtos/page')

    await ProdutosPage()

    expect(client.productQuery.select).toHaveBeenCalledWith(
      'id, nome, descricao, preco_centavos, ativo, url_imagem, ordem_exibicao, data_criacao, data_atualizacao'
    )
    expect(client.productQuery.order).toHaveBeenNthCalledWith(1, 'ordem_exibicao', {
      ascending: true,
      nullsFirst: false,
    })
    expect(client.productQuery.order).toHaveBeenNthCalledWith(2, 'nome', { ascending: true })
  })
})
