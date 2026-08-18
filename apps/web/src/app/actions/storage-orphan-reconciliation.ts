'use server'

import { z } from 'zod'
import { runStorageOrphanDeletionWorker } from '@/lib/storage-orphan-deletion-worker'
import { createClient } from '@/lib/supabase/server'

const reconciliationIdSchema = z.string().uuid()
const operatorProfileSchema = z.object({
  funcao: z.string(),
  ativo: z.boolean(),
})
const reconciliationTimestampSchema = z.string().refine((value) => Number.isFinite(new Date(value).getTime()))
const reconciliationStatusSchema = z.enum(['pending', 'approved', 'claimed', 'completed', 'protected', 'failed'])
const reconciliationListRowSchema = z.object({
  id: z.string().uuid(),
  object_path: z.string().min(1),
  object_created_at: reconciliationTimestampSchema,
  discovered_at: reconciliationTimestampSchema,
  status: reconciliationStatusSchema,
  attempts: z.number().int().nonnegative(),
  last_error: z.string().nullable(),
  approved_at: reconciliationTimestampSchema.nullable(),
  completed_at: reconciliationTimestampSchema.nullable(),
})
const storageListItemSchema = z.object({
  id: z.string().nullable(),
  name: z.string().min(1),
  created_at: z.string().nullable(),
})
const storageItemNameSchema = z.object({ name: z.string().min(1) })
const storagePageSize = 1_000
const reconciliationListSelect = 'id, object_path, object_created_at, discovered_at, status, attempts, last_error, approved_at, completed_at'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface StorageOrphanReconciliationListItem {
  readonly id: string
  readonly objectPath: string
  readonly objectCreatedAt: string
  readonly discoveredAt: string
  readonly status: z.infer<typeof reconciliationStatusSchema>
  readonly attempts: number
  readonly error: string | null
  readonly approvedAt: string | null
  readonly completedAt: string | null
}

type AuthorizedReconciliationOperatorCheck =
  | { readonly authorized: true; readonly supabase: SupabaseServerClient }
  | { readonly authorized: false; readonly error: string }

type ReconciliationActionResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string }

type ReconciliationListResult =
  | { readonly success: true; readonly data: readonly StorageOrphanReconciliationListItem[] }
  | { readonly success: false; readonly error: string }

type ReconciliationApprovalResult =
  | { readonly success: true; readonly approved: boolean }
  | { readonly success: false; readonly error: string }

