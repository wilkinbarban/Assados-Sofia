export function safeInternalRedirect(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback
  }

  return next
}

export function getRoleRedirectPath(role: string | null | undefined, hasClientRecord = false): string {
  if (role === 'admin') return '/atendimento/admin'
  if (role === 'supervisor' || role === 'vendedor') return '/atendimento'
  return hasClientRecord ? '/cliente/chat' : '/cliente/verificar-telefone'
}
