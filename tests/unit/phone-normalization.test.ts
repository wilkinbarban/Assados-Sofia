import { describe, expect, it } from 'vitest'
import { normalizeCuritibaPhone, isCuritibaPhone, maskPhone } from '@/lib/auth/phone'

describe('Normalização Canônica de Telefones de Curitiba (^55419[0-9]{8}$)', () => {
  describe('normalizeCuritibaPhone', () => {
    it('normalizes valid formatted numbers with DDI and spaces/dashes', () => {
      expect(normalizeCuritibaPhone('+55 (41) 99999-8888')).toBe('5541999998888')
      expect(normalizeCuritibaPhone('55 41 98765-4321')).toBe('5541987654321')
      expect(normalizeCuritibaPhone('+5541987654321')).toBe('5541987654321')
    })

    it('normalizes valid numbers without DDI (+55)', () => {
      expect(normalizeCuritibaPhone('(41) 99999-8888')).toBe('5541999998888')
      expect(normalizeCuritibaPhone('41999998888')).toBe('5541999998888')
      expect(normalizeCuritibaPhone('41 9 9999 8888')).toBe('5541999998888')
    })

    it('handles leading zeros from national dialing (e.g. 041999998888)', () => {
      expect(normalizeCuritibaPhone('041999998888')).toBe('5541999998888')
      expect(normalizeCuritibaPhone('041 99999-8888')).toBe('5541999998888')
    })

    it('normalizes 8-digit WhatsApp mobile numbers missing the 9th digit', () => {
      expect(normalizeCuritibaPhone('554187021106')).toBe('5541987021106')
      expect(normalizeCuritibaPhone('4187021106')).toBe('5541987021106')
      expect(normalizeCuritibaPhone('554198887777')).toBe('5541998887777')
    })

    it('rejects numbers from DDDs outside Curitiba (e.g. 11, 21, 42, 43)', () => {
      expect(normalizeCuritibaPhone('+55 (11) 99999-8888')).toBeNull()
      expect(normalizeCuritibaPhone('11999998888')).toBeNull()
      expect(normalizeCuritibaPhone('(42) 99999-8888')).toBeNull()
      expect(normalizeCuritibaPhone('5543999998888')).toBeNull()
    })

    it('rejects landlines (fixed-line phones not starting with 9)', () => {
      expect(normalizeCuritibaPhone('(41) 3333-4444')).toBeNull()
      expect(normalizeCuritibaPhone('554133334444')).toBeNull()
      expect(normalizeCuritibaPhone('4121234567')).toBeNull()
    })

    it('rejects incomplete, malformed, or invalid inputs', () => {
      expect(normalizeCuritibaPhone('')).toBeNull()
      expect(normalizeCuritibaPhone('   ')).toBeNull()
      expect(normalizeCuritibaPhone('419999')).toBeNull()
      expect(normalizeCuritibaPhone('abcdefghij')).toBeNull()
      expect(normalizeCuritibaPhone(null as any)).toBeNull()
      expect(normalizeCuritibaPhone(undefined as any)).toBeNull()
    })
  })

  describe('isCuritibaPhone', () => {
    it('returns true only for valid numbers', () => {
      expect(isCuritibaPhone('(41) 99999-8888')).toBe(true)
      expect(isCuritibaPhone('5541999998888')).toBe(true)
      expect(isCuritibaPhone('11999998888')).toBe(false)
      expect(isCuritibaPhone('554133334444')).toBe(false)
    })
  })

  describe('maskPhone for LGPD compliance', () => {
    it('masks middle digits to prevent PII exposure in logs', () => {
      const masked = maskPhone('5541999998888')
      expect(masked).toContain('****')
      expect(masked).not.toContain('99999')
      expect(masked.startsWith('5541')).toBe(true)
      expect(masked.endsWith('8888')).toBe(true)
    })

    it('handles unnormalized or short strings gracefully without throwing', () => {
      expect(maskPhone('')).toBe('')
      expect(maskPhone('123')).toBe('********')
    })
  })
})
