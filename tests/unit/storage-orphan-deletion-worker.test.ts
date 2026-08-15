import { describe, expect, it, vi } from 'vitest'
import { runStorageOrphanDeletionWorker } from '@/lib/storage-orphan-deletion-worker'

const reconciliationId = 'c987e9a0-0b9c-4e7b-b5f9-dafc764c10aa'
const claimToken = 'a4d53f4f-a272-4af1-859b-7f420d14ba3e'
const objectPath = 'produtos/produto-1/slot-1/full.webp'

function createWorkerClient(options: {
  readonly claim?: unknown
  readonly claimError?: unknown
  readonly removeError?: unknown
  readonly finalizeData?: unknown
  readonly finalizeError?: unknown
} = {}) {
  const remove = vi.fn().mockResolvedValue({ error: options.removeError ?? null })
  const rpc = vi.fn((name: string) => {
    if (name === 'reivindicar_reconciliacao_imagem_orfa') {
      return { single: vi.fn().mockResolvedValue({
        data: Object.hasOwn(options, 'claim')
          ? options.claim
          : { id: reconciliationId, object_path: objectPath, claim_token: claimToken },
        error: options.claimError ?? null,
      }) }
    }
    return Promise.resolve({ data: options.finalizeData ?? true, error: options.finalizeError ?? null })
  })
  return { client: { rpc, storage: { from: vi.fn(() => ({ remove })) } }, rpc, remove }
}

describe('runStorageOrphanDeletionWorker', () => {
  it('deletes one atomically claimed object and completes only with its claim token', async () => {
    const { client, rpc, remove } = createWorkerClient()

    await expect(runStorageOrphanDeletionWorker(client, reconciliationId)).resolves.toEqual({ success: true })
    expect(remove).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith([objectPath])
    expect(rpc).toHaveBeenLastCalledWith('finalizar_reconciliacao_imagem_orfa', {
      p_reconciliacao_id: reconciliationId,
      p_claim_token: claimToken,
      p_sucesso: true,
      p_erro: null,
    })
  })

  it('records a secret-safe retriable failure and never retries deletion inside one delivery', async () => {
    const { client, rpc, remove } = createWorkerClient({ removeError: { message: 'secret endpoint detail' } })

    await expect(runStorageOrphanDeletionWorker(client, reconciliationId)).resolves.toEqual({
      success: false,
      error: 'ERRO_STORAGE',
    })
    expect(remove).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenLastCalledWith('finalizar_reconciliacao_imagem_orfa', {
      p_reconciliacao_id: reconciliationId,
      p_claim_token: claimToken,
      p_sucesso: false,
      p_erro: 'STORAGE_REMOVAL_FAILED',
    })
  })

  it('does not call Storage or finalize when no active claim is returned', async () => {
    const { client, rpc, remove } = createWorkerClient({ claim: null })

    await expect(runStorageOrphanDeletionWorker(client, reconciliationId)).resolves.toEqual({
      success: false,
      error: 'RECONCILIACAO_INDISPONIVEL',
    })
    expect(remove).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('reports token-bound finalization rejection without issuing a second delete', async () => {
    const { client, remove } = createWorkerClient({ finalizeData: false })

    await expect(runStorageOrphanDeletionWorker(client, reconciliationId)).resolves.toEqual({
      success: false,
      error: 'ERRO_FINALIZACAO_RECONCILIACAO',
    })
    expect(remove).toHaveBeenCalledOnce()
  })
})
