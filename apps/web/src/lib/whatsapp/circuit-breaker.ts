export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  failureThreshold?: number
  cooldownMs?: number
}

export class CircuitBreaker {
  private failureThreshold: number
  private cooldownMs: number
  private state: CircuitState = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5
    this.cooldownMs = options.cooldownMs ?? 60000 // 1 minuto padrão
  }

  public obterEstado(): CircuitState {
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.cooldownMs) {
      this.state = 'HALF_OPEN'
    }
    return this.state
  }

  public obterFalhas(): number {
    return this.failureCount
  }

  public reset(): void {
    this.state = 'CLOSED'
    this.failureCount = 0
    this.lastFailureTime = 0
  }

  public async executar<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.obterEstado()

    if (currentState === 'OPEN') {
      const tempoRestante = Math.ceil((this.cooldownMs - (Date.now() - this.lastFailureTime)) / 1000)
      throw new Error(
        `[CircuitBreaker] Circuit Breaker está ABERTO para proteção do WhatsApp. Requisição cancelada preventivamente. Tente novamente em ${tempoRestante}s.`
      )
    }

    try {
      const result = await fn()
      // Sucesso: resetar o circuito para CLOSED
      this.state = 'CLOSED'
      this.failureCount = 0
      return result
    } catch (error: any) {
      this.failureCount++
      this.lastFailureTime = Date.now()

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN'
        console.error(
          `[CircuitBreaker] Limite de falhas consecutivas atingido (${this.failureCount}/${this.failureThreshold}). Circuito ABERTO para o provedor de WhatsApp!`
        )
      }

      throw error
    }
  }
}

// Instância global para proteção do transporte WhatsApp
export const whatsappCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  cooldownMs: 60000,
})
