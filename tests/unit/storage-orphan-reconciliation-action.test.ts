import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  from: vi.fn(),
  order: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  storageFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.authGetUser },
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  }),
}))

import {
  aprovarReconciliacaoImagemOrfa,
  executarReconciliacaoImagemOrfa,
  listarReconciliacoesImagemOrfa,
} from '@/app/actions/storage-orphan-reconciliation'

const authorizedUser = { id: '11111111-1111-4111-8111-111111111111' }

function mockPerfil(perfil: { readonly funcao: string; readonly ativo: boolean } | null) {
  mocks.single.mockResolvedValue({ data: perfil, error: null })
}

function expectPerfilLookup() {
  expect(mocks.from).toHaveBeenCalledWith('perfis')
  expect(mocks.select).toHaveBeenCalledWith('funcao, ativo')
}

describe('executarReconciliacaoImagemOrfa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authGetUser.mockResolvedValue({ data: { user: authorizedUser }, error: null })
    mockPerfil({ funcao: 'admin', ativo: true })
    const profileQuery = {
      select: mocks.select,
      eq: vi.fn().mockReturnValue({ single: mocks.single }),
    }
    mocks.select.mockReturnValue(profileQuery)
    mocks.from.mockReturnValue(profileQuery)
    mocks.storageFrom.mockReturnValue({ remove: mocks.remove })
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'reivindicar_reconciliacao_imagem_orfa') {
        return {
          single: async () => ({
            data: {
              id: 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa',
              object_path: 'produtos/produto-1/slot-1/full.webp',
              claim_token: 'a4d53f4f-a272-4af1-859b-7f420d14ba3e',
            },
            error: null,
          }),
        }
      }

      return Promise.resolve({ data: true, error: null })
    })
  })

  it('records completion after Storage removes an approved claimed object', async () => {
    mocks.remove.mockResolvedValue({ error: null })

    await expect(executarReconciliacaoImagemOrfa('c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa')).resolves.toEqual({ success: true })
    expect(mocks.storageFrom).toHaveBeenCalledWith('produto-imagens')
    expect(mocks.remove).toHaveBeenCalledWith(['produtos/produto-1/slot-1/full.webp'])
    expect(mocks.rpc).toHaveBeenLastCalledWith('finalizar_reconciliacao_imagem_orfa', {
      p_reconciliacao_id: 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa',
      p_claim_token: 'a4d53f4f-a272-4af1-859b-7f420d14ba3e',
      p_sucesso: true,
      p_erro: null,
    })
  })

  it('records a retriable failure when Storage cannot remove the claimed object', async () => {
    mocks.remove.mockResolvedValue({ error: { message: 'storage unavailable' } })

    await expect(executarReconciliacaoImagemOrfa('c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa')).resolves.toEqual({
      success: false,
      error: 'ERRO_STORAGE',
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('finalizar_reconciliacao_imagem_orfa', {
      p_reconciliacao_id: 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa',
      p_claim_token: 'a4d53f4f-a272-4af1-859b-7f420d14ba3e',
      p_sucesso: false,
      p_erro: 'STORAGE_REMOVAL_FAILED',
    })
  })

  it('reports when a Storage failure cannot be recorded as retriable', async () => {
    mocks.remove.mockResolvedValue({ error: { message: 'storage unavailable' } })
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'reivindicar_reconciliacao_imagem_orfa') {
        return {
          single: async () => ({
            data: {
              id: 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa',
              object_path: 'produtos/produto-1/slot-1/full.webp',
              claim_token: 'a4d53f4f-a272-4af1-859b-7f420d14ba3e',
            },
            error: null,
          }),
        }
      }

      return Promise.resolve({ error: { message: 'database unavailable' } })
    })

    await expect(executarReconciliacaoImagemOrfa('c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa')).resolves.toEqual({
      success: false,
      error: 'ERRO_FINALIZACAO_RECONCILIACAO',
    })
  })

  it('reports when completion is rejected after Storage removal', async () => {
    mocks.remove.mockResolvedValue({ error: null })
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'reivindicar_reconciliacao_imagem_orfa') {
        return {
          single: async () => ({
            data: {
              id: 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa',
              object_path: 'produtos/produto-1/slot-1/full.webp',
              claim_token: 'a4d53f4f-a272-4af1-859b-7f420d14ba3e',
            },
            error: null,
          }),
        }
      }

      return Promise.resolve({ data: false, error: null })
    })

    await expect(executarReconciliacaoImagemOrfa('c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa')).resolves.toEqual({
      success: false,
      error: 'ERRO_FINALIZACAO_RECONCILIACAO',
    })
  })
})

