import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

type ProdutoTableOptions = {
  existingIds?: string[]
  updateErrorAtId?: string
}

function makeOperatorClient(role = 'admin', options: ProdutoTableOptions = {}) {
  const existingIds = options.existingIds ?? ['product-a', 'product-b']
  const updateCalls: Array<{ id: string; ordem_exibicao: number }> = []
  const productOrders = new Map(existingIds.map((id, index) => [id, index + 1]))

  const client = {
    updateCalls,
    productOrders,
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
            data: { funcao: role, ativo: true },
            error: null,
          }),
        }
      }

      if (table === 'produtos') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: existingIds.map((id) => ({ id, ordem_exibicao: productOrders.get(id) ?? null })),
            error: null,
          }),
          update: vi.fn((payload: { ordem_exibicao: number }) => ({
            eq: vi.fn(async (_column: string, id: string) => {
              updateCalls.push({ id, ordem_exibicao: payload.ordem_exibicao })
              if (options.updateErrorAtId !== id) {
                productOrders.set(id, payload.ordem_exibicao)
              }

              return {
                error: options.updateErrorAtId === id ? { message: 'update failed' } : null,
              }
            }),
          })),
        }
      }

      throw new Error(`unexpected table ${table}`)
    }),
  }

  return client
}

describe('reordenarProdutosVisiveis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthorized roles before validating updates', async () => {
    const client = makeOperatorClient('cliente')
    mocks.createClient.mockResolvedValue(client)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-a', ordem_exibicao: 1 },
      { id: 'product-b', ordem_exibicao: 2 },
    ])

    expect(result.success).toBe(false)
    expect(result.error).toBe('ACESSO_NEGADO_PERMISSAO_INSUFICIENTE')
    expect(client.updateCalls).toEqual([])
  })

  it('rejects duplicate submitted IDs without updating products', async () => {
    const client = makeOperatorClient()
    mocks.createClient.mockResolvedValue(client)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-a', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: false, error: 'DADOS_INVALIDOS' })
    expect(client.updateCalls).toEqual([])
  })

  it('rejects non-sequential order positions as an invalid payload', async () => {
    const client = makeOperatorClient()
    mocks.createClient.mockResolvedValue(client)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-a', ordem_exibicao: 1 },
      { id: 'product-b', ordem_exibicao: 3 },
    ])

    expect(result).toEqual({ success: false, error: 'DADOS_INVALIDOS' })
    expect(client.updateCalls).toEqual([])
  })

  it('rejects unknown submitted IDs before updating products', async () => {
    const client = makeOperatorClient('admin', { existingIds: ['product-a'] })
    mocks.createClient.mockResolvedValue(client)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-a', ordem_exibicao: 1 },
      { id: 'product-b', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: false, error: 'PRODUTO_NAO_ENCONTRADO' })
    expect(client.updateCalls).toEqual([])
  })

  it('updates only submitted visible product IDs and revalidates the admin path', async () => {
    const client = makeOperatorClient('supervisor')
    mocks.createClient.mockResolvedValue(client)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-b', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: true })
    expect(client.updateCalls).toEqual([
      { id: 'product-b', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/atendimento/produtos')
  })

  it('rolls back earlier product order updates when a later update fails', async () => {
    const client = makeOperatorClient('admin', { updateErrorAtId: 'product-a' })
    mocks.createClient.mockResolvedValue(client)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-b', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: false, error: 'ERRO_BANCO: update failed' })
    expect(client.updateCalls).toEqual([
      { id: 'product-b', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
      { id: 'product-b', ordem_exibicao: 2 },
    ])
    expect(Object.fromEntries(client.productOrders)).toEqual({
      'product-a': 1,
      'product-b': 2,
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
