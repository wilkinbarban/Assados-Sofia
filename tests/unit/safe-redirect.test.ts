import { describe, expect, it } from 'vitest'
import { getRoleRedirectPath, safeInternalRedirect } from '@/lib/auth/safe-redirect'

describe('safeInternalRedirect', () => {
  it.each(['/cliente/chat', '/cliente/perfil?tab=pedidos'])('keeps internal application paths', (next) => {
    expect(safeInternalRedirect(next, '/cliente/chat')).toBe(next)
  })

  it.each([null, '', 'https://attacker.example', '//attacker.example', '/\\attacker.example'])('falls back for unsafe paths', (next) => {
    expect(safeInternalRedirect(next, '/cliente/chat')).toBe('/cliente/chat')
  })
})

describe('getRoleRedirectPath', () => {
  it.each([
    ['admin', false, '/atendimento/admin'],
    ['supervisor', false, '/atendimento'],
    ['vendedor', false, '/atendimento'],
    ['cliente', false, '/cliente/verificar-telefone'],
    ['cliente', true, '/cliente/chat'],
    [null, false, '/cliente/verificar-telefone'],
  ])('routes %s consistently', (role, hasClientRecord, expected) => {
    expect(getRoleRedirectPath(role, hasClientRecord)).toBe(expected)
  })
})
