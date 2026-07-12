import { describe, expect, it } from 'vitest'
import { containsWhatsAppHandoffPhrase, normalizeHandoffText } from '@/lib/whatsapp/sofia-control'

describe('WhatsApp Sofia handoff helpers', () => {
  it('normalizes case, whitespace, and accents', () => {
    expect(normalizeHandoffText('  ÁTÉNDÉNTÉ  ')).toBe('atendente')
  })

  it('detects handoff requests for supported phrases', () => {
    expect(containsWhatsAppHandoffPhrase('Quero falar com um humano')).toBe(true)
    expect(containsWhatsAppHandoffPhrase('Preciso de um atendente')).toBe(true)
    expect(containsWhatsAppHandoffPhrase('Quiero hablar con alguien')).toBe(true)
  })

  it('does not detect unrelated or empty messages as handoff requests', () => {
    expect(containsWhatsAppHandoffPhrase('Quero ver o cardápio')).toBe(false)
    expect(containsWhatsAppHandoffPhrase('')).toBe(false)
    expect(containsWhatsAppHandoffPhrase(null)).toBe(false)
  })
})
