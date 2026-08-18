import { describe, expect, it } from 'vitest'
import {
  calcularDelayDigitacao,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
} from '@/lib/whatsapp/delays'

describe('WhatsApp Safe Delays: Simulação de Digitação Humana e Jitter', () => {
  it('calculates minimum delay for empty or short messages', () => {
    const delayEmpty = calcularDelayDigitacao('')
    expect(delayEmpty).toBeGreaterThanOrEqual(MIN_DELAY_MS - 300)
    expect(delayEmpty).toBeLessThanOrEqual(MIN_DELAY_MS + 500)

    const delayShort = calcularDelayDigitacao('Oi')
    expect(delayShort).toBeGreaterThanOrEqual(MIN_DELAY_MS - 300)
    expect(delayShort).toBeLessThanOrEqual(MIN_DELAY_MS + 600)
  })

  it('scales typing delay proportionally to message length', () => {
    const shortText = 'Olá! Tudo bem?'
    const longText = 'Olá! Nosso cardápio de hoje tem Costela Bovina 1kg por R$ 89,90, Picanha Especial por R$ 119,90, e Acompanhamentos de Feijão Tropeiro, Mandioca e Farofa da Casa! Aceitamos PIX, Cartão e Dinheiro.'

    const shortDelay = calcularDelayDigitacao(shortText, 0) // sem jitter para teste determinístico
    const longDelay = calcularDelayDigitacao(longText, 0)

    expect(longDelay).toBeGreaterThan(shortDelay)
    expect(longDelay).toBeLessThanOrEqual(MAX_DELAY_MS)
  })

  it('caps delay strictly at MAX_DELAY_MS (4500ms)', () => {
    const hugeText = 'A'.repeat(2000)
    const delay = calcularDelayDigitacao(hugeText, 0)
    expect(delay).toBe(MAX_DELAY_MS)
  })
})
