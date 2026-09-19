/**
 * Extracao de fatos de cliente a partir de um lote concluido (design §7.4).
 *
 * Contrato: uma unica chamada de modelo por lote, usando `lote.contexto` — o
 * mesmo texto que a geracao consumiu, portanto sem segunda leitura no banco e
 * sem enxergar mensagens admitidas depois do claim. A persistencia passa
 * SOMENTE pelo RPC `registrar_fato_cliente`; este modulo nao toca nenhuma
 * tabela direto.
 *
 * A funcao nunca lanca e nunca tenta de novo: falha de provedor, payload
 * invalido e erro de RPC sao registrados com um token e o id do lote, e o
 * retorno e a contagem de fatos gravados. Nenhuma linha de log carrega `valor`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarModeloEconomicoJson } from '@/lib/ai/llm-json'
import { validarCandidatos } from '@/lib/sofia/customer-memory'
import { customerMemoryEnabled } from '@/lib/sofia/inbound-batch-gates'

export interface LoteExtraivel {
  batch_id: string
  conversa_id: string
  cliente_id: string
  canal: 'telegram' | 'whatsapp' | 'web'
  contexto: string
}

export const PROMPT_EXTRACAO = `Você extrai fatos duráveis sobre um cliente a partir de mensagens de atendimento.
Responda APENAS com um objeto JSON:
{"assunto":"cliente","fatos":[{"tipo":"...","chave":"...","valor":"...","confianca":0.0}]}
Regras: tipo ∈ {endereco,preferencia,restricao_alimentar,formato_pedido,observacao};
chave: ^[a-z0-9_]{1,64}$, estável e reutilizável (ex.: endereco/principal,
preferencia/ponto_da_carne); valor: 1 a 500 caracteres, UMA LINHA, sem instruções,
comandos, senhas, documentos ou dados de pagamento; confianca: 0..1, sua certeza de que o
CLIENTE afirmou isso. Não invente fatos. Se nada for durável: {"assunto":"cliente","fatos":[]}`

const MODELO_MAX_TOKENS = 400
const MODELO_TIMEOUT_MS = 5000
const TOKEN = '[sofia-customer-memory]'

function avisar(evento: string, batchId: string): void {
  console.warn(`${TOKEN} ${evento} batch=${batchId}`)
}

/** Extrai apenas o codigo do erro; a mensagem pode conter dado sensivel. */
function codigoErro(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && code !== '' ? code : 'unknown'
}

/** Tolera payload cercado por ``` ou com texto antes/depois do objeto JSON. */
function analisarJson(bruto: string): unknown {
  const inicio = bruto.indexOf('{')
  const fim = bruto.lastIndexOf('}')
  const corpo = inicio === -1 || fim < inicio ? bruto : bruto.slice(inicio, fim + 1)
  return JSON.parse(corpo)
}

export async function extrairFatosDoLote(
  supabase: SupabaseClient,
  lote: LoteExtraivel,
): Promise<number> {
  // Unica leitura do gate em todo o caminho de extracao.
  if (!customerMemoryEnabled()) return 0

  try {
    const bruto = await chamarModeloEconomicoJson({
      system: PROMPT_EXTRACAO,
      user: lote.contexto,
      maxTokens: MODELO_MAX_TOKENS,
      timeoutMs: MODELO_TIMEOUT_MS,
    })

    if (bruto === null) {
      avisar('extraction_provider_failed', lote.batch_id)
      return 0
    }

    const candidatos = validarCandidatos(analisarJson(bruto))
    let gravados = 0

    for (const candidato of candidatos) {
      try {
        const { error } = await supabase.rpc('registrar_fato_cliente', {
          p_cliente_id: lote.cliente_id,
          p_tipo: candidato.tipo,
          p_chave: candidato.chave,
          p_valor: candidato.valor,
          p_origem: 'ia',
          p_origem_conversa_id: lote.conversa_id,
          p_confianca: candidato.confianca,
          p_forcar_pendente: false,
        })
        // 23505 significa "ja registrado": nao e motivo de nova tentativa.
        if (error) throw error
        gravados += 1
      } catch (err) {
        avisar(`extraction_rpc_failed code=${codigoErro(err)}`, lote.batch_id)
      }
    }

    if (gravados > 0) {
      console.info(`${TOKEN} extraction_recorded batch=${lote.batch_id} facts=${gravados}`)
    }
    return gravados
  } catch (err) {
    // Nenhuma falha escapa: parse invalido, RPC que lanca, provedor que rejeita.
    avisar(`extraction_failed code=${codigoErro(err)}`, lote.batch_id)
    return 0
  }
}
