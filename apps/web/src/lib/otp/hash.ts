import crypto from 'node:crypto'

/**
 * Gera o hash criptográfico SHA-256 do código OTP.
 * Opcionalmente aceita um segredo/salt da aplicação.
 */
export function hashOtpCode(code: string, secret?: string): string {
  const normalizedCode = code.trim()
  if (secret) {
    return crypto.createHmac('sha256', secret).update(normalizedCode).digest('hex')
  }
  return crypto.createHash('sha256').update(normalizedCode).digest('hex')
}

/**
 * Validação do hash de forma segura contra timing attacks (tempo constante)
 */
export function verifyOtpHash(code: string, expectedHash: string, secret?: string): boolean {
  if (!code || !expectedHash) return false
  const calculatedHash = hashOtpCode(code, secret)

  try {
    const a = Buffer.from(calculatedHash, 'hex')
    const b = Buffer.from(expectedHash, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
