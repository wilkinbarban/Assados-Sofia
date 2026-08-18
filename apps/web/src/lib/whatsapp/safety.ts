import { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

export type TipoCategoriaMensagem = 'REACTIVE' | 'ORDER' | 'SERVICE' | 'MARKETING' | 'CARDAPIO'

export interface ValidarEnvioWhatsAppInput {
  supabase?: SupabaseClient
  clienteId: string
  conversaId?: string
  texto?: string
  categoria?: TipoCategoriaMensagem
  origem?: 'ia' | 'operador'
}

export interface ValidarEnvioWhatsAppOutput {
  permitido: boolean
  motivo: string
  chaveDedup?: string
}

function getSupabase(supabase?: SupabaseClient): SupabaseClient {
  return supabase ?? createAdminClient()
}

/**
 * Gera a chave canônica de deduplicação diária de cardápio
 * Exemplo: 'cardapio:2026-08-16:cliente-uuid'
 */
export function gerarChaveDedupCardapio(clienteId: string, data = new Date()): string {
  const dataIso = data.toISOString().slice(0, 10)
  return `cardapio:${dataIso}:${clienteId}`
}

/**
 * Gera a chave canônica de deduplicação de conteúdo idêntico em 24h
 */
export function gerarChaveDedupConteudo(clienteId: string, texto: string): string {
  const hash = crypto.createHash('sha256').update(texto.trim()).digest('hex').substring(0, 16)
  return `msg:${clienteId}:${hash}`
}

export const MAX_PROACTIVE_PER_MINUTE = 20
let proactiveTimestamps: number[] = []

export function resetarContadoresJanelaProativa(): void {
  proactiveTimestamps = []
}

export function obterContadorJanelaProativa(): number {
  const agora = Date.now()
  proactiveTimestamps = proactiveTimestamps.filter((ts) => agora - ts < 60000)
  return proactiveTimestamps.length
}

/**
 * WhatsApp Safety Gate: Serviço central de validação prévia de envios
 * Garante que nenhuma mensagem automatizada ou indevida seja enviada para a Evolution API
 */
export async function validarEnvioWhatsAppSafety(
  input: ValidarEnvioWhatsAppInput
): Promise<ValidarEnvioWhatsAppOutput> {
  const supabase = getSupabase(input.supabase)
  const categoria = input.categoria || 'REACTIVE'
  const origem = input.origem || 'ia'

  // 1. Consultar estado do cliente no banco
  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id, status_whatsapp, tipo_contato, inscricao_cardapio, automacao_permitida')
    .eq('id', input.clienteId)
    .single()

  if (clienteError || !cliente) {
    return {
      permitido: false,
      motivo: 'CLIENTE_NAO_ENCONTRADO',
    }
  }

  // 2. Validações de Status e Consentimento
  if (cliente.status_whatsapp === 'opted_out') {
    return {
      permitido: false,
      motivo: 'CLIENTE_OPTED_OUT',
    }
  }

  if (cliente.status_whatsapp === 'bloqueado') {
    return {
      permitido: false,
      motivo: 'CLIENTE_BLOQUEADO',
    }
  }

  if (origem === 'ia' && !cliente.automacao_permitida) {
    return {
      permitido: false,
      motivo: 'AUTOMACAO_DESATIVADA_PARA_CLIENTE',
    }
  }

  // 3. Regra de Candidatos a Emprego (Sem Marketing / Cardápio)
  if (cliente.tipo_contato === 'candidato_emprego' && (categoria === 'MARKETING' || categoria === 'CARDAPIO')) {
    return {
      permitido: false,
      motivo: 'CANDIDATO_EMPREGO_SEM_MARKETING',
    }
  }

  // 4. Regra de Opt-In de Cardápio
  if (categoria === 'CARDAPIO' && cliente.inscricao_cardapio !== 'inscrito') {
    return {
      permitido: false,
      motivo: 'SEM_OPT_IN_CARDAPIO',
    }
  }

  // 5. Rate Limiting por Janela Temporal (Envios Proativos: MARKETING e CARDAPIO)
  if (categoria === 'MARKETING' || categoria === 'CARDAPIO') {
    const agora = Date.now()
    proactiveTimestamps = proactiveTimestamps.filter((ts) => agora - ts < 60000)

    if (proactiveTimestamps.length >= MAX_PROACTIVE_PER_MINUTE) {
      return {
        permitido: false,
        motivo: 'RATE_LIMIT_PROATIVO_EXCEDIDO',
      }
    }
  }

  // 6. Deduplicação do Cardápio Diário (máx 1 cardápio por dia)
  let chaveDedup: string | undefined
  if (categoria === 'CARDAPIO') {
    chaveDedup = gerarChaveDedupCardapio(input.clienteId)
    const { data: isNew, error: dedupError } = await supabase.rpc('verificar_e_registrar_dedup', {
      p_chave_dedup: chaveDedup,
      p_cliente_id: input.clienteId,
      p_tipo_mensagem: 'cardapio',
      p_conteudo_hash: input.texto ? crypto.createHash('sha256').update(input.texto).digest('hex') : null,
      p_ttl_segundos: 86400,
    })

    if (dedupError) {
      console.warn('[Safety Gate] Falha ao verificar deduplicação via RPC:', dedupError.message)
    } else if (isNew === false) {
      return {
        permitido: false,
        motivo: 'CARDAPIO_DUPLICADO_HOJE',
        chaveDedup,
      }
    }
  }

  // 7. Rate Limit: Máximo 2 mensagens consecutivas automatizadas da IA sem resposta do cliente
  if (origem === 'ia' && input.conversaId) {
    const { data: ultimasMensagens, error: msgError } = await supabase
      .from('mensagens')
      .select('remetente, data_criacao')
      .eq('conversa_id', input.conversaId)
      .order('data_criacao', { ascending: false })
      .limit(3)

    if (!msgError && ultimasMensagens && ultimasMensagens.length >= 2) {
      let consecutivasIa = 0
      for (const msg of ultimasMensagens) {
        if (msg.remetente === 'ia') {
          consecutivasIa++
        } else {
          break
        }
      }

      if (consecutivasIa >= 2 && categoria !== 'ORDER') {
        return {
          permitido: false,
          motivo: 'RATE_LIMIT_CONSECUTIVAS_EXCEDIDO',
        }
      }
    }
  }

  // Registrar envio na janela proativa se for marketing ou cardápio
  if (categoria === 'MARKETING' || categoria === 'CARDAPIO') {
    proactiveTimestamps.push(Date.now())
  }

  return {
    permitido: true,
    motivo: 'ALLOWED',
    chaveDedup,
  }
}