describe('storage orphan reconciliation operator actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authGetUser.mockResolvedValue({ data: { user: authorizedUser }, error: null })
    mockPerfil({ funcao: 'admin', ativo: true })
    const query = {
      select: mocks.select,
      eq: vi.fn().mockReturnValue({ single: mocks.single }),
      order: mocks.order,
    }
    mocks.select.mockReturnValue(query)
    mocks.order.mockReturnValueOnce(query).mockResolvedValue({ data: [], error: null })
    mocks.from.mockReturnValue(query)
    mocks.rpc.mockResolvedValue({ data: true, error: null })
  })

  it.each([
    ['list', () => listarReconciliacoesImagemOrfa()],
    ['approve', () => aprovarReconciliacaoImagemOrfa('c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa')],
  ])('rejects unauthenticated %s access before data access', async (_label, action) => {
    mocks.authGetUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(action()).resolves.toEqual({ success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['inactive', { funcao: 'admin', ativo: false }, 'PERFIL_INATIVO'],
    ['unauthorized', { funcao: 'vendedor', ativo: true }, 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE'],
  ])('rejects %s operator access before list queries', async (_label, perfil, error) => {
    mockPerfil(perfil)

    await expect(listarReconciliacoesImagemOrfa()).resolves.toEqual({ success: false, error })
    expectPerfilLookup()
    expect(mocks.order).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects invalid approval UUID before RPC', async () => {
    await expect(aprovarReconciliacaoImagemOrfa('not-a-uuid')).resolves.toEqual({
      success: false,
      error: 'RECONCILIACAO_INVALIDA',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns authorized reconciliation rows with only UI-safe fields', async () => {
    const orderedQuery = { order: mocks.order }
    mocks.order.mockReset()
    mocks.order.mockReturnValueOnce(orderedQuery).mockResolvedValue({
      data: [{
        id: 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa',
        object_path: 'produtos/produto-1/slot-1/full.webp',
        object_created_at: '2026-07-19T10:00:00.000Z',
        discovered_at: '2026-07-21T10:00:00.000Z',
        reference_status: 'unreferenced',
        status: 'pending',
        approved_by: '11111111-1111-4111-8111-111111111111',
        attempts: 2,
        last_error: null,
        approved_at: null,
        completed_at: null,
      }],
      error: null,
    })

    await expect(listarReconciliacoesImagemOrfa()).resolves.toEqual({
      success: true,
      data: [{
        id: 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa',
        objectPath: 'produtos/produto-1/slot-1/full.webp',
        objectCreatedAt: '2026-07-19T10:00:00.000Z',
        discoveredAt: '2026-07-21T10:00:00.000Z',
        status: 'pending',
        attempts: 2,
        error: null,
        approvedAt: null,
        completedAt: null,
      }],
    })
    expect(mocks.from).toHaveBeenLastCalledWith('produto_imagem_orfao_reconciliacoes')
    expect(mocks.select).toHaveBeenLastCalledWith('id, object_path, object_created_at, discovered_at, status, attempts, last_error, approved_at, completed_at')
    expect(mocks.order).toHaveBeenCalledWith('discovered_at', { ascending: false })
    expect(mocks.order).toHaveBeenCalledWith('object_path', { ascending: true })
  })

  it('approves an authorized reconciliation through the existing RPC', async () => {
    await expect(aprovarReconciliacaoImagemOrfa('c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa')).resolves.toEqual({
      success: true,
      approved: true,
    })
    expectPerfilLookup()
    expect(mocks.rpc).toHaveBeenCalledWith('aprovar_reconciliacao_imagem_orfa', {
      p_reconciliacao_id: 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa',
    })
  })
})
