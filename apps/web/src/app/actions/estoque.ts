'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import sharp from 'sharp'
import crypto from 'node:crypto'
import { sortProductsByOfficialOrder } from '@/lib/product-ordering'

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

  return { authorized: true, user, supabase }
}

const criarProdutoSchema = z.object({
  nome: z.string().trim().min(1, 'O nome do produto é obrigatório').max(255, 'O nome deve ter no máximo 255 caracteres'),
  descricao: z.string().nullable().optional(),
  preco_centavos: z.number().int('O preço deve ser um valor inteiro em centavos').min(0, 'O preço deve ser maior ou igual a zero'),
  quantidade_estoque: z.number().int().min(0).default(0),
  estoque_minimo: z.number().int().min(0).default(5),
  controlar_estoque: z.boolean().default(true),
})

const atualizarProdutoSchema = z.object({
  nome: z.string().trim().min(1, 'O nome do produto é obrigatório').max(255, 'O nome deve ter no máximo 255 caracteres'),
  descricao: z.string().nullable().optional(),
  preco_centavos: z.number().int('O preço deve ser um valor inteiro em centavos').min(0, 'O preço deve ser maior ou igual a zero'),
  estoque_minimo: z.number().int().min(0).optional(),
  controlar_estoque: z.boolean().optional(),
}).strict()

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
  correlation_id?: string
}) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized || !check.supabase) {
      return { success: false, error: check.error }
    }

    const supabase = check.supabase

    const validation = criarProdutoSchema.safeParse(data)
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    const correlationId = data.correlation_id || crypto.randomUUID()
    if (!z.string().uuid().safeParse(correlationId).success) {
      return { success: false, error: 'DADOS_INVALIDOS' }
    }

    const { data: produto, error } = await supabase
      .rpc('criar_produto_com_estoque', {
        p_nome: validation.data.nome,
        p_descricao: validation.data.descricao || null,
        p_preco_centavos: validation.data.preco_centavos,
        p_quantidade_estoque: validation.data.quantidade_estoque,
        p_estoque_minimo: validation.data.estoque_minimo,
        p_controlar_estoque: validation.data.controlar_estoque,
        p_correlation_id: correlationId,
      })
      .single()

    if (error) {
      console.error('Erro ao criar produto:', error)
      if (error.code === '23505' || error.message?.includes('IDEMPOTENCY_CONFLICT')) {
        return { success: false, error: 'CONFLITO_IDEMPOTENCIA' }
      }
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/admin')
    const produtoCriado = produto as Record<string, unknown> & { produto_id: string }
    return { success: true, data: { ...produtoCriado, id: produtoCriado.produto_id } }
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
    if (!check.authorized || !check.supabase) {
      return { success: false, error: check.error }
    }

    const supabase = check.supabase

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

    const updateData: Record<string, any> = {
      nome: validation.data.nome,
      descricao: validation.data.descricao,
      preco_centavos: validation.data.preco_centavos,
      data_atualizacao: new Date().toISOString(),
    }

    if (validation.data.estoque_minimo !== undefined) {
      updateData.estoque_minimo = validation.data.estoque_minimo
    }
    if (validation.data.controlar_estoque !== undefined) {
      updateData.controlar_estoque = validation.data.controlar_estoque
    }
    const { data: produto, error } = await supabase
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
    if (!check.authorized || !check.supabase) {
      return { success: false, error: check.error }
    }

    const supabase = check.supabase

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
  motivo?: string | null,
  correlationId?: string,
  idempotent = false,
) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized || !check.supabase) {
      return { success: false, error: check.error }
    }

    const supabase = check.supabase

    const validation = ajustarEstoqueSchema.safeParse({ produto_id, quantidade, tipo, motivo })
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    if (idempotent && (!correlationId || !z.string().uuid().safeParse(correlationId).success)) {
      return { success: false, error: 'DADOS_INVALIDOS' }
    }

    const { data, error } = await supabase
      .rpc('ajustar_estoque_atomico', {
        p_produto_id: validation.data.produto_id,
        p_quantidade: validation.data.quantidade,
        p_tipo: validation.data.tipo,
        p_motivo: validation.data.motivo || null,
        ...(idempotent ? { p_correlation_id: correlationId, p_idempotent: true } : {}),
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

      if (errorMessage.includes('IDEMPOTENCY_CONFLICT') || errorCode === '23505') {
        return { success: false, error: 'CONFLITO_IDEMPOTENCIA' }
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
      .order('ordem_exibicao', { ascending: true, nullsFirst: false })
      .order('nome', { ascending: true })
      .order('id', { ascending: true })

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

    const products = data || []
    return {
      success: true,
      data: products.some((product) => Object.hasOwn(product, 'ordem_exibicao'))
        ? sortProductsByOfficialOrder(data || [])
        : products,
    }
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
    if (!check.authorized || !check.supabase) {
      return { success: false, error: check.error }
    }

    const supabase = check.supabase

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

    const buffer = Buffer.from(await file.arrayBuffer())
    const version = crypto.randomUUID()

    const full = await sharp(buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()

    const thumb = await sharp(buffer)
      .resize(300, 300, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()

    const fullPath = `produtos/${produtoId}/${index}/${version}/full.webp`
    const thumbPath = `produtos/${produtoId}/${index}/${version}/thumb.webp`

    const { error: uploadFullError } = await supabase.storage
      .from('produto-imagens')
      .upload(fullPath, full, { contentType: 'image/webp', upsert: true })

    if (uploadFullError) {
      console.error('Erro no upload da imagem full:', uploadFullError)
      return { success: false, error: `ERRO_STORAGE: ${uploadFullError.message}` }
    }

    const { error: uploadThumbError } = await supabase.storage
      .from('produto-imagens')
      .upload(thumbPath, thumb, { contentType: 'image/webp', upsert: true })

    if (uploadThumbError) {
      console.error('Erro no upload da imagem thumb:', uploadThumbError)
      const { error: removeError } = await supabase.storage.from('produto-imagens').remove([fullPath])
      if (!removeError) return { success: false, error: `ERRO_STORAGE: ${uploadThumbError.message}` }

      const { data: cleanupId, error: cleanupError } = await supabase.rpc('registrar_limpeza_imagem_pendente', {
        p_produto_id: produtoId,
        p_paths: [fullPath],
        p_error: removeError.message,
      })
      if (cleanupError) return { success: false, error: 'LIMPEZA_PENDENTE_NAO_PERSISTIDA' }
      return { success: false, error: `ERRO_STORAGE: ${uploadThumbError.message}`, cleanup_id: cleanupId }
    }

    const { data: previous, error: updateError } = await supabase
      .rpc('substituir_imagem_produto', {
        p_produto_id: produtoId,
        p_slot: index,
        p_full_path: fullPath,
        p_thumb_path: thumbPath,
      })
      .single()

    if (updateError) {
      console.error('Erro ao atualizar URLs da imagem:', updateError)
      const { error: removeError } = await supabase.storage.from('produto-imagens').remove([fullPath, thumbPath])
      if (!removeError) return { success: false, error: `ERRO_BANCO: ${updateError.message}` }

      const { data: cleanupId, error: cleanupError } = await supabase.rpc('registrar_limpeza_imagem_pendente', {
        p_produto_id: produtoId,
        p_paths: [fullPath, thumbPath],
        p_error: removeError.message,
      })
      if (cleanupError) return { success: false, error: 'LIMPEZA_PENDENTE_NAO_PERSISTIDA' }
      return { success: false, error: `ERRO_BANCO: ${updateError.message}`, cleanup_id: cleanupId }
    }

    const imagemAnterior = previous as { full: string | null; thumb: string | null; cleanup_id: string | null } | null
    revalidatePath('/atendimento/admin')
    const oldPaths = [imagemAnterior?.full, imagemAnterior?.thumb].filter((path): path is string => Boolean(path))
    if (oldPaths.length === 0) return { success: true, data: { full: fullPath, thumb: thumbPath }, cleanup_pending: false, cleanup_id: imagemAnterior?.cleanup_id ?? null }

    const { error: cleanupError } = await supabase.storage.from('produto-imagens').remove(oldPaths)
    if (cleanupError) {
      await supabase.rpc('falhar_limpeza_imagem_pendente', {
        p_cleanup_id: imagemAnterior?.cleanup_id,
        p_error: cleanupError.message,
      })
      return { success: true, data: { full: fullPath, thumb: thumbPath }, cleanup_pending: true, cleanup_id: imagemAnterior?.cleanup_id ?? null }
    }

    if (imagemAnterior?.cleanup_id) {
      await supabase.rpc('concluir_limpeza_imagem_pendente', { p_cleanup_id: imagemAnterior.cleanup_id })
    }
    return { success: true, data: { full: fullPath, thumb: thumbPath }, cleanup_pending: false, cleanup_id: imagemAnterior?.cleanup_id ?? null }
  } catch (error: any) {
    console.error('Erro na action uploadImagemProduto:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function reprocessarLimpezaImagemPendente(cleanupId: string) {
  try {
    const check = await verificarPermissaoAdminEstoque()
    if (!check.authorized || !check.supabase) return { success: false, error: check.error }

    const supabase = check.supabase
    const { data: cleanup, error: lookupError } = await supabase
      .rpc('obter_limpeza_imagem_pendente', { p_cleanup_id: cleanupId })
      .single()
    if (lookupError || !cleanup) return { success: false, error: 'LIMPEZA_PENDENTE_NAO_ENCONTRADA' }
    const limpeza = cleanup as { paths: string[] }

    if (limpeza.paths.length > 0) {
      const { error: storageError } = await supabase.storage.from('produto-imagens').remove(limpeza.paths)
      if (storageError) {
        await supabase.rpc('falhar_limpeza_imagem_pendente', { p_cleanup_id: cleanupId, p_error: storageError.message })
        return { success: false, error: `ERRO_STORAGE: ${storageError.message}` }
      }
    }

    const { error: completeError } = await supabase.rpc('concluir_limpeza_imagem_pendente', { p_cleanup_id: cleanupId })
    return completeError ? { success: false, error: `ERRO_BANCO: ${completeError.message}` } : { success: true }
  } catch (error: any) {
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