async function verificarOperadorReconciliacao(): Promise<AuthorizedReconciliationOperatorCheck> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { authorized: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' }

  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('funcao, ativo')
    .eq('id', user.id)
    .single()
  if (perfilError) return { authorized: false, error: 'PERFIL_NAO_ENCONTRADO' }

  const parsedPerfil = operatorProfileSchema.safeParse(perfil)
  if (!parsedPerfil.success) return { authorized: false, error: 'PERFIL_NAO_ENCONTRADO' }
  if (!parsedPerfil.data.ativo) return { authorized: false, error: 'PERFIL_INATIVO' }
  if (parsedPerfil.data.funcao !== 'admin' && parsedPerfil.data.funcao !== 'supervisor') {
    return { authorized: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
  }

  return { authorized: true, supabase }
}

function mapReconciliationListItem(
  row: z.infer<typeof reconciliationListRowSchema>,
): StorageOrphanReconciliationListItem {
  return {
    id: row.id,
    objectPath: row.object_path,
    objectCreatedAt: row.object_created_at,
    discoveredAt: row.discovered_at,
    status: row.status,
    attempts: row.attempts,
    error: row.last_error,
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
  }
}

export async function listarReconciliacoesImagemOrfa(): Promise<ReconciliationListResult> {
  const check = await verificarOperadorReconciliacao()
  if (!check.authorized) return { success: false, error: check.error }

  const { data, error } = await check.supabase
    .from('produto_imagem_orfao_reconciliacoes')
    .select(reconciliationListSelect)
    .order('discovered_at', { ascending: false })
    .order('object_path', { ascending: true })

  if (error || !data) return { success: false, error: 'LISTAGEM_RECONCILIACOES_INDISPONIVEL' }

  const parsedRows = reconciliationListRowSchema.array().safeParse(data)
  if (!parsedRows.success) return { success: false, error: 'LISTAGEM_RECONCILIACOES_INDISPONIVEL' }

  return { success: true, data: parsedRows.data.map(mapReconciliationListItem) }
}

export async function aprovarReconciliacaoImagemOrfa(reconciliationId: string): Promise<ReconciliationApprovalResult> {
  const parsedId = reconciliationIdSchema.safeParse(reconciliationId)
  if (!parsedId.success) return { success: false, error: 'RECONCILIACAO_INVALIDA' }

  const check = await verificarOperadorReconciliacao()
  if (!check.authorized) return { success: false, error: check.error }

  const { data, error } = await check.supabase.rpc('aprovar_reconciliacao_imagem_orfa', {
    p_reconciliacao_id: parsedId.data,
  })
  if (error) return { success: false, error: 'APROVACAO_RECONCILIACAO_INDISPONIVEL' }

  const parsedApproval = z.boolean().safeParse(data)
  if (!parsedApproval.success) return { success: false, error: 'APROVACAO_RECONCILIACAO_INDISPONIVEL' }

  return { success: true, approved: parsedApproval.data }
}

export async function executarReconciliacaoImagemOrfa(
  reconciliationId: string,
): Promise<ReconciliationActionResult> {
  const parsedId = reconciliationIdSchema.safeParse(reconciliationId)
  if (!parsedId.success) return { success: false, error: 'RECONCILIACAO_INVALIDA' }

  const check = await verificarOperadorReconciliacao()
  if (!check.authorized) return { success: false, error: check.error }

  return runStorageOrphanDeletionWorker(check.supabase, parsedId.data)
}

export async function varrerImagensOrfasEmModoDryRun(scanAt = new Date()): Promise<
  | { readonly success: true; readonly dryRun: true; readonly discovered: number; readonly recorded: number; readonly skipped: number }
  | { readonly success: false; readonly error: string }
> {
  if (!Number.isFinite(scanAt.getTime())) return { success: false, error: 'DATA_DE_VARREDURA_INVALIDA' }

  const check = await verificarOperadorReconciliacao()
  if (!check.authorized) return { success: false, error: check.error }

  const supabase = check.supabase

  const storage = supabase.storage.from('produto-imagens')
  const scanAtIso = scanAt.toISOString()
  let discovered = 0
  let recorded = 0
  let skipped = 0

  const scanPath = async (path: string): Promise<string | null> => {
    for (let offset = 0; ; offset += storagePageSize) {
      const { data, error } = await storage.list(path, {
        limit: storagePageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error || !data) return 'LISTAGEM_STORAGE_INDISPONIVEL'

      for (const rawItem of data) {
        const parsedItem = storageListItemSchema.safeParse(rawItem)
        if (!parsedItem.success) {
          const parsedName = storageItemNameSchema.safeParse(rawItem)
          if (parsedName.success) {
            const { error: reportError } = await supabase.rpc('registrar_relatorio_varredura_imagem_orfa', {
              p_object_path: `${path}/${parsedName.data.name}`,
              p_reason: 'INVALID_STORAGE_METADATA',
              p_scan_at: scanAtIso,
            })
            if (reportError) return 'RELATORIO_VARREDURA_INDISPONIVEL'
          }
          skipped += 1
          continue
        }

        const itemPath = `${path}/${parsedItem.data.name}`
        if (parsedItem.data.id === null) {
          const scanError = await scanPath(itemPath)
          if (scanError) return scanError
          continue
        }

        discovered += 1
        if (!parsedItem.data.created_at || !Number.isFinite(new Date(parsedItem.data.created_at).getTime())) {
          const { error: reportError } = await supabase.rpc('registrar_relatorio_varredura_imagem_orfa', {
            p_object_path: itemPath,
            p_reason: 'INVALID_TIMESTAMP',
            p_scan_at: scanAtIso,
          })
          if (reportError) return 'RELATORIO_VARREDURA_INDISPONIVEL'
          skipped += 1
          continue
        }

        const { error: recordError } = await supabase.rpc('registrar_reconciliacao_imagem_orfa', {
          p_object_path: itemPath,
          p_object_created_at: parsedItem.data.created_at,
          p_scan_at: scanAtIso,
        })
        if (recordError) return 'REGISTRO_RECONCILIACAO_INDISPONIVEL'
        recorded += 1
      }

      if (data.length < storagePageSize) return null
    }
  }

  const scanError = await scanPath('produtos')
  if (scanError) return { success: false, error: scanError }

  return { success: true, dryRun: true, discovered, recorded, skipped }
}
