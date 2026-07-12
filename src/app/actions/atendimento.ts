'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarMensagemWhatsapp } from '@/lib/whatsapp/send'
import { enviarMensagemTelegram } from '@/lib/telegram/send'
import { getWhatsAppSofiaState, setWhatsAppSofiaSleep } from '@/lib/whatsapp/sofia-control'
import { getLlmCreditStatus } from '@/lib/ai/credits'
import { verificarHorarioAtendimento } from '@/lib/horarios/verificar'
import {
  deriveSofiaChannelAvailability,
  type SofiaChannelAvailability,
  type SofiaGlobalChannel,
  obterConfiguracaoSistema,
  obterSofiaGlobalStatusConfig,
  salvarSofiaGlobalChannelConfig,
} from '@/lib/config/sistema'

const FUNCOES_OPERADOR_AUTORIZADAS = ['admin', 'supervisor', 'vendedor']
const FUNCOES_SOFIA_GLOBAL_GESTAO = ['admin', 'supervisor']

export type { SofiaChannelAvailability } from '@/lib/config/sistema'

export type SofiaAtendimentoStatus = {
  channels: Record<SofiaGlobalChannel, {
    enabled: boolean
    key: string
    availability: SofiaChannelAvailability
  }>
  credits: Awaited<ReturnType<typeof getLlmCreditStatus>>
  runtime: {
    provider: Awaited<ReturnType<typeof getLlmCreditStatus>>['provider']
    model: string | null
  }
  permissions: {
    canToggleGlobalSofia: boolean
  }
  schedule: {
    withinBusinessHours: boolean
    message: string | null
  }
}

type AuthorizedOperatorCheck =
  | { authorized: true; supabase: Awaited<ReturnType<typeof createClient>>; user: { id: string }; perfil: { funcao: string; ativo: boolean } }
  | { authorized: false; error: string }

async function verificarOperadorAutorizado(): Promise<AuthorizedOperatorCheck> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { authorized: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' }
  }

  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('funcao, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil) {
    return { authorized: false, error: 'PERFIL_NAO_ENCONTRADO' }
  }

  if (!perfil.ativo) {
    return { authorized: false, error: 'PERFIL_INATIVO' }
  }

  if (!FUNCOES_OPERADOR_AUTORIZADAS.includes(perfil.funcao)) {
    return { authorized: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
  }

  return { authorized: true, supabase, user: { id: user.id }, perfil }
}



function podeGerenciarSofiaGlobal(funcao: string): boolean {
  return FUNCOES_SOFIA_GLOBAL_GESTAO.includes(funcao)
}

