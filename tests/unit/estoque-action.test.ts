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

function makeOperatorClient(role = 'admin') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table !== 'perfis') throw new Error(`unexpected table ${table}`)

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { funcao: role, ativo: true },
          error: null,
        }),
      }
    }),
  }
}

function makeRpcClient(result: { data?: unknown; error?: unknown }) {
  const single = vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  })
  const rpc = vi.fn().mockReturnValue({ single })

  return { client: { rpc }, rpc, single }
}

describe('ajustarEstoque', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue(makeOperatorClient())
  })

  it('calls the atomic stock RPC and preserves the success response shape', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client, rpc } = makeRpcClient({
      data: {
        qtd_anterior: 5,
        qtd_nova: 3,
        movimentacao_id: '22222222-2222-4222-8222-222222222222',
        produto_ativo: true,
      },
    })
    mocks.createAdminClient.mockReturnValue(client)

    const result = await ajustarEstoque(
      '33333333-3333-4333-8333-333333333333',
      2,
      'saida',
      'Ajuste test'
    )

    expect(rpc).toHaveBeenCalledWith('ajustar_estoque_atomico', {
      p_produto_id: '33333333-3333-4333-8333-333333333333',
      p_quantidade: 2,
      p_tipo: 'saida',
      p_motivo: 'Ajuste test',
      p_usuario_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/atendimento/admin')
    expect(result).toEqual({
      success: true,
      data: {
        qtd_anterior: 5,
        qtd_nova: 3,
        movimentacao_id: '22222222-2222-4222-8222-222222222222',
        produto_ativo: true,
      },
    })
  })

  it('allows cancelamento adjustments through the atomic RPC', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client, rpc } = makeRpcClient({
      data: {
        qtd_anterior: 3,
        qtd_nova: 5,
        movimentacao_id: '22222222-2222-4222-8222-222222222222',
        produto_ativo: true,
      },
    })
    mocks.createAdminClient.mockReturnValue(client)

    const result = await ajustarEstoque(
      '33333333-3333-4333-8333-333333333333',
      2,
      'cancelamento',
      'Cancelamento test'
    )

    expect(rpc).toHaveBeenCalledWith('ajustar_estoque_atomico', expect.objectContaining({
      p_tipo: 'cancelamento',
      p_quantidade: 2,
    }))
    expect(result.success).toBe(true)
    expect(result.data?.qtd_nova).toBe(5)
  })

  it('does not call the RPC when validation fails', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client, rpc } = makeRpcClient({})
    mocks.createAdminClient.mockReturnValue(client)

    const result = await ajustarEstoque('not-a-uuid', 0, 'saida')

    expect(result.success).toBe(false)
    expect(result.error).toBe('DADOS_INVALIDOS')
    expect(rpc).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('maps insufficient stock RPC errors to the existing domain error', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client } = makeRpcClient({
      error: { code: '23514', message: 'ESTOQUE_INSUFICIENTE' },
    })
    mocks.createAdminClient.mockReturnValue(client)

    const result = await ajustarEstoque('33333333-3333-4333-8333-333333333333', 10, 'saida')

    expect(result).toEqual({ success: false, error: 'ESTOQUE_INSUFICIENTE' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('maps not found RPC errors to the existing product error', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client } = makeRpcClient({
      error: { code: 'P0002', message: 'PRODUTO_NAO_ENCONTRADO' },
    })
    mocks.createAdminClient.mockReturnValue(client)

    const result = await ajustarEstoque('33333333-3333-4333-8333-333333333333', 1, 'entrada')

    expect(result).toEqual({ success: false, error: 'PRODUTO_NAO_ENCONTRADO' })
  })

  it('maps permission/RLS RPC failures to the existing permission error', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client } = makeRpcClient({
      error: { code: '42501', message: 'permission denied for table produtos' },
    })
    mocks.createAdminClient.mockReturnValue(client)

    const result = await ajustarEstoque('33333333-3333-4333-8333-333333333333', 1, 'entrada')

    expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' })
  })
})
