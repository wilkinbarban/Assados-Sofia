'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { google } from 'googleapis'
import {
  getEvolutionConnectionState,
  getEvolutionQrCode,
} from '@/lib/whatsapp/evolution-admin-client'
import { revalidatePath } from 'next/cache'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'

/**
 * Helper para validar se o usuário atual está autenticado, ativo
 * e se possui papel de 'admin' ou 'supervisor'.
 */
async function verificarPermissaoOperador() {
  const supabase = await createClient()

  // 1. Obter usuário autenticado da sessão
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { authorized: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO', supabase }
  }

  // 2. Buscar o perfil do usuário e validar suas permissões e status
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('funcao, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil) {
    return { authorized: false, error: 'PERFIL_NAO_ENCONTRADO', supabase }
  }

  if (!perfil.ativo) {
    return { authorized: false, error: 'PERFIL_INATIVO', supabase }
  }

  const funcoesAutorizadas = ['admin', 'supervisor']
  if (!funcoesAutorizadas.includes(perfil.funcao)) {
    return { authorized: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE', supabase }
  }

  return { authorized: true, user, supabase }
}

/**
 * Server Action 2.2: listarUsuariosAdmin
 * Consolida a lista de usuários do Auth com seus respectivos perfis e-mail/função na tabela perfis.
 */
export async function listarUsuariosAdmin() {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const adminSupabase = createAdminClient()
    const { data: authData, error: authError } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    })

    if (authError || !authData?.users) {
      return { success: false, error: `ERRO_AUTH_ADMIN: ${authError?.message || 'Falha ao buscar usuários'}` }
    }

    const { data: perfis, error: perfisError } = await adminSupabase
      .from('perfis')
      .select('*')
      .order('data_criacao', { ascending: false })

    if (perfisError || !perfis) {
      return { success: false, error: `ERRO_PERFIS: ${perfisError?.message || 'Falha ao buscar perfis'}` }
    }

    const consolidated = perfis.map((perfil) => {
      const authUser = authData.users.find((u) => u.id === perfil.id)
      return {
        ...perfil,
        email: authUser?.email || null,
      }
    })

    return { success: true, data: consolidated }
  } catch (error: any) {
    console.error('Erro na action listarUsuariosAdmin:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action 2.3 & 2.4: atualizarPerfilUsuario
 * Atualiza a função e status ativo de um usuário, com proteção contra lockout
 * e garantindo no mínimo um administrador ativo. Escreve no log de auditoria.
 */
export async function atualizarPerfilUsuario(usuarioAlvoId: string, funcao: string, ativo: boolean) {
  try {
    const funcoesValidas = ['admin', 'supervisor', 'vendedor', 'cliente']
    if (!funcoesValidas.includes(funcao)) {
      return { success: false, error: 'FUNCAO_INVALIDA' }
    }
    const supabase = await createClient()
    const { error } = await supabase.rpc('gerenciar_funcao_status_perfil', {
      p_usuario_alvo_id: usuarioAlvoId, p_funcao: funcao, p_ativo: ativo,
    })
    if (error) return { success: false, error: error.message }

    revalidatePath('/atendimento/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na action atualizarPerfilUsuario:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action 2.5: testarGoogleCalendar
 * Realiza o agendamento de um evento de teste de 15 minutos e registra o resultado em logs_auditoria.
 */
export async function testarGoogleCalendar(
  customCalendarId?: string,
  customClientEmail?: string,
  customPrivateKey?: string
) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const { user } = check

    const clientEmail = customClientEmail || await obterConfiguracaoSistema('GOOGLE_CLIENT_EMAIL')
    const privateKey = customPrivateKey || await obterConfiguracaoSistema('GOOGLE_PRIVATE_KEY')
    const calendarId = customCalendarId || await obterConfiguracaoSistema('GOOGLE_CALENDAR_ID')

    const isMockMode =
      !clientEmail ||
      !privateKey ||
      !calendarId ||
      clientEmail.includes('placeholder') ||
      privateKey.includes('placeholder') ||
      calendarId.includes('placeholder')

    let eventId = null
    let sucesso = false
    let erroMensagem = null

    if (isMockMode) {
      console.warn('[Google Calendar Test] Servidor rodando em modo MOCK. Credenciais de calendário ausentes ou placeholders.')
      // Simular latência de rede (200ms)
      await new Promise((resolve) => setTimeout(resolve, 200))
      eventId = `mock-test-event-${Date.now()}`
      sucesso = true
    } else {
      try {
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey!.replace(/\\n/g, '\n'),
          scopes: ['https://www.googleapis.com/auth/calendar'],
        })

        const calendar = google.calendar({ version: 'v3', auth })

        const start = new Date()
        const end = new Date(start.getTime() + 15 * 60 * 1000) // 15 minutos
        const timestamp = start.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

        const response = await calendar.events.insert({
          calendarId: calendarId,
          requestBody: {
            summary: `[TESTE] Conexão Asados - ${timestamp}`,
            description: 'Evento de teste para validar a integração com o Google Calendar.',
            start: {
              dateTime: start.toISOString(),
              timeZone: 'America/Sao_Paulo',
            },
            end: {
              dateTime: end.toISOString(),
              timeZone: 'America/Sao_Paulo',
            },
          },
        })

        eventId = response.data.id || 'sem_id'
        sucesso = true
      } catch (err: any) {
        console.error('[Google Calendar Test] Erro ao agendar evento:', err)
        erroMensagem = err.message || 'Falha técnica ao integrar com a API do Google Calendar'
      }
    }

    // Inserir log de auditoria
    const adminSupabase = createAdminClient()
    const { error: logError } = await adminSupabase
      .from('logs_auditoria')
      .insert({
        usuario_id: user.id,
        acao: 'teste_calendario',
        detalhes: {
          sucesso,
          mock: isMockMode,
          eventId,
          erro: erroMensagem,
          calendarId: calendarId || null,
        },
      })

    if (logError) {
      console.error('Erro ao registrar log de teste de calendário:', logError)
    }

    if (!sucesso) {
      return { success: false, error: erroMensagem || 'FALHA_CONEXAO' }
    }

    return { success: true, data: { eventId, mock: isMockMode } }
  } catch (error: any) {
    console.error('Erro na action testarGoogleCalendar:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action 2.6: obterEstatisticasMensagens
 * Busca a contagem total de mensagens filtradas por remetente e computa a taxa percentual de automação.
 */
export async function obterEstatisticasMensagens() {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    // Consultas separadas com head: true para obter contagens de forma performática
    const [resIa, resOperador, resCliente] = await Promise.all([
      supabase.from('mensagens').select('*', { count: 'exact', head: true }).eq('remetente', 'ia'),
      supabase.from('mensagens').select('*', { count: 'exact', head: true }).eq('remetente', 'operador'),
      supabase.from('mensagens').select('*', { count: 'exact', head: true }).eq('remetente', 'cliente'),
    ])

    if (resIa.error || resOperador.error || resCliente.error) {
      console.error('Erro ao buscar estatísticas de mensagens:', {
        ia: resIa.error,
        operador: resOperador.error,
        cliente: resCliente.error,
      })
      return {
        success: false,
        error: `ERRO_METRICAS: ${resIa.error?.message || resOperador.error?.message || resCliente.error?.message || 'Falha nas consultas'}`,
      }
    }

    const ia = resIa.count || 0
    const operador = resOperador.count || 0
    const cliente = resCliente.count || 0
    const total = ia + operador + cliente

    const totalRespostas = ia + operador
    const taxaAutomacao = totalRespostas > 0 ? (ia / totalRespostas) * 100 : 0

    return {
      success: true,
      data: {
        totalIa: ia,
        totalOperador: operador,
        totalCliente: cliente,
        totalMensagens: total,
        taxaAutomacao: parseFloat(taxaAutomacao.toFixed(2)),
      },
    }
  } catch (error: any) {
    console.error('Erro na action obterEstatisticasMensagens:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: obterLogsAuditoria
 * Busca os logs de auditoria mais recentes (limite padrão 100).
 */
export async function obterLogsAuditoria(limite: number = 100) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    const { data: logs, error: logsError } = await supabase
      .from('logs_auditoria')
      .select('*')
      .order('data_criacao', { ascending: false })
      .limit(limite)

    if (logsError) {
      console.error('Erro ao buscar logs de auditoria:', logsError)
      return { success: false, error: `ERRO_LOGS: ${logsError.message}` }
    }

    return { success: true, data: logs }
  } catch (error: any) {
    console.error('Erro na action obterLogsAuditoria:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: salvarConfiguracaoAdmin
 * Salva/upsert uma chave de configuração do sistema e gera log de auditoria.
 */
export async function salvarConfiguracaoAdmin(chave: string, valor: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const adminSupabase = createAdminClient()
    const ehSegredo = chave.toUpperCase().includes('_KEY') || chave.toUpperCase().includes('_TOKEN')

    const { error: upsertError } = await adminSupabase
      .from('configuracoes_sistema')
      .upsert({
        chave,
        valor,
        eh_segredo: ehSegredo,
        data_atualizacao: new Date().toISOString()
      }, { onConflict: 'chave' })

    if (upsertError) {
      console.error('Erro ao salvar configuração do sistema:', upsertError)
      return { success: false, error: `ERRO_SALVAR_CONFIG: ${upsertError.message}` }
    }

    const valorMascarado = ehSegredo
      ? (valor.length > 4 ? valor.substring(0, 4) + '***' : '***')
      : valor

    const { error: logError } = await adminSupabase.from('logs_auditoria').insert({
      usuario_id: check.user.id,
      acao: 'salvar_configuracao',
      detalhes: {
        chave,
        valor: valorMascarado
      }
    })

    if (logError) {
      console.warn('Erro ao registrar log de auditoria para salvar_configuracao:', logError.message)
    }

    revalidatePath('/atendimento/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na action salvarConfiguracaoAdmin:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action 2.1: deletarUsuarioAdmin
 * Realiza a remoção lógica e física completa de todos os dados gerados por um usuário (cliente ou operador),
 * garantindo lockout guards e no mínimo um administrador ativo. Escreve no log de auditoria.
 */
export async function deletarUsuarioAdmin(usuarioAlvoId: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const { user } = check
    const callerId = user.id

    // 1. Impedir auto-exclusão
    if (usuarioAlvoId === callerId) {
      return { success: false, error: 'ANTI_LOCKOUT_AUTO_EXCLUSAO' }
    }

    const adminSupabase = createAdminClient()

    // 2. Buscar dados do perfil alvo
    const { data: perfilAlvo, error: errorPerfil } = await adminSupabase
      .from('perfis')
      .select('nome, funcao, ativo')
      .eq('id', usuarioAlvoId)
      .single()

    if (errorPerfil || !perfilAlvo) {
      return { success: false, error: 'PERFIL_ALVO_NAO_ENCONTRADO' }
    }

    // 3. Garantir mínimo de um admin ativo
    if (perfilAlvo.funcao === 'admin' && perfilAlvo.ativo) {
      const { count, error: countError } = await adminSupabase
        .from('perfis')
        .select('*', { count: 'exact', head: true })
        .eq('funcao', 'admin')
        .eq('ativo', true)
        .neq('id', usuarioAlvoId)

      if (countError) {
        return { success: false, error: `ERRO_VALIDACAO_ADMIN: ${countError.message}` }
      }

      if (!count || count < 1) {
        return { success: false, error: 'MINIMO_UM_ADMIN_ATIVO' }
      }
    }

    // 4. Deleção manual em cascata
    const { data: cliente, error: errCliente } = await adminSupabase
      .from('clientes')
      .select('id')
      .eq('usuario_id', usuarioAlvoId)
      .maybeSingle()

    if (errCliente) {
      return { success: false, error: `ERRO_BUSCA_CLIENTE: ${errCliente.message}` }
    }

    if (cliente) {
      const clienteId = cliente.id

      // 4.1. Buscar pedidos do cliente
      const { data: pedidos, error: errPedidos } = await adminSupabase
        .from('pedidos')
        .select('id')
        .eq('cliente_id', clienteId)

      if (errPedidos) {
        return { success: false, error: `ERRO_BUSCA_PEDIDOS: ${errPedidos.message}` }
      }

      const pedidoIds = (pedidos || []).map((p: any) => p.id)

      if (pedidoIds.length > 0) {
        // Excluir itens dos pedidos
        const { error: errItens } = await adminSupabase
          .from('itens_pedido')
          .delete()
          .in('pedido_id', pedidoIds)

        if (errItens) {
          return { success: false, error: `ERRO_EXCLUIR_ITENS_PEDIDO: ${errItens.message}` }
        }

        // Excluir pedidos
        const { error: errDelPedidos } = await adminSupabase
          .from('pedidos')
          .delete()
          .eq('cliente_id', clienteId)

        if (errDelPedidos) {
          return { success: false, error: `ERRO_EXCLUIR_PEDIDOS: ${errDelPedidos.message}` }
        }
      }

      // 4.2. Buscar conversas
      const { data: conversas, error: errConversas } = await adminSupabase
        .from('conversas')
        .select('id')
        .eq('cliente_id', clienteId)

      if (errConversas) {
        return { success: false, error: `ERRO_BUSCA_CONVERSAS: ${errConversas.message}` }
      }

      const conversaIds = (conversas || []).map((c: any) => c.id)

      if (conversaIds.length > 0) {
        // Excluir mensagens das conversas
        const { error: errMensagens } = await adminSupabase
          .from('mensagens')
          .delete()
          .in('conversa_id', conversaIds)

        if (errMensagens) {
          return { success: false, error: `ERRO_EXCLUIR_MENSAGENS: ${errMensagens.message}` }
        }

        // Excluir conversas
        const { error: errDelConversas } = await adminSupabase
          .from('conversas')
          .delete()
          .eq('cliente_id', clienteId)

        if (errDelConversas) {
          return { success: false, error: `ERRO_EXCLUIR_CONVERSAS: ${errDelConversas.message}` }
        }
      }

      // 4.3. Excluir perfil de cliente
      const { error: errDelCliente } = await adminSupabase
        .from('clientes')
        .delete()
        .eq('id', clienteId)

      if (errDelCliente) {
        return { success: false, error: `ERRO_EXCLUIR_CLIENTE: ${errDelCliente.message}` }
      }
    }

    // 5. Excluir perfil de public.perfis
    const { error: errDelPerfil } = await adminSupabase
      .from('perfis')
      .delete()
      .eq('id', usuarioAlvoId)

    if (errDelPerfil) {
      return { success: false, error: `ERRO_EXCLUIR_PERFIL: ${errDelPerfil.message}` }
    }

    // 6. Excluir do Supabase Auth
    const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(usuarioAlvoId)
    if (authDeleteError) {
      return { success: false, error: `ERRO_AUTH_DELETE: ${authDeleteError.message}` }
    }

    // 7. Inserir log de auditoria com a ação 'excluir_usuario'
    const { error: logError } = await adminSupabase.from('logs_auditoria').insert({
      usuario_id: callerId,
      acao: 'excluir_usuario',
      detalhes: {
        usuario_alvo_id: usuarioAlvoId,
        funcao: perfilAlvo.funcao
      }
    })

    if (logError) {
      console.warn('Erro ao registrar log de auditoria para excluir_usuario:', logError.message)
    }

    revalidatePath('/atendimento/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na Server Action deletarUsuarioAdmin:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: obterModelosDisponiveis
 * Busca dinamicamente os modelos disponíveis em OpenRouter ou DeepSeek de acordo com a API Key informada.
 */
export async function obterModelosDisponiveis(apiKey: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    if (!apiKey || apiKey.trim() === '' || apiKey.toLowerCase().includes('placeholder') || apiKey.toLowerCase().includes('insert_here')) {
      return {
        success: true,
        models: [
          { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash' },
          { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
          { id: 'deepseek/deepseek-chat', name: 'DeepSeek: DeepSeek Chat' },
          { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70b Instruct' }
        ]
      }
    }

    const isDeepSeek = !apiKey.includes('sk-or-') && apiKey.startsWith('sk-')

    if (isDeepSeek) {
      return {
        success: true,
        models: [
          { id: 'deepseek-chat', name: 'DeepSeek Chat (v3)' },
          { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' }
        ]
      }
    } else {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        })
        if (response.ok) {
          const json = await response.json()
          if (json && Array.isArray(json.data)) {
            const modelsList = json.data.map((m: any) => ({
              id: m.id,
              name: m.name || m.id
            }))
            return { success: true, models: modelsList }
          }
        }
        throw new Error(`Resposta HTTP ${response.status}: ${response.statusText}`)
      } catch (err: any) {
        console.warn('Erro ao buscar modelos do OpenRouter, retornando fallback estático:', err.message)
        return {
          success: true,
          models: [
            { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash' },
            { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
            { id: 'deepseek/deepseek-chat', name: 'DeepSeek: DeepSeek Chat' },
            { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70b Instruct' },
            { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72b Instruct' }
          ]
        }
      }
    }
  } catch (error: any) {
    console.error('Erro na action obterModelosDisponiveis:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: testarConexaoLLM
 * Executa uma chamada simples (1 palavra) para testar a validade da API Key e do modelo informados.
 */
export async function testarConexaoLLM(apiKey: string, model: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    if (!apiKey || apiKey.trim() === '' || apiKey.toLowerCase().includes('placeholder') || apiKey.toLowerCase().includes('insert_here')) {
      return { success: false, error: 'A API Key não pode estar vazia ou conter placeholder para o teste.' }
    }

    const isDeepSeek = !apiKey.includes('sk-or-') && apiKey.startsWith('sk-')
    const apiUrl = isDeepSeek
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions'

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }

    if (!isDeepSeek) {
      headers['HTTP-Referer'] = 'https://github.com/wilkin/proyectos/Asados'
      headers['X-Title'] = 'Sofia CRM Asados Test'
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || (isDeepSeek ? 'deepseek-chat' : 'google/gemini-2.5-flash'),
        messages: [
          { role: 'user', content: 'responda apenas com a palavra OK' }
        ],
        max_tokens: 5,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status} - ${text || response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''

    // Criar entrada no log de auditoria
    const adminSupabase = createAdminClient()
    const keyMasked = apiKey.length > 4 ? apiKey.substring(0, 4) + '***' : '***'
    await adminSupabase.from('logs_auditoria').insert({
      usuario_id: check.user.id,
      acao: 'teste_llm',
      detalhes: {
        modelo: model,
        chave: keyMasked,
        resposta: content
      }
    })

    return { success: true, response: content }
  } catch (error: any) {
    console.error('Erro na action testarConexaoLLM:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: testarConexaoOmniRoute
 * Testa a conexão e resolução do OmniRoute Gateway com um combo/tier específico.
 */
export async function testarConexaoOmniRoute(baseUrl: string, apiKey: string, modelOrTier: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const host = (baseUrl && baseUrl.trim()) || process.env.OMNIROUTE_BASE_URL || 'http://127.0.0.1:20128'
    const key = (apiKey && apiKey.trim()) || process.env.OMNIROUTE_API_KEY || ''
    const targetModel = modelOrTier || 'business-economy'

    if (!key || key.toLowerCase().includes('placeholder')) {
      return { success: false, error: 'API Key do OmniRoute não informada ou inválida.' }
    }

    const url = `${host.replace(/\/+$/, '')}/v1/chat/completions`
    const inicio = Date.now()

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: 'system', content: 'Você é a Sofía da Casa de Assados.' },
          { role: 'user', content: 'responda apenas com a palavra OK' }
        ],
        max_tokens: 10,
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(10000)
    })

    const latenciaMs = Date.now() - inicio

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status} - ${text || response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    const modelResolved = data.model || targetModel

    const adminSupabase = createAdminClient()
    const keyMasked = key.length > 8 ? key.substring(0, 8) + '***' : '***'
    await adminSupabase.from('logs_auditoria').insert({
      usuario_id: check.user.id,
      acao: 'teste_omniroute',
      detalhes: {
        tier_solicitado: targetModel,
        modelo_resolvido: modelResolved,
        chave: keyMasked,
        latencia_ms: latenciaMs,
        resposta: content
      }
    })

    return {
      success: true,
      response: content,
      modelResolved,
      latencyMs: latenciaMs
    }
  } catch (error: any) {
    console.error('Erro na action testarConexaoOmniRoute:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: obterCombosOmniRoute
 * Busca a lista de modelos e combos disponíveis no OmniRoute Gateway.
 */
export async function obterCombosOmniRoute(baseUrl: string, apiKey: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const host = (baseUrl && baseUrl.trim()) || process.env.OMNIROUTE_BASE_URL || 'http://127.0.0.1:20128'
    const key = (apiKey && apiKey.trim()) || process.env.OMNIROUTE_API_KEY || ''

    if (!key || key.toLowerCase().includes('placeholder')) {
      return {
        success: true,
        combos: [
          { id: 'business-economy', name: '🟢 business-economy (FAQs & Cardápio)' },
          { id: 'business-smart', name: '🟡 business-smart (Consultivo & Objeções)' },
          { id: 'business-frontier', name: '🔴 business-frontier (Eventos & Corporativo)' }
        ]
      }
    }

    const url = `${host.replace(/\/+$/, '')}/v1/models`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const json = await response.json()
    const allModels: string[] = Array.isArray(json.data) ? json.data.map((m: any) => m.id) : []

    return {
      success: true,
      combos: [
        { id: 'business-economy', name: '🟢 business-economy (FAQs & Cardápio)' },
        { id: 'business-smart', name: '🟡 business-smart (Consultivo & Objeções)' },
        { id: 'business-frontier', name: '🔴 business-frontier (Eventos & Corporativo)' }
      ],
      totalModels: allModels.length
    }
  } catch (error: any) {
    console.error('Erro na action obterCombosOmniRoute:', error)
    return {
      success: true,
      combos: [
        { id: 'business-economy', name: '🟢 business-economy (FAQs & Cardápio)' },
        { id: 'business-smart', name: '🟡 business-smart (Consultivo & Objeções)' },
        { id: 'business-frontier', name: '🔴 business-frontier (Eventos & Corporativo)' }
      ]
    }
  }
}

/**
 * Server Action: testarConexaoMeta
 * Verifica a validade do Token de Acesso e do Phone Number ID chamando a Graph API da Meta.
 */
export async function testarConexaoMeta(accessToken: string, phoneNumberId: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    if (!accessToken || accessToken.trim() === '' || !phoneNumberId || phoneNumberId.trim() === '') {
      return { success: false, error: 'O Token de Acesso e o ID do Número são obrigatórios para o teste.' }
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const errMsg = errJson.error?.message || response.statusText
      throw new Error(`HTTP ${response.status} - ${errMsg}`)
    }

    const data = await response.json()
    
    // Log de auditoria
    const adminSupabase = createAdminClient()
    await adminSupabase.from('logs_auditoria').insert({
      usuario_id: check.user.id,
      acao: 'teste_meta',
      detalhes: {
        phone_number_id: phoneNumberId,
        display_phone_number: data.display_phone_number || 'N/A',
        verified_name: data.verified_name || 'N/A'
      }
    })

    return { 
      success: true, 
      display_phone_number: data.display_phone_number || 'N/A',
      verified_name: data.verified_name || 'N/A',
      quality_rating: data.quality_rating || 'N/A'
    }
  } catch (error: any) {
    console.error('Erro na Server Action testarConexaoMeta:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: testarConexaoEvolution
 * Verifica a conectividade com a Evolution API e o estado da instância informada.
 */
export async function testarConexaoEvolution(apiUrl: string, apiKey: string, instanceName: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    if (!apiUrl || !apiKey || !instanceName) {
      return { success: false, error: 'URL, API Key e Nome da Instância são obrigatórios.' }
    }

    const publicOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://casadeasados.duckdns.org'
    const { connected: isConnected, state, data } = await getEvolutionConnectionState(
      { apiUrl, apiKey, instanceName },
      publicOrigin,
    )

    // Log de auditoria
    const adminSupabase = createAdminClient()
    await adminSupabase.from('logs_auditoria').insert({
      usuario_id: check.user.id,
      acao: 'teste_evolution',
      detalhes: {
        instance_name: instanceName,
        state,
        connected: isConnected
      }
    })

    return { success: true, connected: isConnected, data }
  } catch (error: any) {
    console.error('Erro na Server Action testarConexaoEvolution:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: obterQrCodeEvolution
 * Solicita o QR Code de conexão (em formato base64) para a instância do Evolution API.
 */
export async function obterQrCodeEvolution(apiUrl: string, apiKey: string, instanceName: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    if (!apiUrl || !apiKey || !instanceName) {
      return { success: false, error: 'URL, API Key e Nome da Instância são obrigatórios.' }
    }

    const publicOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://casadeasados.duckdns.org'
    const { qrcode } = await getEvolutionQrCode(
      { apiUrl, apiKey, instanceName },
      publicOrigin,
    )

    // Log de auditoria
    const adminSupabase = createAdminClient()
    await adminSupabase.from('logs_auditoria').insert({
      usuario_id: check.user.id,
      acao: 'obter_qrcode_evolution',
      detalhes: {
        instance_name: instanceName
      }
    })

    return { success: true, qrcode }
  } catch (error: any) {
    console.error('Erro na Server Action obterQrCodeEvolution:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: testarConexaoMercadoPago
 * Valida o Access Token do Mercado Pago chamando a API de métodos de pagamento.
 */
export async function testarConexaoMercadoPago(accessToken: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    if (!accessToken) {
      return { success: false, error: 'O Access Token é obrigatório.' }
    }

    const url = 'https://api.mercadopago.com/v1/payment_methods'
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const errMsg = errJson.message || response.statusText
      throw new Error(`HTTP ${response.status} - ${errMsg}`)
    }

    // Log de auditoria
    const adminSupabase = createAdminClient()
    await adminSupabase.from('logs_auditoria').insert({
      usuario_id: check.user.id,
      acao: 'teste_mercado_pago',
      detalhes: {}
    })

    return { success: true }
  } catch (error: any) {
    console.error('Erro na Server Action testarConexaoMercadoPago:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: testarConexaoTelegram
 * Verifica se um token de bot do Telegram é válido chamando getMe.
 */
export async function testarConexaoTelegram(token: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    if (!token) {
      return { success: false, error: 'O token do Telegram é obrigatório.' }
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    if (data && data.ok) {
      // Log de auditoria
      const adminSupabase = createAdminClient()
      await adminSupabase.from('logs_auditoria').insert({
        usuario_id: check.user.id,
        acao: 'teste_telegram_bot',
        detalhes: { username: data.result.username }
      })

      return {
        success: true,
        username: data.result.username,
        name: data.result.first_name
      }
    } else {
      return {
        success: false,
        error: data.description || 'Token inválido'
      }
    }
  } catch (error: any) {
    console.error('Erro na Server Action testarConexaoTelegram:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
/**
 * Server Action 2.7: obterComprovantes
 * Busca e retorna todos os registros de comprovantes da tabela comprovantes,
 * incluindo o nome do cliente correspondente. Suporta filtros por cliente_id
 * e intervalo de datas (dataInicio e dataFim).
 */
export async function obterComprovantes(filtros: {
  clienteId?: string
  dataInicio?: string
  dataFim?: string
}) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    let query = supabase
      .from('comprovantes')
      .select('*, clientes(nome)')

    if (filtros.clienteId) {
      query = query.eq('cliente_id', filtros.clienteId)
    }

    if (filtros.dataInicio) {
      query = query.gte('data_criacao', filtros.dataInicio)
    }

    if (filtros.dataFim) {
      query = query.lte('data_criacao', filtros.dataFim)
    }

    const { data, error } = await query.order('data_criacao', { ascending: false })

    if (error) {
      console.error('Erro ao buscar comprovantes no banco:', error)
      return { success: false, error: `ERRO_BANCO_COMPROVANTES: ${error.message}` }
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action obterComprovantes:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
