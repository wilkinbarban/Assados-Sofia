import { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type TipoStatusWhatsApp = 'ativo' | 'opted_out' | 'bloqueado'
export type TipoContatoCliente = 'cliente' | 'candidato_emprego' | 'fornecedor' | 'outro'
export type TipoInscricaoCardapio = 'inscrito' | 'cancelado' | 'desconhecido'

export interface IntencaoMensagemContato {
  tipo: 'opt_out' | 'opt_in_cardapio' | 'candidato_emprego' | 'human_handoff' | 'conversa_regular'
  apenasCardapio?: boolean
  motivo?: string
}

/**
 * Normaliza o texto removendo acentos, pontuação excessiva e convertendo para minúsculas
 */
export function normalizeContactPhrase(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return ''

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/gi, ' ')       // remove pontuação
    .replace(/\s+/g, ' ')            // consolida espaços
    .toLowerCase()
    .trim()
}

// ─────────────────────────────────────────────────────────────
// 1. Padrões de Opt-Out (Descadastro e Cancelamento de Envios)
// ─────────────────────────────────────────────────────────────
const EXACT_OPTOUT_KEYWORDS = new Set([
  'stop',
  'parar',
  'sair',
  'cancelar',
  'baja',
  'descadastro',
  'descadastrar',
  'desinscrever',
  'pare',
  'cancelar inscricao',
])

const OPTOUT_PATTERNS = [
  /\b(stop|baja|descadastro|descadastrar|desinscrever)\b/i,
  /\bnao\s+me\s+(mande|mandem|envie|enviem|escreva|escrevam|ligue|liguem)\b/i,
  /\bnao\s+quero\s+(mais\s+)?(receber|mensagens|nada|contato)\b/i,
  /\b(favor|por\s+favor)?\s*nao\s+enviar\s+(o\s+)?(cardapio|menu|promocao|promocoes|mensagens)\b/i,
  /\bnao\s+quero\s+(o\s+)?(cardapio|menu|promocao|promocoes|mensagens)\b/i,
  /\bno\s+quiero\s+(mas\s+)?(recibir|mensajes|nada|contacto)\b/i,
  /\bno\s+me\s+escriban\b/i,
  /\b(cancelar|remover)\s+(minha\s+inscricao|meu\s+numero|meu\s+cadastro)\b/i,
  /\bpare\s+de\s+(mandar|enviar)\b/i,
]

const MENU_ONLY_OPTOUT_PATTERNS = [
  /\bnao\s+(quero|enviar|receber|quero\s+mais\s+receber|quero\s+receber)\s+(o\s+)?(cardapio|menu)\b/i,
  /\bcancelar\s+(o\s+)?(cardapio|menu)\b/i,
  /\bparar\s+(de\s+mandar\s+)?(o\s+)?(cardapio|menu)\b/i,
  /\bnao\s+enviar\s+(o\s+)?(cardapio|menu)\b/i,
]

export function containsOptOutPhrase(text: string | null | undefined): boolean {
  if (!text) return false
  const normalized = normalizeContactPhrase(text)
  if (!normalized) return false

  // Se a mensagem for exatamente uma palavra-chave de opt-out
  if (EXACT_OPTOUT_KEYWORDS.has(normalized)) return true

  // Proteção: não disparar em cancelamento de item/pedido ("cancelar o item", "cancelar meu pedido")
  if (normalized.includes('cancelar') && (normalized.includes('pedido') || normalized.includes('item') || normalized.includes('carne'))) {
    return false
  }

  // Proteção: não disparar em frases contextuais como "parar para almoçar"
  if (normalized.includes('parar para') || normalized.includes('parar no') || normalized.includes('parar na')) {
    return false
  }

  return OPTOUT_PATTERNS.some((pattern) => pattern.test(normalized))
}

// ─────────────────────────────────────────────────────────────
// 2. Padrões de Opt-In (Inscrição Explícita de Cardápio)
// ─────────────────────────────────────────────────────────────
const OPTIN_PATTERNS = [
  /\b(quero|gostaria\s+de)\s+receber\s+(o\s+)?(cardapio|menu)\b/i,
  /\b(1\s+)?sim\s+quero\s+receber\b/i,
  /\bquero\s+receber\s+(o\s+)?(cardapio|menu)\b/i,
  /\bpode\s+me\s+mandar\s+(o\s+)?(cardapio|menu)\s+todos\s+os\s+dias\b/i,
  /\bme\s+inscrever\s+no\s+cardapio\b/i,
  /\bquero\s+o\s+cardapio\s+diario\b/i,
]

