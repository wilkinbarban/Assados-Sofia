import { normalizeCuritibaPhone } from '@/lib/auth/phone'

export type TipoMensagemNormalizada =
  | 'TEXT'
  | 'INTERACTIVE_BUTTON'
  | 'INTERACTIVE_LIST'
  | 'INTERACTIVE_CAROUSEL'
  | 'MEDIA_IMAGE'
  | 'MEDIA_AUDIO'
  | 'MEDIA_DOCUMENT'
  | 'MEDIA_VIDEO'
  | 'UNKNOWN'

export interface MensagemNormalizada {
  messageId: string
  remoteJid: string
  phone: string
  pushName: string
  type: TipoMensagemNormalizada
  text?: string
  caption?: string
  interactiveId?: string
  mediaUrl?: string | null
  mediaType?: string | null
  raw: any
}

export interface AcaoInterativa {
  scope: 'cart' | 'product' | 'order' | 'human' | 'menu' | string
  action: 'add' | 'remove' | 'details' | 'view' | 'clear' | 'confirm' | 'request' | 'show' | string
  entityId?: string
}

/**
 * Normaliza qualquer payload de evento messages.upsert da Evolution API em uma estrutura limpa e determinística.
 */
export function normalizarMensagemEvolution(body: any): MensagemNormalizada | null {
  if (!body) return null

  const event = body.event || ''
  if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
    return null
  }

  const data = body.data
  if (!data || !data.key) return null

  // Ignorar mensagens enviadas pelo próprio bot/número
  if (data.key.fromMe) return null

  const messageId = data.key.id
  const remoteJid = data.key.remoteJid || ''
  const pushName = data.pushName || 'Cliente WhatsApp'

  // Ignorar grupos ou broadcast
  if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
    return null
  }

  const rawPhone = remoteJid.split('@')[0]
  const phone = normalizeCuritibaPhone(rawPhone) || rawPhone

  const messageContent = data.message || {}
  let type: TipoMensagemNormalizada = 'TEXT'
  let text: string | undefined = undefined
  let interactiveId: string | undefined = undefined
  let caption: string | undefined = undefined
  let mediaUrl: string | null = null
  let mediaType: string | null = null

  // 1. Botões de resposta direta (Buttons Response)
  if (messageContent.buttonsResponseMessage) {
    type = 'INTERACTIVE_BUTTON'
    interactiveId = messageContent.buttonsResponseMessage.selectedButtonId
    text = messageContent.buttonsResponseMessage.selectedDisplayText || interactiveId
  }
  // 2. Seleção em Lista Interativa (List Response)
  else if (messageContent.listResponseMessage) {
    type = 'INTERACTIVE_LIST'
    interactiveId = messageContent.listResponseMessage.singleSelectReply?.selectedRowId
    text = messageContent.listResponseMessage.title || messageContent.listResponseMessage.singleSelectReply?.title || interactiveId
  }
  // 3. Resposta de Carrossel / Native Flow Interativo
  else if (messageContent.interactiveResponseMessage) {
    type = 'INTERACTIVE_CAROUSEL'
    const nativeFlow = messageContent.interactiveResponseMessage.nativeFlowResponseMessage
    if (nativeFlow && nativeFlow.paramsJson) {
      try {
        const parsed = JSON.parse(nativeFlow.paramsJson)
        interactiveId = parsed.id || parsed.selectedId || parsed.buttonId
      } catch {
        interactiveId = nativeFlow.paramsJson
      }
    }
    text = messageContent.interactiveResponseMessage.body?.text || interactiveId
  }
  // 4. Template Button Reply
  else if (messageContent.templateButtonReplyMessage) {
    type = 'INTERACTIVE_BUTTON'
    interactiveId = messageContent.templateButtonReplyMessage.selectedId
    text = messageContent.templateButtonReplyMessage.selectedDisplayText || interactiveId
  }
  // 5. Mídias (Imagem, Áudio, Documento, Vídeo)
  else if (messageContent.imageMessage) {
    type = 'MEDIA_IMAGE'
    mediaType = 'image'
    caption = messageContent.imageMessage.caption
    mediaUrl = messageContent.imageMessage.url
    text = caption
  } else if (messageContent.audioMessage) {
    type = 'MEDIA_AUDIO'
    mediaType = 'audio'
    mediaUrl = messageContent.audioMessage.url
  } else if (messageContent.documentMessage) {
    type = 'MEDIA_DOCUMENT'
    mediaType = 'document'
    caption = messageContent.documentMessage.caption
    mediaUrl = messageContent.documentMessage.url
    text = caption
  } else if (messageContent.videoMessage) {
    type = 'MEDIA_VIDEO'
    mediaType = 'video'
    caption = messageContent.videoMessage.caption
    mediaUrl = messageContent.videoMessage.url
    text = caption
  }
  // 6. Texto Plano Simples ou Estendido
  else {
    type = 'TEXT'
    text = messageContent.conversation || messageContent.extendedTextMessage?.text || ''
  }

  return {
    messageId,
    remoteJid,
    phone,
    pushName,
    type,
    text: text?.trim(),
    caption: caption?.trim(),
    interactiveId: interactiveId?.trim(),
    mediaUrl,
    mediaType,
    raw: data,
  }
}

/**
 * Faz o parsing de identificadores estruturados de ação rápida (ex: cart:add:frango-assado).
 */
export function extrairAcaoInterativa(id?: string | null): AcaoInterativa | null {
  if (!id || typeof id !== 'string' || !id.includes(':')) {
    return null
  }

  const parts = id.split(':')
  const scope = parts[0]
  const action = parts[1]
  const entityId = parts.slice(2).join(':') || undefined

  if (!scope || !action) {
    return null
  }

  return {
    scope,
    action,
    entityId,
  }
}
