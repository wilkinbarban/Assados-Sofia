import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  runWorker: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/storage-orphan-deletion-worker', () => ({
  runStorageOrphanDeletionWorker: mocks.runWorker,
}))

import { executarReconciliacaoImagemOrfa } from '@/app/actions/storage-orphan-reconciliation'

const reconciliationId = 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa'

describe('executarReconciliacaoImagemOrfa authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const profileQuery = {
      select: mocks.select,
      eq: vi.fn().mockReturnValue({ single: mocks.single }),
    }
    const client = {
      auth: { getUser: mocks.authGetUser },
      from: mocks.from,
    }
    mocks.createClient.mockResolvedValue(client)
    mocks.from.mockReturnValue(profileQuery)
    mocks.select.mockReturnValue(profileQuery)
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
      error: null,
    })
    mocks.single.mockResolvedValue({ data: { funcao: 'admin', ativo: true }, error: null })
    mocks.runWorker.mockResolvedValue({ success: true })
  })

  it('denies a seller before claiming or deleting an orphan', async () => {
    mocks.single.mockResolvedValue({ data: { funcao: 'vendedor', ativo: true }, error: null })

    await expect(executarReconciliacaoImagemOrfa(reconciliationId)).resolves.toEqual({
      success: false,
      error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE',
    })
    expect(mocks.runWorker).not.toHaveBeenCalled()
  })

  it.each(['admin', 'supervisor'])(
    'delegates the approved deletion to the claim-token worker for an active %s',
    async (funcao) => {
      mocks.single.mockResolvedValue({ data: { funcao, ativo: true }, error: null })

      await expect(executarReconciliacaoImagemOrfa(reconciliationId)).resolves.toEqual({ success: true })
      expect(mocks.runWorker).toHaveBeenCalledWith(
        expect.objectContaining({ auth: expect.any(Object), from: expect.any(Function) }),
        reconciliationId,
      )
    },
  )

  it('rejects an invalid identifier before creating a server client', async () => {
    await expect(executarReconciliacaoImagemOrfa('not-a-uuid')).resolves.toEqual({
      success: false,
      error: 'RECONCILIACAO_INVALIDA',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.runWorker).not.toHaveBeenCalled()
  })
})