export function containsOptInPhrase(text: string | null | undefined): boolean {
  if (!text) return false
  const normalized = normalizeContactPhrase(text)
  if (!normalized) return false

  // Evitar falsos positivos com perguntas simples sobre o cardápio
  if (normalized.includes('qual e o cardapio') || normalized.includes('qual o cardapio') || normalized.includes('manda o cardapio')) {
    return false
  }

  return OPTIN_PATTERNS.some((pattern) => pattern.test(normalized))
}

// ─────────────────────────────────────────────────────────────
// 3. Padrões de Candidato a Emprego / Currículo / Recrutamento
// ─────────────────────────────────────────────────────────────
const CANDIDATE_PATTERNS = [
  /\b(segue|enviando|anexo|mandando)\s+(meu\s+)?(curriculo|cv|resume)\b/i,
  /\bdeixar\s+(meu\s+)?(curriculo|cv)\b/i,
  /\b(tem|teria)\s+vaga\s+(de\s+emprego|para\s+trabalhar|de\s+garcom|de\s+churrasqueiro|aberta)\b/i,
  /\bestao\s+contratando\b/i,
  /\b(procuro|busco)\s+(vaga|emprego|trabalho)\b/i,
  /\btrabalhar\s+com\s+voces\b/i,
  /\bvaga\s+de\s+(atendente|garcom|churrasqueiro|auxiliar|cozinheiro)\b/i,
]

export function containsCandidatePhrase(text: string | null | undefined): boolean {
  if (!text) return false
  const normalized = normalizeContactPhrase(text)
  if (!normalized) return false

  // Excluir menção de vaga para carro / estacionamento
  if (normalized.includes('vaga para estacionar') || normalized.includes('vaga de carro') || normalized.includes('estacionamento')) {
    return false
  }

  return CANDIDATE_PATTERNS.some((pattern) => pattern.test(normalized))
}

// ─────────────────────────────────────────────────────────────
// 4. Padrões de Human Handoff (Solicitação de Atendente Humano)
// ─────────────────────────────────────────────────────────────
const HUMAN_HANDOFF_PATTERNS = [
  /\b(falar|conversar|passar|transferir|chamar)\s+(com\s+)?(um\s+|uma\s+)?(atendente|humano|pessoa|operador|vendedor|alguem)\b/i,
  /\b(preciso|gostaria|quero)\s+(de\s+)?(falar|conversar)\s+(com\s+)?(um\s+|uma\s+)?(atendente|humano|pessoa|operador|vendedor|alguem)\b/i,
  /\b(atendente|humano|suporte\s+humano|operador)\s*(por\s+favor)?$/i,
  /^(atendente|operador|humano)$/i,
  /\btem\s+alguem\s+ai\b/i,
  /\bhablar\s+con\s+(un\s+|una\s+)?(humano|persona|alguien|operador)\b/i,
]

export function containsHumanHandoffPhrase(text: string | null | undefined): boolean {
  if (!text) return false
  const normalized = normalizeContactPhrase(text)
  if (!normalized) return false

  // Proteção: não disparar em "vocês atendem no domingo?" ou "horário de atendimento"
  if (normalized.includes('horario de atendimento') || normalized.includes('voces atendem') || normalized.includes('dia que atendem')) {
    return false
  }

  return HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(normalized))
}

