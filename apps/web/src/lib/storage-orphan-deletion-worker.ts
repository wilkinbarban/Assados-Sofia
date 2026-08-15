import { z } from 'zod'

const claimSchema = z.object({
  id: z.string().uuid(),
  object_path: z.string().min(1),
  claim_token: z.string().uuid(),
})

type WorkerResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string }

type WorkerClient = {
  rpc(name: string, args: Record<string, unknown>): unknown
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ error: unknown }>
    }
  }
}

type ClaimQuery = {
  single(): Promise<{ data: unknown; error: unknown }>
}

async function finalize(
  client: WorkerClient,
  claim: z.infer<typeof claimSchema>,
  success: boolean,
): Promise<boolean> {
  const result = await client.rpc('finalizar_reconciliacao_imagem_orfa', {
    p_reconciliacao_id: claim.id,
    p_claim_token: claim.claim_token,
    p_sucesso: success,
    p_erro: success ? null : 'STORAGE_REMOVAL_FAILED',
  }) as { data: unknown; error: unknown }

  return !result.error && result.data === true
}

export async function runStorageOrphanDeletionWorker(
  client: WorkerClient,
  reconciliationId: string,
): Promise<WorkerResult> {
  const claimResult = await (client.rpc('reivindicar_reconciliacao_imagem_orfa', {
    p_reconciliacao_id: reconciliationId,
  }) as ClaimQuery).single()
  const claim = claimSchema.safeParse(claimResult.data)

  if (claimResult.error || !claim.success) {
    return { success: false, error: 'RECONCILIACAO_INDISPONIVEL' }
  }

  const { error: storageError } = await client.storage
    .from('produto-imagens')
    .remove([claim.data.object_path])
  const finalized = await finalize(client, claim.data, !storageError)

  if (!finalized) return { success: false, error: 'ERRO_FINALIZACAO_RECONCILIACAO' }
  return storageError ? { success: false, error: 'ERRO_STORAGE' } : { success: true }
}
