'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Schema para validação dos dados do artigo
const artigoSchema = z.object({
  titulo: z.string()
    .min(1, 'O título é obrigatório')
    .max(255, 'O título deve ter no máximo 255 caracteres'),
  conteudo: z.string()
    .min(1, 'O conteúdo é obrigatório'),
  tags: z.array(z.string().max(100)).default([]),
  ativo: z.boolean().default(true),
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
 * Cria um novo artigo na base de conhecimento.
 */
export async function criarArtigo(
  titulo: string,
  conteudo: string,
  tags: string[],
  ativo: boolean = true
) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    // Validar dados recebidos
    const validation = artigoSchema.safeParse({ titulo, conteudo, tags, ativo })
    if (!validation.success) {
      return { 
        success: false, 
        error: 'DADOS_INVALIDOS', 
        details: validation.error.flatten().fieldErrors 
      }
    }

    const { data, error } = await supabase
      .from('base_conhecimento')
      .insert({
        titulo: validation.data.titulo,
        conteudo: validation.data.conteudo,
        tags: validation.data.tags,
        ativo: validation.data.ativo,
      })
      .select()
      .single()

    if (error) {
      console.error('Erro ao criar artigo:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/conhecimento')
    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action criarArtigo:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Atualiza um artigo existente na base de conhecimento.
 */
export async function atualizarArtigo(
  id: string,
  titulo: string,
  conteudo: string,
  tags: string[],
  ativo: boolean
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
    const validation = artigoSchema.safeParse({ titulo, conteudo, tags, ativo })
    if (!validation.success) {
      return { 
        success: false, 
        error: 'DADOS_INVALIDOS', 
        details: validation.error.flatten().fieldErrors 
      }
    }

    const { data, error } = await supabase
      .from('base_conhecimento')
      .update({
        titulo: validation.data.titulo,
        conteudo: validation.data.conteudo,
        tags: validation.data.tags,
        ativo: validation.data.ativo,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar artigo:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/conhecimento')
    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action atualizarArtigo:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Alterna apenas o status ativo/inativo de um artigo.
 */
export async function alternarStatusArtigo(id: string, ativo: boolean) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    if (!id) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    const { data, error } = await supabase
      .from('base_conhecimento')
      .update({ ativo })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao alternar status do artigo:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/conhecimento')
    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action alternarStatusArtigo:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Remove fisicamente um artigo da base de conhecimento.
 */
export async function excluirArtigo(id: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const { supabase } = check

    if (!id) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    const { error } = await supabase
      .from('base_conhecimento')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Erro ao excluir artigo:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    revalidatePath('/atendimento/conhecimento')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na action excluirArtigo:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Lista todos os documentos de conhecimento importados.
 */
export async function listarDocumentosConhecimento() {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }
    const { supabase } = check

    const { data, error } = await supabase
      .from('documentos_conhecimento')
      .select('*')
      .order('data_criacao', { ascending: false })

    if (error) {
      console.error('Erro ao listar documentos:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action listarDocumentosConhecimento:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Importa um novo documento (PDF ou DOCX), faz o parsing de texto no servidor,
 * envia o arquivo para o Supabase Storage e salva em chunks na base de conhecimento.
 */
export async function importarDocumentoConhecimento(
  nomeArquivo: string,
  tipoMime: string,
  base64Dados: string
) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }
    const { supabase } = check

    // 1. Converter base64 para Buffer e validar tamanho (limite 10MB)
    const buffer = Buffer.from(base64Dados, 'base64')
    if (buffer.length > 10 * 1024 * 1024) {
      return { success: false, error: 'O arquivo excede o limite de 10MB.' }
    }

    // 2. Validar limite total de documentos (máximo 50)
    const { count, error: countError } = await supabase
      .from('documentos_conhecimento')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Erro ao contar documentos:', countError)
      return { success: false, error: `ERRO_BANCO: ${countError.message}` }
    }

    if (count !== null && count >= 50) {
      return { success: false, error: 'Lote limite de 50 documentos atingido' }
    }

    // 3. Validar tipo de arquivo / MIME type
    const isPDF = tipoMime === 'application/pdf' || nomeArquivo.toLowerCase().endsWith('.pdf')
    const isDocx = tipoMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || nomeArquivo.toLowerCase().endsWith('.docx')

    if (!isPDF && !isDocx) {
      return { success: false, error: 'Formato de arquivo não suportado. Apenas PDF ou DOCX são permitidos.' }
    }

    // 4. Extrair texto bruto dependendo do formato
    let rawText = ''
    if (isPDF) {
      const pdf = require('pdf-parse')
      const data = await pdf(buffer)
      rawText = data.text || ''
    } else {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      rawText = result.value || ''
    }

    // 5. Upload do arquivo binário bruto para o bucket privado
    const storagePath = `${Date.now()}_${nomeArquivo}`
    const { error: uploadError } = await supabase.storage
      .from('documentos-conhecimento')
      .upload(storagePath, buffer, {
        contentType: tipoMime,
        duplex: 'half'
      })

    if (uploadError) {
      console.error('Erro no upload para o storage:', uploadError)
      return { success: false, error: `ERRO_STORAGE: ${uploadError.message}` }
    }

    // 6. Inserir metadados em public.documentos_conhecimento
    const { data: docData, error: insertError } = await supabase
      .from('documentos_conhecimento')
      .insert({
        nome_arquivo: nomeArquivo,
        tamanho_bytes: buffer.length,
        tipo_mime: tipoMime,
        caminho_storage: storagePath
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Erro ao registrar documento no banco:', insertError)
      // Cleanup do storage em caso de erro
      await supabase.storage.from('documentos-conhecimento').remove([storagePath])
      return { success: false, error: `ERRO_BANCO: ${insertError.message}` }
    }

    const documentoId = docData.id

    // 7. Dividir o texto extraído em chunks de até 4000 caracteres
    const sanitizedText = rawText.trim()
    if (sanitizedText.length > 0) {
      const limit = 4000
      const chunks: string[] = []
      for (let i = 0; i < sanitizedText.length; i += limit) {
        chunks.push(sanitizedText.substring(i, i + limit))
      }

      for (let index = 0; index < chunks.length; index++) {
        const chunkText = chunks[index].trim()
        if (!chunkText) continue

        const { error: chunkError } = await supabase
          .from('base_conhecimento')
          .insert({
            titulo: `${nomeArquivo} - Bloco ${index + 1}`,
            conteudo: chunkText,
            tags: ['documento', nomeArquivo.toLowerCase()],
            ativo: true,
            documento_id: documentoId
          })

        if (chunkError) {
          console.error(`Erro ao inserir bloco ${index + 1}:`, chunkError)
          // Excluir metadados e arquivo para manter consistência
          await supabase.from('documentos_conhecimento').delete().eq('id', documentoId)
          await supabase.storage.from('documentos-conhecimento').remove([storagePath])
          return { success: false, error: `ERRO_BANCO_CHUNKS: ${chunkError.message}` }
        }
      }
    }

    revalidatePath('/atendimento/conhecimento')
    return { success: true }
  } catch (error: any) {
    console.error('Erro ao importar documento:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

/**
 * Exclui um documento de conhecimento, remove do storage e do banco
 * (base_conhecimento é limpa em cascata).
 */
export async function excluirDocumentoConhecimento(documentoId: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }
    const { supabase } = check

    if (!documentoId) {
      return { success: false, error: 'ID_OBRIGATORIO' }
    }

    // 1. Obter caminho do arquivo no storage
    const { data: doc, error: queryError } = await supabase
      .from('documentos_conhecimento')
      .select('caminho_storage')
      .eq('id', documentoId)
      .single()

    if (queryError || !doc) {
      console.error('Documento não encontrado para exclusão:', queryError)
      return { success: false, error: 'DOCUMENTO_NAO_ENCONTRADO' }
    }

    // 2. Remover do storage
    const { error: storageError } = await supabase.storage
      .from('documentos-conhecimento')
      .remove([doc.caminho_storage])

    if (storageError) {
      console.warn('Aviso: Erro ao remover do storage (prosseguindo):', storageError)
    }

    // 3. Excluir do banco (cascade delete limpa base_conhecimento)
    const { error: deleteError } = await supabase
      .from('documentos_conhecimento')
      .delete()
      .eq('id', documentoId)

    if (deleteError) {
      console.error('Erro ao excluir documento do banco:', deleteError)
      return { success: false, error: `ERRO_BANCO: ${deleteError.message}` }
    }

    revalidatePath('/atendimento/conhecimento')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na action excluirDocumentoConhecimento:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
