/**
 * Módulo Canônico de Normalização e Validação de Telefones
 * Regra Estrita: Celular de Curitiba / DDD 41 (^55419[0-9]{8}$)
 */

export const CURITIBA_PHONE_REGEX = /^55419[0-9]{8}$/

/**
 * Normaliza qualquer entrada de telefone para o padrão canônico brasileiro de Curitiba: 55419XXXXXXXX.
 * Retorna null se o número for inválido, pertencer a outro DDD ou for linha fixa.
 */
export function normalizeCuritibaPhone(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') {
    return null
  }

  // 1. Remover tudo o que não for dígito
  let digits = input.replace(/\D/g, '')

  // 2. Remover zeros à esquerda (comuns em discagem interurbana como 041...)
  digits = digits.replace(/^0+/, '')

  // 3. Se começar com DDI 55
  if (digits.startsWith('55')) {
    // 13 dígitos canônicos: 55 + 41 + 9 + 8 dígitos
    if (digits.length === 13 && digits.startsWith('55419')) {
      return digits
    }
    // 12 dígitos (formato WhatsApp onde o 9 inicial foi omitido: 55 + 41 + [6-9] + 7 dígitos)
    if (digits.length === 12 && digits.startsWith('5541')) {
      const firstLocalDigit = digits[4]
      if (['6', '7', '8', '9'].includes(firstLocalDigit)) {
        return `55419${digits.slice(4)}`
      }
    }
    return null
  }

  // 4. Se começar com DDD 41 (sem 55)
  if (digits.startsWith('41')) {
    // 11 dígitos canônicos: 41 + 9 + 8 dígitos
    if (digits.length === 11 && digits.startsWith('419')) {
      return `55${digits}`
    }
    // 10 dígitos (sem o 9 inicial do celular: 41 + [6-9] + 7 dígitos)
    if (digits.length === 10) {
      const firstLocalDigit = digits[2]
      if (['6', '7', '8', '9'].includes(firstLocalDigit)) {
        return `55419${digits.slice(2)}`
      }
    }
    return null
  }

  // Qualquer outro formato ou DDD diferente
  return null
}

/**
 * Retorna se a entrada é um telefone de Curitiba válido
 */
export function isCuritibaPhone(input: string | null | undefined): boolean {
  return normalizeCuritibaPhone(input) !== null
}

/**
 * Mascara o número de telefone para logs em conformidade com LGPD
 * Exemplo: '5541999998888' -> '55419****8888'
 */
export function maskPhone(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') {
    return ''
  }

  const clean = input.replace(/\D/g, '')
  if (clean.length < 8) {
    return '********'
  }

  const start = clean.slice(0, 5)
  const end = clean.slice(-4)
  return `${start}****${end}`
}
