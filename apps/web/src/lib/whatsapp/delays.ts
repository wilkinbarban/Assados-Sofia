export const MIN_DELAY_MS = 1200
export const MAX_DELAY_MS = 4500
export const CHARS_PER_SECOND = 25

/**
 * Calcula o delay de digitação e composição humano orgânico para envio no WhatsApp
 * @param texto Texto da mensagem
 * @param maxJitterMs Variação aleatória em milissegundos (padrão 300ms)
 */
export function calcularDelayDigitacao(texto?: string | null, maxJitterMs = 300): number {
  if (!texto || typeof texto !== 'string') {
    return MIN_DELAY_MS
  }

  const length = texto.trim().length
  const estimatedTypingMs = Math.round((length / CHARS_PER_SECOND) * 1000)
  const baseDelay = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, MIN_DELAY_MS + estimatedTypingMs))

  if (maxJitterMs <= 0) {
    return baseDelay
  }

  const jitter = Math.floor(Math.random() * (maxJitterMs * 2 + 1)) - maxJitterMs
  const finalDelay = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, baseDelay + jitter))

  return finalDelay
}

/**
 * Aguarda um período seguro de delay de forma não bloqueante
 */
export async function aguardarDelayHumano(delayMs?: number): Promise<void> {
  const ms = delayMs ?? calcularDelayDigitacao()
  await new Promise((resolve) => setTimeout(resolve, ms))
}
