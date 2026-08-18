/**
 * Tipos e interfaces canônicas para o ciclo de vida de OTP multicanal
 */

export type OtpPurpose = 'signup' | 'recovery' | 'phone_change'

export type OtpChannel = 'telegram' | 'whatsapp'

export type OtpProvider = 'telegram' | 'evolution' | 'meta' | 'mock'

export interface OtpDeliveryResult {
  accepted: boolean
  channel: OtpChannel
  provider: OtpProvider
  externalId?: string | null
  failureCode?: string | null
}

export interface OtpChallenge {
  id: string
  telefone: string
  proposito: OtpPurpose
  expiraEm: string
  bloqueioReenvioAte?: string | null
}

export interface VerifyOtpResult {
  success: boolean
  clienteId?: string
  error?: string
}
