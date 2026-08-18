export interface SafeRetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  backoffFactor?: number
}

/**
 * Determina se o erro é transiente e elegível para reintento seguro
 * Erros 4xx (400, 401, 403, 404, 422) NÃO são reintentados
 */
function isRetryableError(error: any): boolean {
  if (!error) return false
  const msg = (error.message || String(error)).toLowerCase()

  // Erros de cliente HTTP 4xx não devem ser reintentados
  if (/400|401|403|404|422|bad request|unauthorized|forbidden|not found/i.test(msg)) {
    return false
  }

  // Erros transientes de servidor (5xx) e de rede / timeout são elegíveis
  return /500|502|503|504|econnreset|etimedout|econnrefused|network|timeout|fetch failed/i.test(msg)
}

/**
 * Executa uma operação assíncrona com reintentos exponenciais seguros limitados
 * Evita loops infinitos e garante proteção do número de WhatsApp
 */
export async function withSafeRetry<T>(
  fn: () => Promise<T>,
  options: SafeRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2
  const baseDelayMs = options.baseDelayMs ?? 1000
  const backoffFactor = options.backoffFactor ?? 2

  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (error: any) {
      attempt++

      if (attempt > maxRetries || !isRetryableError(error)) {
        throw error
      }

      const delay = baseDelayMs * Math.pow(backoffFactor, attempt - 1)
      console.warn(`[Safe Retry] Tentativa ${attempt}/${maxRetries} falhou com erro transiente. Aguardando ${delay}ms...`, error.message)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
