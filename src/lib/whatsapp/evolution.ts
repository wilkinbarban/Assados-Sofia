import { ProvedorWhatsApp, EnviarMensagemPayload, ResultadoEnvio, validarJanelaEnvio, inferirTipoMidia } from './provider'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { createAdminClient } from '@/lib/supabase/admin'

function isEvolutionMockMode(apiUrl: string | null, apiKey: string | null, instanceName: string | null): boolean {
  if (!apiUrl || !apiKey || !instanceName) return true
  
  const placeholders = [
    'placeholder',
    'your_evolution_api_url',
    'your_evolution_api_key',
    'your_evolution_instance_name',
    'your_api_key',
    'your_instance_name',
    'insert_here',
    'your-'
  ]

  const lowerUrl = apiUrl.toLowerCase()
  const lowerKey = apiKey.toLowerCase()
  const lowerInstance = instanceName.toLowerCase()

  return placeholders.some(p => lowerUrl.includes(p) || lowerKey.includes(p) || lowerInstance.includes(p))
}

/**
 * Envia uma mensagem utilizando a Evolution API (texto ou mídia)
 */
export async function enviarMensagemEvolution(
  conversaId: string,
  payload: EnviarMensagemPayload
): Promise<ResultadoEnvio> {
  // 1. Obter configurações da Evolution API
  const apiUrl = await obterConfiguracaoSistema('EVOLUTION_API_URL')
  const apiKey = await obterConfiguracaoSistema('EVOLUTION_API_KEY')
  const instanceName = await obterConfiguracaoSistema('EVOLUTION_INSTANCE_NAME')

  const mockMode = isEvolutionMockMode(apiUrl, apiKey, instanceName)
  const supabase = createAdminClient()

  // 2. Validar janela de envio e obter telefone do cliente
  const { telefone } = await validarJanelaEnvio(conversaId, payload)

  let whatsappMensagemId = ''
  let conteudoFinal = payload.texto || null

  if (payload.templateName) {
    const paramsStr = payload.templateParams && payload.templateParams.length > 0
      ? ` - ${payload.templateParams.join(', ')}`
      : ''
    conteudoFinal = `[Template: ${payload.templateName}]${paramsStr}`
  }

  if (mockMode) {
    const mockIdSuffix = Math.random().toString(36).substring(2).toUpperCase()
    whatsappMensagemId = `evolution-${mockIdSuffix}`
    console.warn(`[Evolution Send Utility] Rodando em modo MOCK. Mensagem simulada com ID: ${whatsappMensagemId}`)
  } else {
    // Modo Real: Enviar HTTP Request para a Evolution API
    const cleanUrl = apiUrl!.replace(/\/$/, '')
    let url = ''
    let bodyData: any = {}

    if (payload.anexoPath) {
      // Obter URL assinada
      const { data: signedData, error: signError } = await supabase
        .storage
        .from('chat-midias')
        .createSignedUrl(payload.anexoPath, 3600)

      if (signError || !signedData) {
        throw new Error(`Erro ao gerar URL assinada para o anexo: ${signError?.message || 'Sem URL'}`)
      }

      const tipoMidia = inferirTipoMidia(payload.anexoPath)
      const filename = payload.anexoPath.split('/').pop() || 'arquivo'

      url = `${cleanUrl}/message/sendMedia/${instanceName}`
      bodyData = {
        number: telefone,
        caption: payload.texto || '',
        mediaMessage: {
          mediatype: tipoMidia,
          media: signedData.signedUrl,
          fileName: filename
        }
      }
    } else {
      // Mensagem de Texto (ou Template formatado como texto)
      url = `${cleanUrl}/message/sendText/${instanceName}`
      bodyData = {
        number: telefone,
        options: {
          delay: 1200,
          presence: 'composing'
        },
        text: conteudoFinal || '',
        textMessage: {
          text: conteudoFinal || ''
        }
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': apiKey!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyData)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Erro na Evolution API: ${response.statusText}. Detalhes: ${JSON.stringify(errorData)}`)
    }

    const responseData = await response.json()
    whatsappMensagemId = responseData.key?.id

    if (!whatsappMensagemId) {
      throw new Error('ID da mensagem não retornado pela Evolution API.')
    }
  }

  // 3. Salvar no banco de dados mensagens
  const remetente = payload.remetente || 'ia'
  const { data: novaMensagem, error: insertError } = await supabase
    .from('mensagens')
    .insert({
      conversa_id: conversaId,
      remetente,
      conteudo: conteudoFinal,
      url_anexo: payload.anexoPath || null,
      whatsapp_mensagem_id: whatsappMensagemId
    })
    .select()
    .single()

  if (insertError) {
    throw new Error(`Erro ao salvar mensagem no banco de dados: ${insertError.message}`)
  }

  return {
    sucesso: true,
    whatsappMensagemId,
    mensagem: novaMensagem
  }
}

export class EvolutionProvider implements ProvedorWhatsApp {
  async enviarMensagem(conversaId: string, payload: EnviarMensagemPayload): Promise<ResultadoEnvio> {
    return enviarMensagemEvolution(conversaId, payload)
  }
}
