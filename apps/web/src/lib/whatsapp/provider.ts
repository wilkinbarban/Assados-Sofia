import { createAdminClient } from '@/lib/supabase/admin'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { cache } from 'react'

export type TipoCategoriaMensagem = 'REACTIVE' | 'ORDER' | 'SERVICE' | 'MARKETING' | 'CARDAPIO'

export interface EnviarMensagemPayload {
  texto?: string;
  anexoPath?: string;
  templateName?: string;
  templateParams?: any[];
  remetente?: 'operador' | 'ia';
  categoria?: TipoCategoriaMensagem;
}

export interface ResultadoEnvio {
  sucesso: boolean;
  whatsappMensagemId: string | null;
  mensagem?: any;
  error?: string;
  safetyBlocked?: boolean;
  motivo?: string;
}

export interface ProvedorWhatsApp {
  enviarMensagem(conversaId: string, payload: EnviarMensagemPayload): Promise<ResultadoEnvio>;
}

/**
 * Infere o tipo de mídia a partir da extensão do arquivo
 */
export function inferirTipoMidia(caminho: string): 'image' | 'audio' | 'document' {
  const ext = caminho.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return 'image'
  }
  if (['mp3', 'ogg', 'wav', 'aac', 'm4a'].includes(ext)) {
    return 'audio'
  }
  return 'document'
}

/**
 * Valida a janela de 24 horas e retorna o telefone do cliente e cliente Supabase Admin
 */
export async function validarJanelaEnvio(conversaId: string, payload: EnviarMensagemPayload) {
  const supabase = createAdminClient()

  // 1. Obter a conversa e o telefone do cliente
  const { data: conversa, error: conversaError } = await supabase
    .from('conversas')
    .select('id, cliente_id, clientes (telefone)')
    .eq('id', conversaId)
    .single()

  if (conversaError || !conversa) {
    throw new Error(`Conversa não encontrada: ${conversaError?.message || 'Sem dados'}`)
  }

  const telefone = (conversa as any).clientes?.telefone
  if (!telefone) {
    throw new Error('Telefone do cliente não encontrado para esta conversa.')
  }

  // 2. Obter a última mensagem enviada pelo cliente nesta conversa
  const { data: ultimaMensagemCliente, error: msgError } = await supabase
    .from('mensagens')
    .select('data_criacao')
    .eq('conversa_id', conversaId)
    .eq('remetente', 'cliente')
    .order('data_criacao', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (msgError) {
    throw new Error(`Erro ao buscar última mensagem do cliente: ${msgError.message}`)
  }

  // 3. Verificar a janela de 24 horas
  let janelaExcedida = true
  if (ultimaMensagemCliente) {
    const dataUltima = new Date(ultimaMensagemCliente.data_criacao)
    const agora = new Date()
    const diferencaHoras = (agora.getTime() - dataUltima.getTime()) / (1000 * 60 * 60)
    if (diferencaHoras <= 24) {
      janelaExcedida = false
    }
  }

  // 4. Aplicar restrição da janela de 24 horas
  if (janelaExcedida && !payload.templateName) {
    throw new Error('Janela de 24 horas excedida. É obrigatório o envio de um template homologado.')
  }

  return { telefone, supabase }
}

export const obterProvedorAtivo = cache(async (): Promise<ProvedorWhatsApp> => {
  let providerKey = await obterConfiguracaoSistema('PROVEDOR_WHATSAPP_ATIVO')
  if (!providerKey) {
    providerKey = await obterConfiguracaoSistema('WHATSAPP_PROVIDER')
  }

  const normalized = providerKey?.toLowerCase()

  if (normalized === 'evolution') {
    const { EvolutionProvider } = await import('./evolution')
    return new EvolutionProvider()
  }

  const { MetaProvider } = await import('./send')
  return new MetaProvider()
})
