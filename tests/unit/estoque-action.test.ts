import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image')),
  })),
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

function makeSessionRpcClient(result: { data?: unknown; error?: unknown }, role = 'admin') {
  const operatorClient = makeOperatorClient(role)
  const { rpc, single } = makeRpcClient(result)

  return { client: { ...operatorClient, rpc }, rpc, single }
}

function makeProductUpdateClient() {
  const operator = makeOperatorClient()
  const single = vi.fn().mockResolvedValue({ data: { id: 'product-1', nome: 'Updated' }, error: null })
  const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) })
  const update = vi.fn().mockReturnValue({ eq })
  return { client: { ...operator, from: vi.fn((table: string) => table === 'perfis' ? operator.from(table) : { update }) }, update }
}

describe('atualizarProduto metadata boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects crafted stock fields before any generic product update', async () => {
    const { client, update } = makeProductUpdateClient()
    mocks.createClient.mockResolvedValue(client)
    const { atualizarProduto } = await import('@/app/actions/estoque')

    const result = await atualizarProduto('product-1', {
      nome: 'Updated', preco_centavos: 1200, quantidade_estoque: 99,
    } as Parameters<typeof atualizarProduto>[1])

    expect(result).toEqual(expect.objectContaining({ success: false, error: 'DADOS_INVALIDOS' }))
    expect(update).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('updates legitimate metadata with the authenticated session client', async () => {
    const { client, update } = makeProductUpdateClient()
    mocks.createClient.mockResolvedValue(client)
    const { atualizarProduto } = await import('@/app/actions/estoque')

    const result = await atualizarProduto('product-1', {
      nome: 'Updated', descricao: 'Allowed', preco_centavos: 1200, estoque_minimo: 3, controlar_estoque: true,
    })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Updated', estoque_minimo: 3, controlar_estoque: true }))
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
  })

  it('uses the session client for status edits instead of a privileged client', async () => {
    const { client, update } = makeProductUpdateClient()
    mocks.createClient.mockResolvedValue(client)
    const { alternarStatusProduto } = await import('@/app/actions/estoque')

    const result = await alternarStatusProduto('product-1', false)

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ ativo: false }))
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
  })
})

describe('listarProdutos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refetches the global inventory ordered by persisted position and name', async () => {
    const operatorClient = makeOperatorClient()
    const order = vi.fn().mockReturnThis()
    const query = {
      select: vi.fn().mockReturnThis(),
      order,
      then: (resolveResult: (value: unknown) => unknown) => resolveResult({
        data: [{ id: 'product-b', nome: 'B' }, { id: 'product-a', nome: 'A' }],
        error: null,
      }),
    }
    const adminClient = { from: vi.fn().mockReturnValue(query) }
    mocks.createClient.mockResolvedValue(operatorClient)
    mocks.createAdminClient.mockReturnValue(adminClient)
    const { listarProdutos } = await import('@/app/actions/estoque')

    const result = await listarProdutos()

    expect(adminClient.from).toHaveBeenCalledWith('produtos')
    expect(query.select).toHaveBeenCalledWith('*')
    expect(order.mock.calls).toEqual([
      ['ordem_exibicao', { ascending: true, nullsFirst: false }],
      ['nome', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(result).toEqual({
      success: true,
      data: [{ id: 'product-b', nome: 'B' }, { id: 'product-a', nome: 'A' }],
    })
  })
})

describe('criarProduto transactional RPC', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends stock and retry correlation only to the session-bound RPC', async () => {
    const produto = { produto_id: 'product-1', movimentacao_id: 'movement-1', quantidade_estoque: 4, ativo: true }
    const { client, rpc } = makeSessionRpcClient({ data: produto })
    mocks.createClient.mockResolvedValue(client)
    const { criarProduto } = await import('@/app/actions/estoque')

    const result = await criarProduto({ nome: 'Picanha', preco_centavos: 1200, quantidade_estoque: 4,
      correlation_id: '55555555-5555-4555-8555-555555555555' })

    expect(rpc).toHaveBeenCalledWith('criar_produto_com_estoque', expect.objectContaining({
      p_nome: 'Picanha', p_quantidade_estoque: 4, p_correlation_id: '55555555-5555-4555-8555-555555555555',
    }))
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, data: expect.objectContaining({ id: 'product-1', quantidade_estoque: 4, ativo: true }) })
  })

  it('maps stable RPC errors without a generic product or stock fallback', async () => {
    const { client, rpc } = makeSessionRpcClient({ error: { code: '23505', message: 'IDEMPOTENCY_CONFLICT' } })
    mocks.createClient.mockResolvedValue(client)
    const { criarProduto } = await import('@/app/actions/estoque')

    const result = await criarProduto({ nome: 'Picanha', preco_centavos: 1200,
      correlation_id: '55555555-5555-4555-8555-555555555555' })

    expect(result).toEqual({ success: false, error: 'CONFLITO_IDEMPOTENCIA' })
    expect(rpc).toHaveBeenCalledOnce()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})

