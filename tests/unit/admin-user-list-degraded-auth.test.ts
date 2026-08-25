import { describe, expect, it } from 'vitest'
import { consolidateAdminUsers } from '@/lib/admin/user-list'

describe('admin user list degraded auth', () => {
  it('keeps every profile visible when Auth Admin is temporarily unavailable', () => {
    const profiles = [
      { id: 'admin-1', nome: 'Ana', funcao: 'admin', ativo: true },
      { id: 'client-1', nome: 'Bruno', funcao: 'cliente', ativo: true },
    ]

    expect(consolidateAdminUsers(profiles, [], [{ id: 'client-1', telefone: '5541999999999' }]))
      .toEqual([
        { ...profiles[0], email: null, telefone: null },
        { ...profiles[1], email: null, telefone: '5541999999999' },
      ])
  })
})
