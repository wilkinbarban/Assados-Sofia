'use server'

import { z } from 'zod'
import { runStorageOrphanDeletionWorker } from '@/lib/storage-orphan-deletion-worker'
import { createClient } from '@/lib/supabase/server'

const reconciliationIdSchema = z.string().uuid()
const operatorProfileSchema = z.object({
  funcao: z.string(),
  ativo: z.boolean(),
})

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type ReconciliationActionResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string }

async function verificarOperadorReconciliacao(): Promise<
  | { readonly authorized: true; readonly supabase: SupabaseServerClient }
  | { readonly authorized: false; readonly error: string }
> {
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

export async function executarReconciliacaoImagemOrfa(
  reconciliationId: string,
): Promise<ReconciliationActionResult> {
  const parsedId = reconciliationIdSchema.safeParse(reconciliationId)
  if (!parsedId.success) return { success: false, error: 'RECONCILIACAO_INVALIDA' }

  const check = await verificarOperadorReconciliacao()
  if (!check.authorized) return { success: false, error: check.error }

  return runStorageOrphanDeletionWorker(check.supabase, parsedId.data)
}