describe('ajustarEstoque', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the session-bound client with the four-argument inventory RPC signature', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client, rpc } = makeSessionRpcClient({
      data: {
        qtd_anterior: 5,
        qtd_nova: 3,
        movimentacao_id: '22222222-2222-4222-8222-222222222222',
        produto_ativo: true,
      },
    })
    mocks.createClient.mockResolvedValue(client)

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
    })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
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
    const { client, rpc } = makeSessionRpcClient({
      data: {
        qtd_anterior: 3,
        qtd_nova: 5,
        movimentacao_id: '22222222-2222-4222-8222-222222222222',
        produto_ativo: true,
      },
    })
    mocks.createClient.mockResolvedValue(client)

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

  it('keeps the active admin or supervisor authorization check before the RPC', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client, rpc } = makeSessionRpcClient({}, 'vendedor')
    mocks.createClient.mockResolvedValue(client)

    const result = await ajustarEstoque('33333333-3333-4333-8333-333333333333', 1, 'entrada')

    expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' })
    expect(rpc).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('does not call the RPC when validation fails', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client, rpc } = makeSessionRpcClient({})
    mocks.createClient.mockResolvedValue(client)

    const result = await ajustarEstoque('not-a-uuid', 0, 'saida')

    expect(result.success).toBe(false)
    expect(result.error).toBe('DADOS_INVALIDOS')
    expect(rpc).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('maps insufficient stock RPC errors to the existing domain error', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client } = makeSessionRpcClient({
      error: { code: '23514', message: 'ESTOQUE_INSUFICIENTE' },
    })
    mocks.createClient.mockResolvedValue(client)

    const result = await ajustarEstoque('33333333-3333-4333-8333-333333333333', 10, 'saida')

    expect(result).toEqual({ success: false, error: 'ESTOQUE_INSUFICIENTE' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('maps not found RPC errors to the existing product error', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client } = makeSessionRpcClient({
      error: { code: 'P0002', message: 'PRODUTO_NAO_ENCONTRADO' },
    })
    mocks.createClient.mockResolvedValue(client)

    const result = await ajustarEstoque('33333333-3333-4333-8333-333333333333', 1, 'entrada')

    expect(result).toEqual({ success: false, error: 'PRODUTO_NAO_ENCONTRADO' })
  })

  it('maps permission/RLS RPC failures to the existing permission error', async () => {
    const { ajustarEstoque } = await import('@/app/actions/estoque')
    const { client } = makeSessionRpcClient({
      error: { code: '42501', message: 'permission denied for table produtos' },
    })
    mocks.createClient.mockResolvedValue(client)

    const result = await ajustarEstoque('33333333-3333-4333-8333-333333333333', 1, 'entrada')

    expect(result).toEqual({ success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' })
  })
})

