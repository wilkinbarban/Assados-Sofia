import { describe, expect, it } from 'vitest'
import {
  SOFIA_PACE_BASE_MS,
  SOFIA_PACE_MAX_MS,
  SOFIA_PACE_SCAN_LIMIT_UNITS,
  SOFIA_PACE_STEP_MS,
  SOFIA_PACE_TRIM_CODE_POINTS,
  countSofiaResponseUtf16Units,
  sofiaResponsePaceMinimumMs,
  trimSofiaResponseText,
} from '@/lib/sofia/response-pace'

describe('sofiaResponsePaceMinimumMs — delivered SQL contract', () => {
  it('derives the pace from trimmed UTF-16 unit length like public.sofia_response_pace_minimum_ms', () => {
    expect(sofiaResponsePaceMinimumMs('a'.repeat(100))).toBe(3000)
  })

  it('caps the pace at six seconds without exceeding it', () => {
    expect(sofiaResponsePaceMinimumMs('a'.repeat(500))).toBe(6000)
    expect(sofiaResponsePaceMinimumMs('a'.repeat(5000))).toBe(6000)
  })

  it('counts an astral emoji as two UTF-16 code units', () => {
    expect(countSofiaResponseUtf16Units('\u{1F600}')).toBe(2)
    expect(sofiaResponsePaceMinimumMs('\u{1F600}')).toBe(2020)
  })

  it('keeps the exported constants aligned with the SQL literals', () => {
    expect(SOFIA_PACE_BASE_MS).toBe(2000)
    expect(SOFIA_PACE_STEP_MS).toBe(10)
    expect(SOFIA_PACE_MAX_MS).toBe(6000)
    expect(SOFIA_PACE_SCAN_LIMIT_UNITS).toBe(500)
  })

  it('holds the floor for empty, whitespace-only and one-unit responses', () => {
    expect(sofiaResponsePaceMinimumMs('')).toBe(SOFIA_PACE_BASE_MS)
    expect(sofiaResponsePaceMinimumMs('   \t\r\n ')).toBe(SOFIA_PACE_BASE_MS)
    expect(sofiaResponsePaceMinimumMs('a')).toBe(2010)
    expect(sofiaResponsePaceMinimumMs('a'.repeat(99))).toBe(2990)
    expect(sofiaResponsePaceMinimumMs('a'.repeat(101))).toBe(3010)
  })

  it('counts a combining mark as one UTF-16 unit and the base character as another', () => {
    expect(countSofiaResponseUtf16Units('e\u0301')).toBe(2)
    expect(sofiaResponsePaceMinimumMs('e\u0301')).toBe(2020)
    expect(sofiaResponsePaceMinimumMs('a\u0301'.repeat(100))).toBe(4000)
  })

  it('trims NBSP and BOM like the SQL character class, keeping interior white space counted', () => {
    // Mirrors supabase/tests/sofia_pacing_core_b.sql: NBSP + 100 ASCII + BOM -> 3000.
    expect(sofiaResponsePaceMinimumMs('\u00a0' + 'a'.repeat(100) + '\ufeff')).toBe(3000)
    expect(sofiaResponsePaceMinimumMs('\ufeff\u00a0')).toBe(SOFIA_PACE_BASE_MS)
    expect(countSofiaResponseUtf16Units('a\u00a0b')).toBe(3)
    expect(sofiaResponsePaceMinimumMs('a\u00a0b')).toBe(2030)
  })

  it('does not trim non-whitespace zero-width characters', () => {
    expect(trimSofiaResponseText('\u200bconteúdo\u200b')).toBe('\u200bconteúdo\u200b')
    expect(countSofiaResponseUtf16Units('\u200b\u200b')).toBe(2)
  })

  it('clamps counting at the 500-unit scan limit', () => {
    expect(countSofiaResponseUtf16Units('a'.repeat(100000))).toBe(SOFIA_PACE_SCAN_LIMIT_UNITS)
    expect(sofiaResponsePaceMinimumMs('a'.repeat(100000))).toBe(SOFIA_PACE_MAX_MS)
  })

  it('matches native String#trim for every exported white-space code point', () => {
    const samples = SOFIA_PACE_TRIM_CODE_POINTS.map((codePoint) => String.fromCodePoint(codePoint))
    expect(samples).toHaveLength(25)

    for (const sample of samples) {
      const value = `${sample}pedido 42${sample}`
      expect(trimSofiaResponseText(value)).toBe(value.trim())
      expect(countSofiaResponseUtf16Units(value)).toBe('pedido 42'.length)
    }
  })
})
