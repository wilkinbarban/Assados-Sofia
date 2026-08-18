/**
 * Política de Complexidade e Validação de Senhas
 * Padrão: Mínimo 8 caracteres, pelo menos 1 maiúscula, 1 minúscula e 1 número.
 */

export const PASSWORD_POLICY_REQUIREMENTS = {
  minLength: 'A senha deve ter no mínimo 8 caracteres',
  uppercase: 'A senha deve conter pelo menos uma letra maiúscula',
  lowercase: 'A senha deve conter pelo menos uma letra minúscula',
  number: 'A senha deve conter pelo menos um número',
}

export interface PasswordValidationResult {
  valid: boolean
  errors?: string[]
}

/**
 * Valida se uma senha atende aos critérios obrigatórios de segurança
 */
export function validatePasswordPolicy(password: string | null | undefined): PasswordValidationResult {
  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      errors: [
        PASSWORD_POLICY_REQUIREMENTS.minLength,
        PASSWORD_POLICY_REQUIREMENTS.uppercase,
        PASSWORD_POLICY_REQUIREMENTS.lowercase,
        PASSWORD_POLICY_REQUIREMENTS.number,
      ]
    }
  }

  const errors: string[] = []

  if (password.length < 8) {
    errors.push(PASSWORD_POLICY_REQUIREMENTS.minLength)
  }

  if (!/[A-Z]/.test(password)) {
    errors.push(PASSWORD_POLICY_REQUIREMENTS.uppercase)
  }

  if (!/[a-z]/.test(password)) {
    errors.push(PASSWORD_POLICY_REQUIREMENTS.lowercase)
  }

  if (!/[0-9]/.test(password)) {
    errors.push(PASSWORD_POLICY_REQUIREMENTS.number)
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true }
}