function makeImageLifecycleClient(options: {
  previous?: { full: string | null; thumb: string | null; cleanup_id?: string | null }
  persistError?: { message: string }
  removeError?: { message: string }
  cleanupRecordError?: { message: string }
  cleanupRecord?: { id: string; paths: string[] } | null
  cleanupId?: string | null
  completeError?: { message: string }
} = {}) {
  const uploads: string[] = []
  const removals: string[][] = []
  const rpc = vi.fn((name: string) => {
    if (name === 'substituir_imagem_produto') {
      return {
        single: vi.fn().mockResolvedValue({
          data: options.persistError ? null : options.previous ?? { full: null, thumb: null },
          error: options.persistError ?? null,
        }),
      }
    }

    if (name === 'obter_limpeza_imagem_pendente') {
      return {
        single: vi.fn().mockResolvedValue({ data: options.cleanupRecord ?? null, error: null }),
      }
    }

    if (name === 'registrar_limpeza_imagem_pendente') {
      return { data: options.cleanupId ?? '44444444-4444-4444-8444-444444444444', error: options.cleanupRecordError ?? null }
    }

    if (name === 'concluir_limpeza_imagem_pendente') {
      return { data: null, error: options.completeError ?? null }
    }

    return { single: vi.fn().mockResolvedValue({ data: null, error: null }) }
  })

  const client = {
    ...makeOperatorClient(),
    rpc,
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          uploads.push(path)
          return { error: null }
        }),
        remove: vi.fn(async (paths: string[]) => {
          removals.push(paths)
          return { error: options.removeError ?? null }
        }),
      })),
    },
  }

  return { client, rpc, uploads, removals }
}

function imageFormData() {
  const formData = new FormData()
  formData.set('file', new File(['image'], 'product.webp', { type: 'image/webp' }))
  return formData
}

