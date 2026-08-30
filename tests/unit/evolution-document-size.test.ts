import { describe, expect, it } from 'vitest'
import { decodeEvolutionDocumentSize } from '@/lib/whatsapp/evolution-document-size'

describe('decodeEvolutionDocumentSize', () => {
  it.each([
    [128, 128],
    ['128', 128],
    [{ low: 128, high: 0, unsigned: false }, 128],
    [{ low: 0, high: 1, unsigned: true }, 4_294_967_296],
    [{ low: -1, high: 0, unsigned: true }, 4_294_967_295],
    [{ low: -1, high: 1, unsigned: false }, 8_589_934_591],
    [5 * 1024 * 1024 + 1, 5 * 1024 * 1024 + 1],
  ])('decodes %j as a positive safe integer', (input, expected) => {
    expect(decodeEvolutionDocumentSize(input)).toBe(expected)
  })

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '',
    '0',
    '-1',
    '+1',
    ' 1',
    '1 ',
    '01',
    '1.0',
    {},
    null,
    [],
    { low: 1, high: 0 },
    { low: 1, high: 0, unsigned: false, extra: true },
    { low: 1.5, high: 0, unsigned: false },
    { low: 1, high: 2 ** 31, unsigned: false },
    { low: -(2 ** 31) - 1, high: 0, unsigned: false },
    { low: 1, high: 0, unsigned: 'false' },
    { low: 0, high: 0, unsigned: true },
    { low: -1, high: -1, unsigned: false },
    { low: 0, high: 2 ** 21, unsigned: true },
    '9007199254740992',
  ])('rejects invalid or unsafe input %j', (input) => {
    expect(decodeEvolutionDocumentSize(input)).toBeNull()
  })

  it('requires Long fields to be own properties', () => {
    const inherited = Object.create({ low: 1, high: 0, unsigned: false })
    expect(decodeEvolutionDocumentSize(inherited)).toBeNull()
  })
})
