'use server'

import { createClient } from '@/lib/supabase/server'

interface AtualizarClienteCrmData {
  endereco?: string
  tags?: string[]
  notas?: string
  score?: number
}

export async function atualizarClienteCrm(
  clienteId: string,
  data: AtualizarClienteCrmData
) {
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

    const funcoesOperador = ['admin', 'supervisor', 'vendedor']
    const ehOperador = funcoesOperador.includes(perfil.funcao)

    if (!ehOperador) {
      // Clientes não podem alterar metadatos de CRM
      if (data.tags !== undefined || data.notas !== undefined || data.score !== undefined) {
        return { success: false, error: 'ACESSO_NEGADO_METADADOS_RESTRITOS' }
      }

      // Verifica se o cliente sendo editado é o proprietário (usuario_id = user.id)
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .select('usuario_id')
        .eq('id', clienteId)
        .single()

      if (clienteError || !cliente) {
        return { success: false, error: 'CLIENTE_NAO_ENCONTRADO' }
      }

      if (cliente.usuario_id !== user.id) {
        return { success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
      }
    }

    // 3. Montar dados para atualização
    const updateData: any = {}
    if (data.endereco !== undefined) updateData.endereco = data.endereco
    if (data.tags !== undefined) updateData.tags = data.tags
    if (data.notas !== undefined) updateData.notas = data.notas
    if (data.score !== undefined) updateData.score = data.score
    updateData.data_atualizacao = new Date().toISOString()

    // 4. Executar update
    const { error: updateError } = await supabase
      .from('clientes')
      .update(updateData)
      .eq('id', clienteId)

    if (updateError) {
      return { success: false, error: `ERRO_ATUALIZACAO: ${updateError.message}` }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Erro na action atualizarClienteCrm:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