// ─────────────────────────────────────────────────────────────
// 5. Classificador de Intenção do Contato
// ─────────────────────────────────────────────────────────────
export function classificarIntencaoMensagem(text: string | null | undefined): IntencaoMensagemContato {
  if (containsOptOutPhrase(text)) {
    const normalized = normalizeContactPhrase(text)
    const apenasCardapio = MENU_ONLY_OPTOUT_PATTERNS.some((pattern) => pattern.test(normalized))
    return {
      tipo: 'opt_out',
      apenasCardapio,
      motivo: 'Solicitação do cliente via mensagem',
    }
  }

  if (containsHumanHandoffPhrase(text)) {
    return {
      tipo: 'human_handoff',
      motivo: 'Solicitação explícita de atendente humano',
    }
  }

  if (containsCandidatePhrase(text)) {
    return {
      tipo: 'candidato_emprego',
      motivo: 'Envio de currículo / interesse em vaga de emprego',
    }
  }

  if (containsOptInPhrase(text)) {
    return {
      tipo: 'opt_in_cardapio',
      motivo: 'Inscrição explícita no cardápio',
    }
  }

  return {
    tipo: 'conversa_regular',
  }
}

// ─────────────────────────────────────────────────────────────
// 6. Integração com Banco de Dados Supabase (RPCs e Atualizações)
// ─────────────────────────────────────────────────────────────

export async function processarStatusContatoInbound(
  supabase: SupabaseClient,
  clienteId: string,
  textoMensagem: string | null
): Promise<{
  intencao: IntencaoMensagemContato
  mensagemRespostaCurta?: string
  suprimirSofia: boolean
}> {
  const intencao = classificarIntencaoMensagem(textoMensagem)

  // 1. Atualizar timestamp de interação recebida
  if (typeof supabase.rpc === 'function') {
    try {
      await supabase.rpc('atualizar_interacao_cliente', {
        p_cliente_id: clienteId,
        p_direcao: 'inbound',
      })
    } catch (err) {
      console.warn('[Contact Status] Erro ao atualizar timestamp de interação recebida:', err)
    }
  }

  // 2. Tratar Opt-Out
  if (intencao.tipo === 'opt_out') {
    if (typeof supabase.rpc === 'function') {
      try {
        await supabase.rpc('registrar_opt_out_cliente', {
          p_cliente_id: clienteId,
          p_motivo: intencao.motivo || 'Opt-out solicitado',
          p_apenas_cardapio: Boolean(intencao.apenasCardapio),
        })
      } catch (err) {
        console.error('[Contact Status] Erro ao registrar opt-out no banco:', err)
      }
    }

    const mensagemRespostaCurta = intencao.apenasCardapio
      ? 'Entendido 👍 Não enviaremos mais o cardápio diário.'
      : 'Entendido 👍 Seu número foi descadastrado e você não receberá mais mensagens automáticas.'

    return {
      intencao,
      mensagemRespostaCurta,
      suprimirSofia: true,
    }
  }

  // 3. Tratar Human Handoff (Solicitação de Atendente Humano)
  if (intencao.tipo === 'human_handoff') {
    if (typeof supabase.rpc === 'function') {
      try {
        await supabase.rpc('silenciar_sofia_cliente', {
          p_cliente_id: clienteId,
          p_minutos: 60,
          p_motivo: 'handoff_phrase',
        })
      } catch (err) {
        console.error('[Contact Status] Erro ao silenciar Sofia para human handoff:', err)
      }
    }

    return {
      intencao,
      mensagemRespostaCurta: 'Um momento! 👍 Estou transferindo seu atendimento para nossa equipe humana. Logo alguém irá te responder por aqui.',
      suprimirSofia: true,
    }
  }

  // 4. Tratar Candidato a Emprego
  if (intencao.tipo === 'candidato_emprego') {
    try {
      await supabase
        .from('clientes')
        .update({
          tipo_contato: 'candidato_emprego',
          inscricao_cardapio: 'cancelado',
          data_atualizacao: new Date().toISOString(),
        })
        .eq('id', clienteId)
    } catch (err) {
      console.error('[Contact Status] Erro ao classificar candidato a emprego no banco:', err)
    }

    return {
      intencao,
      suprimirSofia: false,
    }
  }

  // 5. Tratar Opt-In de Cardápio
  if (intencao.tipo === 'opt_in_cardapio') {
    try {
      await supabase.rpc('registrar_opt_in_cardapio', {
        p_cliente_id: clienteId,
      })
    } catch (err) {
      console.error('[Contact Status] Erro ao registrar opt-in no banco:', err)
    }

    return {
      intencao,
      suprimirSofia: false,
    }
  }

  return {
    intencao,
    suprimirSofia: false,
  }
}
