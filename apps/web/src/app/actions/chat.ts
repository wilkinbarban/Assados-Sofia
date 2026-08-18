'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processarRagPipeline } from '@/lib/ai/openrouter'
import { verificarHorarioAtendimento } from '@/lib/horarios/verificar'

/**
 * Server Action para acionar o pipeline de IA (RAG) de forma assíncrona.
 * Verifica se o chamador está autenticado e se a conversa pertence ao cliente ativo
 * antes de processar a resposta da IA.
 * 
 * @param conversaId ID da conversa ativa
 * @param conteudo Conteúdo da mensagem enviada pelo cliente
 */
export async function processarIaChat(conversaId: string, conteudo: string) {
  try {
    if (!conteudo) {
      return { success: false, error: 'CONTEUDO_VAZIO' }
    }

    const supabase = await createClient()

    // 1. Validar autenticação do usuário
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    // 2. Verificar horário de atendimento
    const horario = await verificarHorarioAtendimento()
    if (!horario.dentro) {
      return { success: true, foraHorario: true, mensagem: horario.mensagem }
    }

    const supabaseAdmin = createAdminClient()

    // 3. Buscar a conversa ativa
    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from('conversas')
      .select('ia_ativa, cliente_id')
      .eq('id', conversaId)
      .single()

    if (conversaError || !conversa) {
      console.error(`[Server Action] Conversa ${conversaId} não encontrada ou erro ao buscar:`, conversaError)
      return { success: false, error: 'CONVERSA_NAO_ENCONTRADA' }
    }

    // 4. Buscar perfil para validar permissões do usuário
    const { data: perfil } = await supabase
      .from('perfis')
      .select('funcao, ativo')
      .eq('id', user.id)
      .single()

    const ehOperador = perfil && perfil.ativo === true && ['admin', 'supervisor', 'vendedor'].includes(perfil.funcao)

    if (!ehOperador) {
      // Se não for operador, verificar se o cliente associado ao usuario_id é o dono da conversa
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .select('id')
        .eq('usuario_id', user.id)
        .single()

      if (clienteError || !cliente || conversa.cliente_id !== cliente.id) {
        return { success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
      }
    }

    // 5. Executar o pipeline RAG se a IA estiver ativa (com canal web explícito)
    if (conversa.ia_ativa) {
      console.log(`[Server Action] IA ativa para conversa ${conversaId}. Iniciando RAG para Web...`)
      await processarRagPipeline(conversaId, conteudo, 'web')
    }

    return { success: true }
  } catch (error: any) {
    console.error('Erro na server action processarIaChat:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
