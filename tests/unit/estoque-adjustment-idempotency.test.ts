import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const single = vi.fn().mockResolvedValue({ data: { funcao: 'admin', ativo: true }, error: null })
const client = {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null }) },
  from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) })),
  rpc,
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { ajustarEstoque, atualizarProduto, criarProduto } from '@/app/actions/estoque'

describe('idempotent stock adjustment action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    single.mockResolvedValue({ data: { funcao: 'admin', ativo: true }, error: null })
    rpc.mockReturnValue({ single: vi.fn().mockResolvedValue({
      data: { qtd_anterior: 5, qtd_nova: 6, movimentacao_id: 'move-id', produto_ativo: true }, error: null,
    }) })
  })

  it('selects the six-argument idempotent overload with a valid correlation', async () => {
    const correlation = '11111111-1111-4111-8111-111111111111'
    const result = await ajustarEstoque('22222222-2222-4222-8222-222222222222', 1, 'entrada', 'Painel', correlation, true)

    expect(rpc).toHaveBeenCalledWith('ajustar_estoque_atomico', {
      p_produto_id: '22222222-2222-4222-8222-222222222222', p_quantidade: 1,
      p_tipo: 'entrada', p_motivo: 'Painel', p_correlation_id: correlation, p_idempotent: true,
    })
    expect(result).toEqual({ success: true, data: {
      qtd_anterior: 5, qtd_nova: 6, movimentacao_id: 'move-id', produto_ativo: true,
    } })
  })

  it.each([undefined, 'not-a-uuid'])('rejects idempotent adjustment correlation %s', async (correlation) => {
    const result = await ajustarEstoque('22222222-2222-4222-8222-222222222222', 1, 'entrada', null, correlation, true)
    expect(result).toEqual(expect.objectContaining({ success: false, error: 'DADOS_INVALIDOS' }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    { code: '23505', message: 'duplicate key' },
    { code: 'P0001', message: 'IDEMPOTENCY_CONFLICT' },
  ])('maps changed-payload conflict $code to the stable contract', async (error) => {
    rpc.mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error }) })
    const result = await ajustarEstoque('22222222-2222-4222-8222-222222222222', 2, 'entrada', 'Changed',
      '11111111-1111-4111-8111-111111111111', true)
    expect(result).toEqual({ success: false, error: 'CONFLITO_IDEMPOTENCIA' })
  })

  it.each([
    ['creation', () => criarProduto({ nome: ' \t ', preco_centavos: 100 })],
    ['update', () => atualizarProduto('product-id', { nome: ' \n ', preco_centavos: 100 })],
  ])('rejects whitespace-only product %s before its write', async (_label, action) => {
    expect(await action()).toEqual(expect.objectContaining({ success: false, error: 'DADOS_INVALIDOS' }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('trims surrounding product-name whitespace before creation', async () => {
    await criarProduto({ nome: '  Picanha Premium  ', preco_centavos: 100 })
    expect(rpc).toHaveBeenCalledWith('criar_produto_com_estoque', expect.objectContaining({ p_nome: 'Picanha Premium' }))
  })
})
