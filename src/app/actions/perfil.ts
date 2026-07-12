'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Helper para validar se o usuário atual está autenticado, ativo
 * e se possui papel de 'admin', 'supervisor' ou 'vendedor'.
 */
export async function verificarPermissaoQualquerOperador() {
  const supabase = await createClient()

  // 1. Obter usuário autenticado da sessão
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { authorized: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO', supabase }
  }

  // 2. Buscar o perfil do usuário e validar suas permissões e status
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('id, funcao, ativo, nome')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil) {
    return { authorized: false, error: 'PERFIL_NAO_ENCONTRADO', supabase }
  }

  if (!perfil.ativo) {
    return { authorized: false, error: 'PERFIL_INATIVO', supabase }
  }

  const funcoesAutorizadas = ['admin', 'supervisor', 'vendedor']
  if (!funcoesAutorizadas.includes(perfil.funcao)) {
    return { authorized: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE', supabase }
  }

  return { authorized: true, user, perfil, supabase }
}

/**
 * Server Action: atualizarPerfilProprio
 * Atualiza o nome do próprio operador autenticado e insere log de auditoria.
 */
export async function atualizarPerfilProprio(nome: string) {
  try {
    if (!nome || nome.trim() === '') {
      return { success: false, error: 'NOME_INVALIDO' }
    }

    const check = await verificarPermissaoQualquerOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const { user, supabase } = check

    // O RLS permite que o usuário atualize o seu próprio perfil
    const { error: updateError } = await supabase
      .from('perfis')
      .update({ nome })
      .eq('id', user.id)

    if (updateError) {
      return { success: false, error: `ERRO_ATUALIZACAO: ${updateError.message}` }
    }

    // Gravar log de auditoria anonimizado (sem PII como o nome em si)
    const adminSupabase = createAdminClient()
    const { error: logError } = await adminSupabase
      .from('logs_auditoria')
      .insert({
        usuario_id: user.id,
        acao: 'atualizar_perfil',
        detalhes: {
          perfil_id: user.id,
          nome_atualizado: true
        }
      })

    if (logError) {
      console.error('Erro ao registrar log de auditoria de alteração de perfil:', logError)
    }

    revalidatePath('/atendimento/perfil')
    return { success: true }
  } catch (error: any) {
    console.error('Erro em atualizarPerfilProprio:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Server Action: atualizarSenhaPropria
 * Redefine a senha do próprio operador via Supabase Auth e insere log de auditoria.
 */
export async function atualizarSenhaPropria(novaSenha: string) {
  try {
    if (!novaSenha || novaSenha.length < 6) {
      return { success: false, error: 'SENHA_CURTA' }
    }

    const check = await verificarPermissaoQualquerOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const { user, supabase } = check

    // Atualiza a senha no Supabase Auth usando o client do usuário ativo
    const { error: authError } = await supabase.auth.updateUser({
      password: novaSenha
    })

    if (authError) {
      return { success: false, error: `ERRO_AUTENTICACAO: ${authError.message}` }
    }

    // Gravar log de auditoria anonimizado
    const adminSupabase = createAdminClient()
    const { error: logError } = await adminSupabase
      .from('logs_auditoria')
      .insert({
        usuario_id: user.id,
        acao: 'atualizar_senha',
        detalhes: {
          perfil_id: user.id
        }
      })

    if (logError) {
      console.error('Erro ao registrar log de auditoria de alteração de senha:', logError)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Erro em atualizarSenhaPropria:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
