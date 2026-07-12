'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Schema para validação dos dados do produto

const reordenarProdutosVisiveisSchema = z.array(
  z.object({
    id: z.string().min(1, 'ID_OBRIGATORIO'),
    ordem_exibicao: z.number().int().positive(),
  })
).min(1, 'LISTA_OBRIGATORIA')

function hasUniqueIds(items: Array<{ id: string }>) {
  return new Set(items.map((item) => item.id)).size === items.length
}

function hasSequentialPositions(items: Array<{ ordem_exibicao: number }>) {
  return items
    .map((item) => item.ordem_exibicao)
    .sort((a, b) => a - b)
    .every((position, index) => position === index + 1)
}

const produtoSchema = z.object({
  nome: z.string()
    .min(1, 'O nome do produto é obrigatório')
    .max(255, 'O nome deve ter no máximo 255 caracteres'),
  descricao: z.string().nullable().optional(),
  preco_centavos: z.number()
    .int('O preço deve ser um valor inteiro em centavos')
    .min(0, 'O preço deve ser maior ou igual a zero'),
  ativo: z.boolean().default(true),
  url_imagem: z.string().nullable().optional(),
})

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
 * Cria um novo produto no catálogo.
 */
export async function criarProduto(data: {
  nome: string
  descricao?: string | null
  preco_centavos: number
  ativo?: boolean
  url_imagem?: string | null
}) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    // Validar dados recebidos
    const validation = produtoSchema.safeParse(data)
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    const { data: produto, error } = await supabase
      .from('produtos')
      .insert({
        nome: validation.data.nome,
        descricao: validation.data.descricao,
        preco_centavos: validation.data.preco_centavos,
        ativo: validation.data.ativo,
        url_imagem: validation.data.url_imagem,
      })
      .select()
      .single()

    if (error) {
      console.error('Erro ao criar produto:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/produtos')
    return { success: true, data: produto }
  } catch (error: any) {
    console.error('Erro na action criarProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Atualiza um produto existente no catálogo.
 */
export async function atualizarProduto(
  id: string,
  data: {
    nome: string
    descricao?: string | null
    preco_centavos: number
    ativo?: boolean
    url_imagem?: string | null
  }
) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    if (!id) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    // Validar dados recebidos
    const validation = produtoSchema.safeParse(data)
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    const { data: produto, error } = await supabase
      .from('produtos')
      .update({
        nome: validation.data.nome,
        descricao: validation.data.descricao,
        preco_centavos: validation.data.preco_centavos,
        ativo: validation.data.ativo,
        url_imagem: validation.data.url_imagem,
        data_atualizacao: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar produto:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/produtos')
    return { success: true, data: produto }
  } catch (error: any) {
    console.error('Erro na action atualizarProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Alterna apenas o status ativo/inativo de um produto.
 */
export async function alternarStatusProduto(id: string, ativo: boolean) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    if (!id) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    const { data: produto, error } = await supabase
      .from('produtos')
      .update({
        ativo,
        data_atualizacao: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao alternar status do produto:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/produtos')
    return { success: true, data: produto }
  } catch (error: any) {
    console.error('Erro na action alternarStatusProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}


/**
 * Reordena apenas os produtos visíveis enviados pela UI administrativa.
 */
export async function reordenarProdutosVisiveis(itens: Array<{ id: string; ordem_exibicao: number }>) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check
    const validation = reordenarProdutosVisiveisSchema.safeParse(itens)
    if (!validation.success || !hasUniqueIds(validation.data) || !hasSequentialPositions(validation.data)) {
      return { success: false, error: 'DADOS_INVALIDOS' }
    }

    const ids = validation.data.map((item) => item.id)
    const { data: produtosExistentes, error: selectError } = await supabase
      .from('produtos')
      .select('id, ordem_exibicao')
      .in('id', ids)

    if (selectError) {
      console.error('Erro ao validar produtos para reordenação:', selectError)
      return { success: false, error: `ERRO_BANCO: ${selectError.message}` }
    }

    const idsExistentes = new Set((produtosExistentes || []).map((produto: { id: string }) => produto.id))
    if (idsExistentes.size !== ids.length || ids.some((id) => !idsExistentes.has(id))) {
      return { success: false, error: 'PRODUTO_NAO_ENCONTRADO' }
    }

    const ordemOriginalPorId = new Map(
      (produtosExistentes || []).map((produto: { id: string; ordem_exibicao: number | null }) => [
        produto.id,
        produto.ordem_exibicao,
      ])
    )
    const produtosAtualizados: Array<{ id: string; ordem_exibicao: number | null }> = []
    const dataAtualizacao = new Date().toISOString()

    for (const item of validation.data) {
      const { error } = await supabase
        .from('produtos')
        .update({
          ordem_exibicao: item.ordem_exibicao,
          data_atualizacao: dataAtualizacao,
        })
        .eq('id', item.id)

      if (error) {
        console.error('Erro ao reordenar produto:', error)
        for (const produtoAtualizado of produtosAtualizados.reverse()) {
          const { error: rollbackError } = await supabase
            .from('produtos')
            .update({
              ordem_exibicao: produtoAtualizado.ordem_exibicao,
              data_atualizacao: new Date().toISOString(),
            })
            .eq('id', produtoAtualizado.id)

          if (rollbackError) {
            console.error('Erro ao reverter reordenação de produto:', rollbackError)
            return { success: false, error: `ERRO_BANCO_ROLLBACK: ${rollbackError.message}` }
          }
        }

        return { success: false, error: `ERRO_BANCO: ${error.message}` }
      }

      produtosAtualizados.push({
        id: item.id,
        ordem_exibicao: ordemOriginalPorId.get(item.id) ?? null,
      })
    }

    revalidatePath('/atendimento/produtos')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na action reordenarProdutosVisiveis:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
