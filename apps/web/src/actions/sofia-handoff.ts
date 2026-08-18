'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { SupabaseClient } from '@supabase/supabase-js'

export interface SilenciarSofiaInput {
  clienteId: string
  minutos?: number
  motivo?: string
  supabaseClient?: SupabaseClient
  usuarioId?: string
}

export interface ReativarSofiaInput {
  clienteId: string
  supabaseClient?: SupabaseClient
  usuarioId?: string
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient()
}

/**
 * Silencia ou pausa a IA Sofía para um cliente específico por um período de tempo (cooldown)
 */
export async function silenciarSofiaClienteAction(input: SilenciarSofiaInput) {
  const supabase = getSupabase(input.supabaseClient)
  const minutos = input.minutos ?? 60
  const motivo = input.motivo ?? 'cooldown_operador'

  try {
    const { data, error } = await supabase.rpc('silenciar_sofia_cliente', {
      p_cliente_id: input.clienteId,
      p_minutos: minutos,
      p_motivo: motivo,
      p_usuario_id: input.usuarioId || null,
    })

    if (error) {
      console.error('[Sofia Handoff Action] Erro ao silenciar Sofia:', error)
      return { sucesso: false, error: error.message, dormindo: true }
    }

    return { sucesso: true, data, dormindo: true }
  } catch (err: any) {
    console.error('[Sofia Handoff Action] Exceção ao silenciar Sofia:', err)
    return { sucesso: false, error: err.message || 'Erro inesperado', dormindo: true }
  }
}

/**
 * Reativa a IA Sofía para um cliente específico
 */
export async function reativarSofiaClienteAction(input: ReativarSofiaInput) {
  const supabase = getSupabase(input.supabaseClient)

  try {
    const { data, error } = await supabase.rpc('reativar_sofia_cliente', {
      p_cliente_id: input.clienteId,
      p_usuario_id: input.usuarioId || null,
    })

    if (error) {
      console.error('[Sofia Handoff Action] Erro ao reativar Sofia:', error)
      return { sucesso: false, error: error.message, dormindo: false }
    }

    return { sucesso: true, data, dormindo: false }
  } catch (err: any) {
    console.error('[Sofia Handoff Action] Exceção ao reativar Sofia:', err)
    return { sucesso: false, error: err.message || 'Erro inesperado', dormindo: false }
  }
}

/**
 * Obtém o status de silenciamento e cooldown da IA Sofía para um cliente
 */
export async function obterStatusSofiaClienteAction(
  clienteId: string,
  supabaseClient?: SupabaseClient
) {
  const supabase = getSupabase(supabaseClient)

  try {
    const { data: silenciada, error } = await supabase.rpc('verificar_sofia_silenciada', {
      p_cliente_id: clienteId,
    })

    if (error) {
      console.warn('[Sofia Handoff Action] Erro ao verificar silêncio:', error)
      return { silenciada: false }
    }

    return { silenciada: Boolean(silenciada) }
  } catch (err) {
    return { silenciada: false }
  }
}
