import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

type ProdutoTableOptions = {
  existingIds?: string[]
  operatorExistingIds?: string[]
  rpcError?: string
}

function makeOperatorClient(role = 'admin', options: ProdutoTableOptions = {}) {
  const existingIds = options.existingIds ?? ['product-a', 'product-b']
  const operatorExistingIds = options.operatorExistingIds ?? existingIds
  const reorderCalls: Array<Array<{ id: string; ordem_exibicao: number }>> = []
  const productUpdates: unknown[] = []
  const productOrders = new Map(existingIds.map((id, index) => [id, index + 1]))

  const adminClient = {
    rpc: vi.fn(async (_name: string, args: { p_itens: Array<{ id: string; ordem_exibicao: number }> }) => {
      reorderCalls.push(args.p_itens)
      if (!options.rpcError) {
        args.p_itens.forEach(({ id, ordem_exibicao }) => productOrders.set(id, ordem_exibicao))
      }
      return { error: options.rpcError ? { message: options.rpcError } : null }
    }),
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: existingIds.map((id, index) => ({ id, nome: `Produto ${index + 1}`, preco_centavos: 1000 + index })),
        error: null,
      }),
    })),
  }

  const client = {
    upsertCalls: reorderCalls,
    productUpdates,
    productOrders,
    adminClient,
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
          select: vi.fn().mockResolvedValue({
            data: operatorExistingIds.map((id, index) => ({ id, nome: `Produto ${index + 1}`, preco_centavos: 1000 + index })),
            error: null,
          }),
          update: vi.fn((payload) => {
            productUpdates.push(payload)
            return { eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'product-a', ...payload }, error: null }),
            }) }) }
          }),
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
    mocks.createAdminClient.mockReturnValue(client.adminClient)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-a', ordem_exibicao: 1 },
      { id: 'product-b', ordem_exibicao: 2 },
    ])

    expect(result.success).toBe(false)
    expect(result.error).toBe('ACESSO_NEGADO_PERMISSAO_INSUFICIENTE')
    expect(client.upsertCalls).toEqual([])
  })

  it('rejects duplicate submitted IDs without updating products', async () => {
    const client = makeOperatorClient()
    mocks.createClient.mockResolvedValue(client)
    mocks.createAdminClient.mockReturnValue(client.adminClient)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-a', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: false, error: 'DADOS_INVALIDOS' })
    expect(client.upsertCalls).toEqual([])
  })

  it('rejects non-sequential order positions as an invalid payload', async () => {
    const client = makeOperatorClient()
    mocks.createClient.mockResolvedValue(client)
    mocks.createAdminClient.mockReturnValue(client.adminClient)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-a', ordem_exibicao: 1 },
      { id: 'product-b', ordem_exibicao: 3 },
    ])

    expect(result).toEqual({ success: false, error: 'DADOS_INVALIDOS' })
    expect(client.upsertCalls).toEqual([])
  })

  it('rejects a partial sequence that omits a global product', async () => {
    const client = makeOperatorClient('admin', { existingIds: ['product-a', 'product-b', 'product-c'] })
    mocks.createClient.mockResolvedValue(client)
    mocks.createAdminClient.mockReturnValue(client.adminClient)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-a', ordem_exibicao: 1 },
      { id: 'product-b', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: false, error: 'ORDEM_GLOBAL_INCOMPLETA' })
    expect(client.upsertCalls).toEqual([])
  })

  it('updates the complete global sequence without refreshing the client-side reorder state', async () => {
    const client = makeOperatorClient('supervisor')
    mocks.createClient.mockResolvedValue(client)
    mocks.createAdminClient.mockReturnValue(client.adminClient)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-b', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: true })
    expect(client.upsertCalls).toEqual([[
      { id: 'product-b', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ]])
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith('/atendimento/admin')
  })

  it('validates the same global product set exposed to the administrative inventory list', async () => {
    const client = makeOperatorClient('admin', {
      existingIds: ['product-a', 'product-b'],
      operatorExistingIds: ['product-a', 'product-b', 'hidden-by-rls'],
    })
    mocks.createClient.mockResolvedValue(client)
    mocks.createAdminClient.mockReturnValue(client.adminClient)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-b', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: true })
    expect(client.upsertCalls).toHaveLength(1)
  })

  it('leaves every product order unchanged when the atomic bulk upsert fails', async () => {
    const client = makeOperatorClient('admin', { rpcError: 'atomic reorder failed' })
    mocks.createClient.mockResolvedValue(client)
    mocks.createAdminClient.mockReturnValue(client.adminClient)
    const { reordenarProdutosVisiveis } = await import('@/app/actions/produtos')

    const result = await reordenarProdutosVisiveis([
      { id: 'product-b', ordem_exibicao: 1 },
      { id: 'product-a', ordem_exibicao: 2 },
    ])

    expect(result).toEqual({ success: false, error: 'ERRO_BANCO: atomic reorder failed' })
    expect(client.upsertCalls).toHaveLength(1)
    expect(Object.fromEntries(client.productOrders)).toEqual({
      'product-a': 1,
      'product-b': 2,
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('atualizarProduto catalog boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects mixed metadata and stock without issuing a partial update', async () => {
    const client = makeOperatorClient()
    mocks.createClient.mockResolvedValue(client)
    const { atualizarProduto } = await import('@/app/actions/produtos')

    const result = await atualizarProduto('product-a', {
      nome: 'Updated', preco_centavos: 1000, quantidade_estoque: 99,
    } as Parameters<typeof atualizarProduto>[1])

    expect(result).toEqual(expect.objectContaining({ success: false, error: 'DADOS_INVALIDOS' }))
    expect(client.from).not.toHaveBeenCalledWith('produtos')
  })

  it('keeps legitimate catalog metadata editing functional through the session client', async () => {
    const client = makeOperatorClient('supervisor')
    mocks.createClient.mockResolvedValue(client)
    const { atualizarProduto } = await import('@/app/actions/produtos')

    const result = await atualizarProduto('product-a', {
      nome: 'Updated catalog product', descricao: 'Allowed', preco_centavos: 1250, ativo: true,
    })

    expect(client.productUpdates).toEqual([expect.objectContaining({ nome: 'Updated catalog product', preco_centavos: 1250 })])
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
  })
})
