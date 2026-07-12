import { describe, expect, it, vi } from 'vitest'
import {
  deriveSofiaChannelAvailability,
  parseBooleanConfigValue,
} from '@/lib/config/sistema'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

describe('Sofia global config helpers', () => {
  it.each([
    ['true', true],
    ['1', true],
    [' yes ', true],
    ['on', true],
    ['enabled', true],
    ['sim', true],
    ['false', false],
    ['0', false],
    [' no ', false],
    ['off', false],
    ['disabled', false],
    ['não', false],
  ])('parses boolean config value "%s"', (rawValue, expected) => {
    expect(parseBooleanConfigValue(rawValue)).toBe(expected)
  })

  it('falls back to the provided default for missing, blank, or unknown values', () => {
    expect(parseBooleanConfigValue(null, true)).toBe(true)
    expect(parseBooleanConfigValue(undefined, false)).toBe(false)
    expect(parseBooleanConfigValue('   ', false)).toBe(false)
    expect(parseBooleanConfigValue('maybe', true)).toBe(true)
  })

  it('orders channel availability with global off before schedule yellow', () => {
    expect(deriveSofiaChannelAvailability(false, true)).toBe('global_off')
    expect(deriveSofiaChannelAvailability(false, false)).toBe('global_off')
    expect(deriveSofiaChannelAvailability(true, false)).toBe('scheduled_pause')
    expect(deriveSofiaChannelAvailability(true, true)).toBe('operational')
  })
})
