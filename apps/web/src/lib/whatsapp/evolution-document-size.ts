const SIGNED_INT32_MIN = -(2 ** 31)
const SIGNED_INT32_MAX = 2 ** 31 - 1
const MAX_SAFE_SIZE = BigInt(Number.MAX_SAFE_INTEGER)
const ZERO = BigInt(0)
const WORD_BITS = BigInt(32)

function isSignedInt32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= SIGNED_INT32_MIN && (value as number) <= SIGNED_INT32_MAX
}

function safePositiveNumber(value: bigint): number | null {
  if (value <= ZERO || value > MAX_SAFE_SIZE) return null
  return Number(value)
}

export function decodeEvolutionDocumentSize(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }

  if (typeof value === 'string') {
    if (!/^[1-9]\d*$/.test(value)) return null
    return safePositiveNumber(BigInt(value))
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null

  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== 3 || !ownKeys.includes('low') || !ownKeys.includes('high') || !ownKeys.includes('unsigned')) {
    return null
  }

  const record = value as Record<string, unknown>
  if (!isSignedInt32(record.low) || !isSignedInt32(record.high) || typeof record.unsigned !== 'boolean') {
    return null
  }

  const bits = (BigInt.asUintN(32, BigInt(record.high)) << WORD_BITS) | BigInt.asUintN(32, BigInt(record.low))
  const decoded = record.unsigned ? BigInt.asUintN(64, bits) : BigInt.asIntN(64, bits)
  return safePositiveNumber(decoded)
}
