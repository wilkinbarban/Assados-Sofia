/**
 * Memoria de cliente — validacao pura de fatos (design §6.2).
 *
 * Este modulo nao faz I/O e nao registra log. Ele e o pre-filtro em JS: a
 * autoridade de armazenamento continua sendo a constraint do banco. Valores
 * invalidos sao DESCARTADOS, nunca truncados — um valor cortado seria uma
 * mentira sobre o que o cliente disse.
 */

export const FATO_TIPOS = [
  'endereco',
  'preferencia',
  'restricao_alimentar',
  'formato_pedido',
  'observacao',
] as const

export type FatoTipo = (typeof FATO_TIPOS)[number]

/** Mesma regex da constraint `ck_fatos_cliente_chave`. */
export const FATO_CHAVE_PATTERN = /^[a-z0-9_]{1,64}$/

/** Mesmo limite da constraint `valor_tamanho` (`char_length(valor) <= 500`). */
export const FATO_VALOR_MAX_CARACTERES = 500

/** Teto de candidatos persistidos por lote. */
export const FATOS_MAX_POR_LOTE = 10

export interface FatoCandidato {
  tipo: FatoTipo
  chave: string
  valor: string
  confianca: number
}

const INVISIVEIS_BIDI = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g
const CONTROLE = /[\u0000-\u001F\u007F]/
const QUEBRA_OU_TAB = /[\r\n\t]+/g
const ESPACOS_REPETIDOS = / {2,}/g

/**
 * Normaliza um `valor` vindo do modelo. Devolve `null` quando o valor precisa
 * ser descartado (nao-string, vazio, acima de 500 caracteres ou com caractere
 * de controle remanescente).
 */
export function normalizarValor(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null

  const valor = bruto
    .normalize('NFKC')
    .replace(INVISIVEIS_BIDI, '')
    .replace(QUEBRA_OU_TAB, ' ')
    .replace(ESPACOS_REPETIDOS, ' ')
    .trim()

  if (valor === '') return null
  if (valor.length > FATO_VALOR_MAX_CARACTERES) return null
  if (CONTROLE.test(valor)) return null
  return valor
}

function comoRegistro(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function candidatoValido(item: Record<string, unknown>): FatoCandidato | null {
  if (!FATO_TIPOS.includes(item.tipo as FatoTipo)) return null
  if (typeof item.chave !== 'string' || !FATO_CHAVE_PATTERN.test(item.chave)) return null
  const valor = normalizarValor(item.valor)
  if (valor === null) return null
  if (typeof item.confianca !== 'number' || !Number.isFinite(item.confianca)) return null
  if (item.confianca < 0 || item.confianca > 1) return null
  return { tipo: item.tipo as FatoTipo, chave: item.chave, valor, confianca: item.confianca }
}

/**
 * Valida a resposta do modelo. Um assunto diferente de `cliente` descarta a
 * resposta inteira; candidatos invalidos sao descartados individualmente e os
 * irmaos validos sobrevivem. Deduplica por `(tipo, chave)` mantendo o primeiro e
 * limita o lote a {@link FATOS_MAX_POR_LOTE} candidatos.
 */
export function validarCandidatos(resposta: unknown): FatoCandidato[] {
  const corpo = comoRegistro(resposta)
  if (!corpo || corpo.assunto !== 'cliente' || !Array.isArray(corpo.fatos)) return []

  const vistos = new Set<string>()
  const validos: FatoCandidato[] = []

  for (const bruto of corpo.fatos) {
    if (validos.length >= FATOS_MAX_POR_LOTE) break
    const item = comoRegistro(bruto)
    if (!item) continue
    const candidato = candidatoValido(item)
    if (!candidato) continue
    const chaveComposta = `${candidato.tipo}|${candidato.chave}`
    if (vistos.has(chaveComposta)) continue
    vistos.add(chaveComposta)
    validos.push(candidato)
  }

  return validos
}
