'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { processarRagPipeline } from '@/lib/ai/openrouter'
import { verificarHorarioAtendimento } from '@/lib/horarios/verificar'

/**
 * Server Action para acionar o pipeline de IA (RAG) de forma assíncrona.
 * Verifica se a conversa possui a flag `ia_ativa` como verdadeira e, se sim,
 * processa a resposta da IA.
 * 
 * @param conversaId ID da conversa ativa
 * @param conteudo Conteúdo da mensagem enviada pelo cliente
 */
export async function processarIaChat(conversaId: string, conteudo: string) {
  try {
    if (!conteudo) {
      return { success: false, error: 'CONTEUDO_VAZIO' }
    }

    const horario = await verificarHorarioAtendimento()
    if (!horario.dentro) {
      return { success: true, foraHorario: true, mensagem: horario.mensagem }
    }

    const supabaseAdmin = createAdminClient()

    // 1. Verificar se a conversa tem ia_ativa = true
    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from('conversas')
      .select('ia_ativa')
      .eq('id', conversaId)
      .single()

    if (conversaError || !conversa) {
      console.error(`[Server Action] Conversa ${conversaId} não encontrada ou erro ao buscar:`, conversaError)
      return { success: false, error: 'CONVERSA_NAO_ENCONTRADA' }
    }

    if (conversa.ia_ativa) {
      console.log(`[Server Action] IA ativa para conversa ${conversaId}. Iniciando pipeline RAG...`)
      // Executa o pipeline RAG
      await processarRagPipeline(conversaId, conteudo)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Erro na server action processarIaChat:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
