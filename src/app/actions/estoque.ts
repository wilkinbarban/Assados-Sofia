'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import sharp from 'sharp'

async function verificarPermissaoAdminEstoque() {
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

  const funcoesAutorizadas = ['admin', 'supervisor']
  if (!funcoesAutorizadas.includes(perfil.funcao)) {
    return { authorized: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
  }

  return { authorized: true, user }
}

const criarProdutoSchema = z.object({
  nome: z.string().min(1, 'O nome do produto é obrigatório').max(255, 'O nome deve ter no máximo 255 caracteres'),
  descricao: z.string().nullable().optional(),
  preco_centavos: z.number().int('O preço deve ser um valor inteiro em centavos').min(0, 'O preço deve ser maior ou igual a zero'),
  quantidade_estoque: z.number().int().min(0).default(0),
  estoque_minimo: z.number().int().min(0).default(5),
  controlar_estoque: z.boolean().default(true),
})

const atualizarProdutoSchema = z.object({
  nome: z.string().min(1, 'O nome do produto é obrigatório').max(255, 'O nome deve ter no máximo 255 caracteres'),
  descricao: z.string().nullable().optional(),
  preco_centavos: z.number().int('O preço deve ser um valor inteiro em centavos').min(0, 'O preço deve ser maior ou igual a zero'),
  quantidade_estoque: z.number().int().min(0).optional(),
  estoque_minimo: z.number().int().min(0).optional(),
  controlar_estoque: z.boolean().optional(),
})

const ajustarEstoqueSchema = z.object({
  produto_id: z.string().uuid('ID de produto inválido'),
  quantidade: z.number().int().min(1, 'A quantidade deve ser maior que zero'),
  tipo: z.enum(['entrada', 'saida', 'ajuste', 'cancelamento']),
  motivo: z.string().nullable().optional(),
})

type AjusteEstoqueRpcResult = {
  qtd_anterior: number
  qtd_nova: number
  movimentacao_id?: string | null
  produto_ativo?: boolean | null
}

const imagensPermitidas = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024

export async function criarProduto(data: {
  nome: string
  descricao?: string | null
  preco_centavos: number
  quantidade_estoque?: number
  estoque_minimo?: number
  controlar_estoque?: boolean
}) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const validation = criarProdutoSchema.safeParse(data)
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    const adminSupabase = createAdminClient()

    const { data: produto, error } = await adminSupabase
      .from('produtos')
      .insert({
        nome: validation.data.nome,
        descricao: validation.data.descricao,
        preco_centavos: validation.data.preco_centavos,
        quantidade_estoque: validation.data.quantidade_estoque,
        estoque_minimo: validation.data.estoque_minimo,
        controlar_estoque: validation.data.controlar_estoque,
        ativo: !(validation.data.controlar_estoque && validation.data.quantidade_estoque === 0),
      })
      .select()
      .single()

    if (error) {
      console.error('Erro ao criar produto:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/admin')
    return { success: true, data: produto }
  } catch (error: any) {
    console.error('Erro na action criarProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function atualizarProduto(
  id: string,
  data: {
    nome: string
    descricao?: string | null
    preco_centavos: number
    quantidade_estoque?: number
    estoque_minimo?: number
    controlar_estoque?: boolean
  }
) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    if (!id) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    const validation = atualizarProdutoSchema.safeParse(data)
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    const adminSupabase = createAdminClient()

    const updateData: Record<string, any> = {
      nome: validation.data.nome,
      descricao: validation.data.descricao,
      preco_centavos: validation.data.preco_centavos,
      data_atualizacao: new Date().toISOString(),
    }

    if (validation.data.quantidade_estoque !== undefined) {
      updateData.quantidade_estoque = validation.data.quantidade_estoque
    }
    if (validation.data.estoque_minimo !== undefined) {
      updateData.estoque_minimo = validation.data.estoque_minimo
    }
    if (validation.data.controlar_estoque !== undefined) {
      updateData.controlar_estoque = validation.data.controlar_estoque
    }
    if (validation.data.controlar_estoque && validation.data.quantidade_estoque === 0) {
      updateData.ativo = false
    }

    const { data: produto, error } = await adminSupabase
      .from('produtos')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar produto:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/admin')
    return { success: true, data: produto }
  } catch (error: any) {
    console.error('Erro na action atualizarProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function excluirProduto(id: string) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    if (!id) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    const adminSupabase = createAdminClient()

    const { data: produto, error: findError } = await adminSupabase
      .from('produtos')
      .select('url_imagem, url_imagem_thumb, url_imagem_2, url_imagem_2_thumb')
      .eq('id', id)
      .single()

    if (findError || !produto) {
      return { success: false, error: 'PRODUTO_NAO_ENCONTRADO' }
    }

    const imagensParaRemover: string[] = []
    if (produto.url_imagem) imagensParaRemover.push(produto.url_imagem)
    if (produto.url_imagem_thumb) imagensParaRemover.push(produto.url_imagem_thumb)
    if (produto.url_imagem_2) imagensParaRemover.push(produto.url_imagem_2)
    if (produto.url_imagem_2_thumb) imagensParaRemover.push(produto.url_imagem_2_thumb)

    if (imagensParaRemover.length > 0) {
      const { error: storageError } = await adminSupabase.storage
        .from('produto-imagens')
        .remove(imagensParaRemover)

      if (storageError) {
        console.warn('Aviso: Erro ao remover imagens do storage:', storageError)
      }
    }

    const { error: deleteError } = await adminSupabase
      .from('produtos')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Erro ao excluir produto:', deleteError)
      return { success: false, error: `ERRO_BANCO: ${deleteError.message}` }
    }

    revalidatePath('/atendimento/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na action excluirProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function alternarStatusProduto(id: string, ativo: boolean) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    if (!id) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    const adminSupabase = createAdminClient()

    const { data: produto, error } = await adminSupabase
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

    revalidatePath('/atendimento/admin')
    return { success: true, data: produto }
  } catch (error: any) {
    console.error('Erro na action alternarStatusProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function ajustarEstoque(
  produto_id: string,
  quantidade: number,
  tipo: 'entrada' | 'saida' | 'ajuste' | 'cancelamento',
  motivo?: string | null
) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const validation = ajustarEstoqueSchema.safeParse({ produto_id, quantidade, tipo, motivo })
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    if (!check.user) {
      return { success: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const adminSupabase = createAdminClient()

    const { data, error } = await adminSupabase
      .rpc('ajustar_estoque_atomico', {
        p_produto_id: validation.data.produto_id,
        p_quantidade: validation.data.quantidade,
        p_tipo: validation.data.tipo,
        p_motivo: validation.data.motivo || null,
        p_usuario_id: check.user.id,
      })
      .single()

    if (error) {
      console.error('Erro ao ajustar estoque atomicamente:', error)

      const errorMessage = error.message || ''
      const errorCode = error.code || ''

      if (errorMessage.includes('PRODUTO_NAO_ENCONTRADO') || errorCode === 'P0002') {
        return { success: false, error: 'PRODUTO_NAO_ENCONTRADO' }
      }

      if (errorMessage.includes('ESTOQUE_INSUFICIENTE') || errorCode === '23514') {
        return { success: false, error: 'ESTOQUE_INSUFICIENTE' }
      }

      if (
        errorMessage.includes('PRODUTO_ID_OBRIGATORIO') ||
        errorMessage.includes('USUARIO_ID_OBRIGATORIO') ||
        errorMessage.includes('QUANTIDADE_INVALIDA') ||
        errorMessage.includes('TIPO_MOVIMENTACAO_INVALIDO') ||
        errorCode === '22023'
      ) {
        return { success: false, error: 'DADOS_INVALIDOS' }
      }

      if (
        errorCode === '42501' ||
        errorMessage.toLowerCase().includes('permission denied') ||
        errorMessage.toLowerCase().includes('row-level security')
      ) {
        return { success: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
      }

      return { success: false, error: `ERRO_BANCO: ${errorMessage}` }
    }

    if (!data) {
      return { success: false, error: 'ERRO_BANCO: RPC sem retorno' }
    }

    const ajuste = data as AjusteEstoqueRpcResult

    revalidatePath('/atendimento/admin')
    return {
      success: true,
      data: {
        qtd_anterior: ajuste.qtd_anterior,
        qtd_nova: ajuste.qtd_nova,
        movimentacao_id: ajuste.movimentacao_id,
        produto_ativo: ajuste.produto_ativo,
      },
    }
  } catch (error: any) {
    console.error('Erro na action ajustarEstoque:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function listarMovimentacoes(produto_id: string) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    if (!produto_id) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    const adminSupabase = createAdminClient()

    const { data, error } = await adminSupabase
      .from('movimentacoes_estoque')
      .select('*')
      .eq('produto_id', produto_id)
      .order('data_criacao', { ascending: false })

    if (error) {
      console.error('Erro ao listar movimentações:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action listarMovimentacoes:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function listarProdutos(filtro?: 'todos' | 'ativos' | 'esgotados') {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const adminSupabase = createAdminClient()

    let query = adminSupabase
      .from('produtos')
      .select('*')
      .order('nome', { ascending: true })

    if (filtro === 'ativos') {
      query = query.eq('ativo', true)
    } else if (filtro === 'esgotados') {
      query = query
        .eq('controlar_estoque', true)
        .eq('quantidade_estoque', 0)
    }
    // 'todos' ou undefined: sem filtro de status

    const { data, error } = await query

    if (error) {
      console.error('Erro ao listar produtos:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action listarProdutos:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function uploadImagemProduto(
  produtoId: string,
  formData: FormData,
  index: number
) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    if (index !== 1 && index !== 2) {
      return { success: false, error: 'DADOS_INVALIDOS', details: { index: ['Deve ser 1 ou 2'] } }
    }

    const file = formData.get('file') as File | null
    if (!file) {
      return { success: false, error: 'DADOS_INVALIDOS', details: { file: ['Arquivo é obrigatório'] } }
    }

    if (!imagensPermitidas.includes(file.type)) {
      return { success: false, error: 'FORMATO_IMAGEM_INVALIDO' }
    }

    if (file.size > MAX_SIZE) {
      return { success: false, error: 'ARQUIVO_MUITO_GRANDE' }
    }

    const adminSupabase = createAdminClient()

    const { data: produto, error: findError } = await adminSupabase
      .from('produtos')
      .select('id')
      .eq('id', produtoId)
      .single()

    if (findError || !produto) {
      return { success: false, error: 'PRODUTO_NAO_ENCONTRADO' }
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const prefix = index === 1 ? `prod_${produtoId}` : `prod_${produtoId}_2`

    const full = await sharp(buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()

    const thumb = await sharp(buffer)
      .resize(300, 300, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()

    const fullPath = `${prefix}_full.webp`
    const thumbPath = `${prefix}_thumb.webp`

    const { error: uploadFullError } = await adminSupabase.storage
      .from('produto-imagens')
      .upload(fullPath, full, { contentType: 'image/webp', upsert: true })

    if (uploadFullError) {
      console.error('Erro no upload da imagem full:', uploadFullError)
      return { success: false, error: `ERRO_STORAGE: ${uploadFullError.message}` }
    }

    const { error: uploadThumbError } = await adminSupabase.storage
      .from('produto-imagens')
      .upload(thumbPath, thumb, { contentType: 'image/webp', upsert: true })

    if (uploadThumbError) {
      console.error('Erro no upload da imagem thumb:', uploadThumbError)
      await adminSupabase.storage.from('produto-imagens').remove([fullPath])
      return { success: false, error: `ERRO_STORAGE: ${uploadThumbError.message}` }
    }

    const updateData: Record<string, any> = {
      data_atualizacao: new Date().toISOString(),
    }

    if (index === 1) {
      updateData.url_imagem = fullPath
      updateData.url_imagem_thumb = thumbPath
    } else {
      updateData.url_imagem_2 = fullPath
      updateData.url_imagem_2_thumb = thumbPath
    }

    const { error: updateError } = await adminSupabase
      .from('produtos')
      .update(updateData)
      .eq('id', produtoId)

    if (updateError) {
      console.error('Erro ao atualizar URLs da imagem:', updateError)
      return { success: false, error: `ERRO_BANCO: ${updateError.message}` }
    }

    revalidatePath('/atendimento/admin')
    return { success: true, data: { full: fullPath, thumb: thumbPath } }
  } catch (error: any) {
    console.error('Erro na action uploadImagemProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function removerImagemProduto(produtoId: string, index: number) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    if (index !== 1 && index !== 2) {
      return { success: false, error: 'DADOS_INVALIDOS', details: { index: ['Deve ser 1 ou 2'] } }
    }

    const adminSupabase = createAdminClient()

    const { data: produto, error: findError } = await adminSupabase
      .from('produtos')
      .select('url_imagem, url_imagem_thumb, url_imagem_2, url_imagem_2_thumb')
      .eq('id', produtoId)
      .single()

    if (findError || !produto) {
      return { success: false, error: 'PRODUTO_NAO_ENCONTRADO' }
    }

    const imagensParaRemover: string[] = []
    const updateData: Record<string, any> = {
      data_atualizacao: new Date().toISOString(),
    }

    if (index === 1) {
      if (produto.url_imagem) imagensParaRemover.push(produto.url_imagem)
      if (produto.url_imagem_thumb) imagensParaRemover.push(produto.url_imagem_thumb)
      updateData.url_imagem = null
      updateData.url_imagem_thumb = null
    } else {
      if (produto.url_imagem_2) imagensParaRemover.push(produto.url_imagem_2)
      if (produto.url_imagem_2_thumb) imagensParaRemover.push(produto.url_imagem_2_thumb)
      updateData.url_imagem_2 = null
      updateData.url_imagem_2_thumb = null
    }

    if (imagensParaRemover.length > 0) {
      const { error: storageError } = await adminSupabase.storage
        .from('produto-imagens')
        .remove(imagensParaRemover)

      if (storageError) {
        console.warn('Aviso: Erro ao remover imagens do storage:', storageError)
      }
    }

    const { error: updateError } = await adminSupabase
      .from('produtos')
      .update(updateData)
      .eq('id', produtoId)

    if (updateError) {
      console.error('Erro ao limpar URLs da imagem:', updateError)
      return { success: false, error: `ERRO_BANCO: ${updateError.message}` }
    }

    revalidatePath('/atendimento/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na action removerImagemProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
