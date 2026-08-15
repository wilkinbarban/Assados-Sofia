import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  list: vi.fn(),
  profileSingle: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.profileSingle }),
      }),
    }),
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  }),
}))

import { varrerImagensOrfasEmModoDryRun } from '@/app/actions/storage-orphan-reconciliation'

describe('varrerImagensOrfasEmModoDryRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    mocks.profileSingle.mockResolvedValue({ data: { ativo: true, funcao: 'admin' }, error: null })
    mocks.storageFrom.mockReturnValue({ list: mocks.list })
    mocks.list.mockImplementation(async (path: string) => {
      if (path === 'produtos') return { data: [{ id: null, name: 'produto-1', created_at: null }], error: null }
      return {
        data: [{
          id: 'object-1',
          name: 'full.webp',
          created_at: '2026-07-19T12:00:00.000Z',
        }],
        error: null,
      }
    })
    mocks.rpc.mockResolvedValue({ data: 'reconciliation-1', error: null })
  })

  it('records discovered product objects without deleting Storage files', async () => {
    await expect(varrerImagensOrfasEmModoDryRun(new Date('2026-07-20T12:00:00.000Z'))).resolves.toEqual({
      success: true,
      dryRun: true,
      discovered: 1,
      recorded: 1,
      skipped: 0,
    })
    expect(mocks.storageFrom).toHaveBeenCalledWith('produto-imagens')
    expect(mocks.list).toHaveBeenCalledWith('produtos', expect.any(Object))
    expect(mocks.list).toHaveBeenCalledWith('produtos/produto-1', expect.any(Object))
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_reconciliacao_imagem_orfa', {
      p_object_path: 'produtos/produto-1/full.webp',
      p_object_created_at: '2026-07-19T12:00:00.000Z',
      p_scan_at: '2026-07-20T12:00:00.000Z',
    })
  })

  it('rejects an unauthenticated caller before listing Storage', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(varrerImagensOrfasEmModoDryRun(new Date('2026-07-20T12:00:00.000Z'))).resolves.toEqual({
      success: false,
      error: 'ACESSO_NEGADO_NAO_AUTENTICADO',
    })
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })

  it('rejects an inactive operator before listing Storage', async () => {
    mocks.profileSingle.mockResolvedValue({ data: { ativo: false, funcao: 'admin' }, error: null })

    await expect(varrerImagensOrfasEmModoDryRun(new Date('2026-07-20T12:00:00.000Z'))).resolves.toEqual({
      success: false,
      error: 'PERFIL_INATIVO',
    })
    expect(mocks.storageFrom).not.toHaveBeenCalled()
  })

  it('paginates every folder before recording discovered files', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      id: `object-${index}`,
      name: `image-${index}.webp`,
      created_at: '2026-07-19T12:00:00.000Z',
    }))
    mocks.list.mockImplementation(async (path: string, options: { offset: number }) => {
      if (path === 'produtos') return { data: [{ id: null, name: 'produto-1', created_at: null }], error: null }
      if (options.offset === 0) return { data: firstPage, error: null }
      return { data: [{ id: 'object-final', name: 'final.webp', created_at: '2026-07-19T12:00:00.000Z' }], error: null }
    })

    await expect(varrerImagensOrfasEmModoDryRun(new Date('2026-07-20T12:00:00.000Z'))).resolves.toEqual({
      success: true,
      dryRun: true,
      discovered: 1_001,
      recorded: 1_001,
      skipped: 0,
    })
    expect(mocks.list).toHaveBeenCalledWith('produtos/produto-1', expect.objectContaining({ offset: 1_000 }))
  })

  it('persists a safe report when a product object has an invalid timestamp', async () => {
    mocks.list.mockImplementation(async (path: string) => {
      if (path === 'produtos') return { data: [{ id: null, name: 'produto-1', created_at: null }], error: null }
      return { data: [{ id: 'object-invalid', name: 'invalid.webp', created_at: 'not-a-date' }], error: null }
    })

    await expect(varrerImagensOrfasEmModoDryRun(new Date('2026-07-20T12:00:00.000Z'))).resolves.toEqual({
      success: true,
      dryRun: true,
      discovered: 1,
      recorded: 0,
      skipped: 1,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_relatorio_varredura_imagem_orfa', {
      p_object_path: 'produtos/produto-1/invalid.webp',
      p_reason: 'INVALID_TIMESTAMP',
      p_scan_at: '2026-07-20T12:00:00.000Z',
    })
  })

  it('persists a safe report when a product object has malformed metadata', async () => {
    mocks.list.mockImplementation(async (path: string) => {
      if (path === 'produtos') return { data: [{ id: null, name: 'produto-1', created_at: null }], error: null }
      return { data: [{ id: 42, name: 'malformed.webp', created_at: null }], error: null }
    })

    await expect(varrerImagensOrfasEmModoDryRun(new Date('2026-07-20T12:00:00.000Z'))).resolves.toEqual({
      success: true,
      dryRun: true,
      discovered: 0,
      recorded: 0,
      skipped: 1,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_relatorio_varredura_imagem_orfa', {
      p_object_path: 'produtos/produto-1/malformed.webp',
      p_reason: 'INVALID_STORAGE_METADATA',
      p_scan_at: '2026-07-20T12:00:00.000Z',
    })
  })
})