export async function obterStatusSofiaAtendimento() {
  try {
    const check = await verificarOperadorAutorizado()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const [globalConfig, credits, horario, model] = await Promise.all([
      obterSofiaGlobalStatusConfig(),
      getLlmCreditStatus(),
      verificarHorarioAtendimento(),
      obterConfiguracaoSistema('OPENROUTER_MODEL'),
    ])

    const data: SofiaAtendimentoStatus = {
      channels: {
        whatsapp: {
          enabled: globalConfig.whatsapp.enabled,
          key: globalConfig.whatsapp.key,
          availability: deriveSofiaChannelAvailability(globalConfig.whatsapp.enabled, horario.dentro),
        },
        telegram: {
          enabled: globalConfig.telegram.enabled,
          key: globalConfig.telegram.key,
          availability: deriveSofiaChannelAvailability(globalConfig.telegram.enabled, horario.dentro),
        },
      },
      credits,
      runtime: {
        provider: credits.provider,
        model: model?.trim() || null,
      },
      permissions: {
        canToggleGlobalSofia: podeGerenciarSofiaGlobal(check.perfil.funcao),
      },
      schedule: {
        withinBusinessHours: horario.dentro,
        message: horario.mensagem ?? null,
      },
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action obterStatusSofiaAtendimento:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function alternarSofiaGlobal(channel: SofiaGlobalChannel, enabled: boolean) {
  try {
    if (channel !== 'whatsapp' && channel !== 'telegram') {
      return { success: false, error: 'CANAL_INVALIDO' }
    }

    if (typeof enabled !== 'boolean') {
      return { success: false, error: 'VALOR_INVALIDO' }
    }

    const check = await verificarOperadorAutorizado()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    if (!podeGerenciarSofiaGlobal(check.perfil.funcao)) {
      return { success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
    }

    const config = await salvarSofiaGlobalChannelConfig(channel, enabled)
    const adminSupabase = createAdminClient()

    const { error: logError } = await adminSupabase
      .from('logs_auditoria')
      .insert({
        usuario_id: check.user.id,
        acao: 'alternar_sofia_global',
        detalhes: {
          canal: channel,
          chave: config.key,
          estado_atual: config.enabled,
        },
      })

    if (logError) {
      console.warn('Erro ao registrar log de auditoria para alternar_sofia_global:', logError.message)
    }

    revalidatePath('/atendimento')

    return { success: true, data: config }
  } catch (error: any) {
    console.error('Erro na action alternarSofiaGlobal:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
/**
 * Server Action para alternar o estado da IA em uma conversa.
 * Valida a sessão do usuário ativo, se a função do perfil é 'admin', 'supervisor' ou 'vendedor' e se o perfil está ativo.
 * Atualiza ia_ativa e o status da conversa.
 */
export async function alternarIaConversa(conversaId: string, iaAtiva: boolean) {
  try {
    const supabase = await createClient()

    // 1. Obter usuário autenticado da sessão
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    // 2. Buscar o perfil do usuário e validar suas permissões e status
    const { data: perfil, error: perfilError } = await supabase
      .from('perfis')
      .select('funcao, ativo')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return { success: false, error: 'PERFIL_NAO_ENCONTRADO' }
    }

    if (!perfil.ativo) {
      return { success: false, error: 'PERFIL_INATIVO' }
    }

    const funcoesAutorizadas = ['admin', 'supervisor', 'vendedor']
    if (!funcoesAutorizadas.includes(perfil.funcao)) {
      return { success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
    }

    // 3. Definir o novo status com base no estado da IA
    const status = iaAtiva ? 'ia_atendendo' : 'aberta'

    // 4. Atualizar a conversa no banco usando as credenciais do operador
    const { error: updateError } = await supabase
      .from('conversas')
      .update({
        ia_ativa: iaAtiva,
        status: status,
        data_atualizacao: new Date().toISOString()
      })
      .eq('id', conversaId)

    if (updateError) {
      return { success: false, error: `ERRO_ATUALIZACAO: ${updateError.message}` }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Erro na action alternarIaConversa:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}


/**
 * Server Action para alternar o estado de sono da Sofía para WhatsApp.
 * Mantém o controle durável por cliente/canal e registra auditoria operacional.
 */
export async function alternarSofiaWhatsApp(clienteId: string, dormir: boolean, conversaId?: string | null) {
  try {
    if (!clienteId) {
      return { success: false, error: 'CLIENTE_INVALIDO' }
    }

    const check = await verificarOperadorAutorizado()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const adminSupabase = createAdminClient()

    let conversaAnterior: { status: string; ia_ativa: boolean } | null = null

    if (conversaId) {
      const { data: conversa, error: conversaError } = await adminSupabase
        .from('conversas')
        .select('id, cliente_id, status, ia_ativa')
        .eq('id', conversaId)
        .single()

      if (conversaError || !conversa) {
        return { success: false, error: 'CONVERSA_NAO_ENCONTRADA' }
      }

      if ((conversa as any).cliente_id !== clienteId) {
        return { success: false, error: 'CONVERSA_CLIENTE_DIVERGENTE' }
      }

      conversaAnterior = {
        status: (conversa as any).status,
        ia_ativa: Boolean((conversa as any).ia_ativa),
      }
    }

    const estadoAnterior = await getWhatsAppSofiaState({ supabase: adminSupabase, clienteId })
    const state = await setWhatsAppSofiaSleep({
      supabase: adminSupabase,
      clienteId,
      sleeping: dormir,
      reason: 'manual',
      source: 'operator',
      actorUserId: check.user.id,
    })

    if (dormir && conversaId) {
      const { error: conversaUpdateError } = await adminSupabase
        .from('conversas')
        .update({
          ia_ativa: false,
          status: 'aberta',
          data_atualizacao: new Date().toISOString(),
        })
        .eq('id', conversaId)

      if (conversaUpdateError) {
        return { success: false, error: `ERRO_ATUALIZACAO_CONVERSA: ${conversaUpdateError.message}` }
      }
    }

    const { error: logError } = await adminSupabase
      .from('logs_auditoria')
      .insert({
        usuario_id: check.user.id,
        acao: dormir ? 'sofia_whatsapp_dormir' : 'sofia_whatsapp_acordar',
        detalhes: {
          cliente_id: clienteId,
          conversa_id: conversaId ?? null,
          canal: 'whatsapp',
          origem: 'operator',
          motivo: 'manual',
          estado_anterior: estadoAnterior?.sleeping ?? null,
          estado_atual: state.sleeping,
        },
      })

    if (logError) {
      if (estadoAnterior) {
        await adminSupabase
          .from('whatsapp_sofia_states')
          .upsert(
            {
              cliente_id: clienteId,
              canal: 'whatsapp',
              sofia_dormindo: estadoAnterior.sleeping,
              motivo: estadoAnterior.reason,
              origem: estadoAnterior.source,
              alterado_por: estadoAnterior.actorUserId,
            },
            { onConflict: 'cliente_id,canal' }
          )
      } else {
        await adminSupabase
          .from('whatsapp_sofia_states')
          .delete()
          .eq('cliente_id', clienteId)
          .eq('canal', 'whatsapp')
      }

      if (dormir && conversaId && conversaAnterior) {
        await adminSupabase
          .from('conversas')
          .update({
            ia_ativa: conversaAnterior.ia_ativa,
            status: conversaAnterior.status,
            data_atualizacao: new Date().toISOString(),
          })
          .eq('id', conversaId)
      }

      return { success: false, error: `ERRO_AUDITORIA_OBRIGATORIA: ${logError.message}` }
    }

    revalidatePath('/atendimento')

    return { success: true, state }
  } catch (error: any) {
    console.error('Erro na action alternarSofiaWhatsApp:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action para enviar uma mensagem como operador.
 * Valida a sessão e permissões. Envia via WhatsApp se for número de Curitiba, senão realiza insert direto na tabela mensagens.
 */
export async function enviarMensagemOperador(conversaId: string, texto: string) {
  try {
    const supabase = await createClient()

    // 1. Obter usuário autenticado da sessão
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    // 2. Buscar o perfil do usuário e validar suas permissões e status
    const { data: perfil, error: perfilError } = await supabase
      .from('perfis')
      .select('funcao, ativo')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return { success: false, error: 'PERFIL_NAO_ENCONTRADO' }
    }

    if (!perfil.ativo) {
      return { success: false, error: 'PERFIL_INATIVO' }
    }

    const funcoesAutorizadas = ['admin', 'supervisor', 'vendedor']
    if (!funcoesAutorizadas.includes(perfil.funcao)) {
      return { success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
    }

    // 3. Buscar a conversa e os dados do cliente associado
    const { data: conversa, error: conversaError } = await supabase
      .from('conversas')
      .select('id, status, cliente_id, clientes (telefone, telegram_chat_id)')
      .eq('id', conversaId)
      .single()

    if (conversaError || !conversa) {
      return { success: false, error: 'CONVERSA_NAO_ENCONTRADA' }
    }

    const telegramChatId = (conversa as any).clientes?.telegram_chat_id
    if (telegramChatId) {
      try {
        const telegramResult = await enviarMensagemTelegram(conversaId, { texto, remetente: 'operador' })

        // Atualiza a data de atualização da conversa
        await supabase
          .from('conversas')
          .update({ data_atualizacao: new Date().toISOString() })
          .eq('id', conversaId)

        return { success: true, mensagem: telegramResult.mensagem }
      } catch (err: any) {
        return { success: false, error: err?.message || 'ERRO_TELEGRAM' }
      }
    }

    const telefone = (conversa as any).clientes?.telefone
    const regexCuritiba = /^55419[0-9]{8}$/
    const possuiTelefoneCuritiba = typeof telefone === 'string' && regexCuritiba.test(telefone)

    if (possuiTelefoneCuritiba) {
      // 4. Se o cliente possui telefone de Curitiba válido, chama o utilitário de WhatsApp
      try {
        await enviarMensagemWhatsapp(conversaId, { texto, remetente: 'operador' })
        
        // Atualiza a data de atualização da conversa
        await supabase
          .from('conversas')
          .update({ data_atualizacao: new Date().toISOString() })
          .eq('id', conversaId)

        return { success: true }
      } catch (err: any) {
        const msgError = err?.message || ''
        if (
          msgError.includes('Janela de 24 horas excedida') ||
          msgError.includes('24 horas')
        ) {
          return { success: false, error: 'JANELA_24H_EXCEDIDA' }
        }
        return { success: false, error: msgError || 'ERRO_WHATSAPP' }
      }
    } else {
      // 5. Se for cliente exclusivo da Web, faz insert direto na tabela mensagens usando o cliente do operador
      const { data: novaMensagem, error: insertError } = await supabase
        .from('mensagens')
        .insert({
          conversa_id: conversaId,
          remetente: 'operador',
          conteudo: texto,
          url_anexo: null
        })
        .select()
        .single()

      if (insertError) {
        return { success: false, error: `ERRO_INSERT_MENSAGEM: ${insertError.message}` }
      }

      // Atualiza data de atualização da conversa
      await supabase
        .from('conversas')
        .update({ data_atualizacao: new Date().toISOString() })
        .eq('id', conversaId)

      return { success: true, mensagem: novaMensagem }
    }
  } catch (error: any) {
    console.error('Erro na action enviarMensagemOperador:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