describe('uploadImagemProduto image lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads immutable full and thumb paths and persists them through the authenticated RPC', async () => {
    const { uploadImagemProduto } = await import('@/app/actions/estoque')
    const { client, rpc, uploads } = makeImageLifecycleClient()
    mocks.createClient.mockResolvedValue(client)

    const result = await uploadImagemProduto('33333333-3333-4333-8333-333333333333', imageFormData(), 1)

    expect(result).toMatchObject({ success: true })
    expect(uploads).toHaveLength(2)
    expect(uploads[0]).toMatch(/^produtos\/33333333-3333-4333-8333-333333333333\/1\/[0-9a-f-]+\/full\.webp$/)
    expect(uploads[1]).toMatch(/^produtos\/33333333-3333-4333-8333-333333333333\/1\/[0-9a-f-]+\/thumb\.webp$/)
    expect(rpc).toHaveBeenCalledWith('substituir_imagem_produto', expect.objectContaining({
      p_produto_id: '33333333-3333-4333-8333-333333333333',
      p_slot: 1,
      p_full_path: uploads[0],
      p_thumb_path: uploads[1],
    }))
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/atendimento/admin')
  })

  it('compensates only the new uploads and preserves the previous image when persistence fails', async () => {
    const { uploadImagemProduto } = await import('@/app/actions/estoque')
    const previous = {
      full: 'produtos/33333333-3333-4333-8333-333333333333/1/old/full.webp',
      thumb: 'produtos/33333333-3333-4333-8333-333333333333/1/old/thumb.webp',
    }
    const { client, uploads, removals } = makeImageLifecycleClient({
      previous,
      persistError: { message: 'database write failed' },
    })
    mocks.createClient.mockResolvedValue(client)

    const result = await uploadImagemProduto('33333333-3333-4333-8333-333333333333', imageFormData(), 1)

    expect(result).toEqual({ success: false, error: 'ERRO_BANCO: database write failed' })
    expect(removals).toEqual([uploads])
    expect(removals.flat()).not.toContain(previous.full)
    expect(removals.flat()).not.toContain(previous.thumb)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('cleans previous immutable assets after a successful replacement', async () => {
    const { uploadImagemProduto } = await import('@/app/actions/estoque')
    const previous = {
      full: 'produtos/33333333-3333-4333-8333-333333333333/2/old/full.webp',
      thumb: 'produtos/33333333-3333-4333-8333-333333333333/2/old/thumb.webp',
      cleanup_id: '44444444-4444-4444-8444-444444444444',
    }
    const { client, removals, rpc } = makeImageLifecycleClient({ previous })
    mocks.createClient.mockResolvedValue(client)

    const result = await uploadImagemProduto('33333333-3333-4333-8333-333333333333', imageFormData(), 2)

    expect(result).toMatchObject({ success: true, cleanup_pending: false, cleanup_id: previous.cleanup_id })
    expect(removals).toEqual([[previous.full, previous.thumb]])
    expect(rpc).toHaveBeenCalledWith('concluir_limpeza_imagem_pendente', { p_cleanup_id: previous.cleanup_id })
  })

  it('records failed legacy old-image cleanup durably and retries it without changing the persisted image', async () => {
    const { reprocessarLimpezaImagemPendente, uploadImagemProduto } = await import('@/app/actions/estoque')
    const previous = {
      full: 'prod_33333333-3333-4333-8333-333333333333_full.webp',
      thumb: 'prod_33333333-3333-4333-8333-333333333333_thumb.webp',
      cleanup_id: '44444444-4444-4444-8444-444444444444',
    }
    const { client, rpc, removals } = makeImageLifecycleClient({
      previous,
      removeError: { message: 'storage temporarily unavailable' },
      cleanupRecord: { id: '44444444-4444-4444-8444-444444444444', paths: [previous.full, previous.thumb] },
    })
    mocks.createClient.mockResolvedValue(client)

    const uploadResult = await uploadImagemProduto('33333333-3333-4333-8333-333333333333', imageFormData(), 1)

    expect(uploadResult).toMatchObject({ success: true, cleanup_pending: true, cleanup_id: previous.cleanup_id })
    expect(rpc).not.toHaveBeenCalledWith('registrar_limpeza_imagem_pendente', expect.anything())

    const retryResult = await reprocessarLimpezaImagemPendente('44444444-4444-4444-8444-444444444444')

    expect(retryResult).toEqual({ success: false, error: 'ERRO_STORAGE: storage temporarily unavailable' })
    expect(removals).toContainEqual([previous.full, previous.thumb])
    expect(rpc).toHaveBeenCalledWith('falhar_limpeza_imagem_pendente', expect.objectContaining({
      p_cleanup_id: '44444444-4444-4444-8444-444444444444',
      p_error: 'storage temporarily unavailable',
    }))
  })

  it('exposes the registrar cleanup UUID when new uploads cannot be compensated', async () => {
    const { uploadImagemProduto } = await import('@/app/actions/estoque')
    const cleanupId = '44444444-4444-4444-8444-444444444444'
    const { client } = makeImageLifecycleClient({
      persistError: { message: 'database write failed' },
      removeError: { message: 'storage temporarily unavailable' },
      cleanupId,
    })
    mocks.createClient.mockResolvedValue(client)

    const result = await uploadImagemProduto('33333333-3333-4333-8333-333333333333', imageFormData(), 2)

    expect(result).toEqual({ success: false, error: 'ERRO_BANCO: database write failed', cleanup_id: cleanupId })
  })

  it('does not delete and completes cleanup when the authenticated RPC excludes all referenced paths', async () => {
    const { reprocessarLimpezaImagemPendente } = await import('@/app/actions/estoque')
    const { client, removals, rpc } = makeImageLifecycleClient({
      cleanupRecord: { id: '44444444-4444-4444-8444-444444444444', paths: [] },
    })
    mocks.createClient.mockResolvedValue(client)

    const result = await reprocessarLimpezaImagemPendente('44444444-4444-4444-8444-444444444444')

    expect(result).toEqual({ success: true })
    expect(removals).toEqual([])
    expect(rpc).toHaveBeenCalledWith('concluir_limpeza_imagem_pendente', { p_cleanup_id: '44444444-4444-4444-8444-444444444444' })
  })

  it('returns an actionable failure instead of claiming durable cleanup when cleanup recording fails', async () => {
    const { uploadImagemProduto } = await import('@/app/actions/estoque')
    const { client, rpc } = makeImageLifecycleClient({
      persistError: { message: 'database write failed' },
      removeError: { message: 'storage temporarily unavailable' },
      cleanupRecordError: { message: 'cleanup persistence unavailable' },
    })
    mocks.createClient.mockResolvedValue(client)

    const result = await uploadImagemProduto('33333333-3333-4333-8333-333333333333', imageFormData(), 2)

    expect(result).toEqual({
      success: false,
      error: 'LIMPEZA_PENDENTE_NAO_PERSISTIDA',
    })
    expect(rpc).toHaveBeenCalledWith('registrar_limpeza_imagem_pendente', expect.objectContaining({
      p_produto_id: '33333333-3333-4333-8333-333333333333',
      p_paths: expect.any(Array),
      p_error: 'storage temporarily unavailable',
    }))
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('produto image cleanup SQL contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260713110019_admin_product_image_lifecycle.sql'),
    'utf8'
  )

  it('allows only product-bound legacy/versioned paths and explicitly rejects null cleanup elements', () => {
    expect(sql).toContain("if p_slot is null or p_slot not in (1, 2) then")
    expect(sql).toContain("[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
    expect(sql).toContain("'^prod_' || p_produto_id::text || '(_2)?_(full|thumb)\\.webp$'")
    expect(sql).toContain('if v_path is null or')
    expect(sql).not.toContain("'[0-9a-f-]+/(full|thumb)\\\\.webp$'")
  })

  it('uses PostgreSQL-compatible literal-dot regexes for canonical and legacy cleanup paths', () => {
    const produtoId = '33333333-3333-4333-8333-333333333333'
    const version = '44444444-4444-4444-8444-444444444444'
    const canonicalFull = `produtos/${produtoId}/1/${version}/full.webp`
    const canonicalThumb = `produtos/${produtoId}/2/${version}/thumb.webp`
    const legacyFull = `prod_${produtoId}_full.webp`
    const legacyThumb = `prod_${produtoId}_2_thumb.webp`
    const arbitraryPath = `produtos/${produtoId}/1/not-a-uuid/full.webp`

    expect(sql).toContain('/full\\.webp$')
    expect(sql).toContain('/thumb\\.webp$')
    expect(sql).not.toContain('/full\\\\.webp$')
    expect(sql).not.toContain('/thumb\\\\.webp$')

    const canonicalPath = new RegExp(
      `^produtos/${produtoId}/[12]/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(full|thumb)\\.webp$`
    )
    const legacyPath = new RegExp(`^prod_${produtoId}(_2)?_(full|thumb)\\.webp$`)

    expect(canonicalPath.test(canonicalFull)).toBe(true)
    expect(canonicalPath.test(canonicalThumb)).toBe(true)
    expect(legacyPath.test(legacyFull)).toBe(true)
    expect(legacyPath.test(legacyThumb)).toBe(true)
    expect(canonicalPath.test(arbitraryPath)).toBe(false)
    expect(legacyPath.test(arbitraryPath)).toBe(false)
  })

  it('returns the locked prior full and thumb values through an explicit valid query', () => {
    expect(sql).toContain('return query\n  select v_previous_full as full, v_previous_thumb as thumb, v_cleanup_id as cleanup_id;')
    expect(sql).not.toMatch(/\bfull\s*:=/)
    expect(sql).not.toMatch(/\bthumb\s*:=/)
    expect(sql).not.toContain('return next;')
  })

  it('creates pending cleanup atomically and excludes paths that are referenced by a current product', () => {
    expect(sql).toContain('v_previous_paths')
    expect(sql).toContain('returning id into v_cleanup_id')
    expect(sql).toContain('select array_agg(path)')
    expect(sql).toContain('p.url_imagem = path')
    expect(sql).toContain('p.url_imagem_2_thumb = path')
  })
})
