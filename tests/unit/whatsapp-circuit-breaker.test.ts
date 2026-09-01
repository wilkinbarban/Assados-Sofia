import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CircuitBreaker } from '@/lib/whatsapp/circuit-breaker'

describe('WhatsApp Circuit Breaker: Proteção contra Pânico e Quedas de Provedor', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 50,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in CLOSED state and executes successful calls', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await breaker.executar(fn)
    expect(result).toBe('ok')
    expect(breaker.obterEstado()).toBe('CLOSED')
    expect(breaker.obterFalhas()).toBe(0)
  })

  it('opens circuit after reaching failureThreshold (3 failures)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Connection timeout'))

    // 1st failure
    await expect(breaker.executar(fn)).rejects.toThrow('Connection timeout')
    expect(breaker.obterEstado()).toBe('CLOSED')

    // 2nd failure
    await expect(breaker.executar(fn)).rejects.toThrow('Connection timeout')
    expect(breaker.obterEstado()).toBe('CLOSED')

    // 3rd failure -> trips circuit to OPEN
    await expect(breaker.executar(fn)).rejects.toThrow('Connection timeout')
    expect(breaker.obterEstado()).toBe('OPEN')

    // Subsequent calls are fast-failed without calling fn
    await expect(breaker.executar(fn)).rejects.toThrow(/Circuit Breaker está ABERTO/)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('transitions to HALF_OPEN after cooldownMs and resets to CLOSED on recovery', async () => {
    const failFn = vi.fn().mockRejectedValue(new Error('500 Error'))
    for (let i = 0; i < 3; i++) {
      await expect(breaker.executar(failFn)).rejects.toThrow()
    }
    expect(breaker.obterEstado()).toBe('OPEN')

    // Strictly before cooldown, the circuit remains OPEN.
    await vi.advanceTimersByTimeAsync(49)
    expect(breaker.obterEstado()).toBe('OPEN')

    // At cooldown, the next state check transitions the circuit to HALF_OPEN.
    await vi.advanceTimersByTimeAsync(1)
    expect(breaker.obterEstado()).toBe('HALF_OPEN')

    const successFn = vi.fn().mockResolvedValue('recovered')
    const res = await breaker.executar(successFn)

    expect(res).toBe('recovered')
    expect(breaker.obterEstado()).toBe('CLOSED')
    expect(breaker.obterFalhas()).toBe(0)
  })
})
