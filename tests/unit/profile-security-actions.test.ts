import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const rpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { atualizarPerfilUsuario } from '@/app/actions/admin'
import { atualizarPerfilProprio } from '@/app/actions/perfil'

const migration = readFileSync(join(
  process.cwd(), 'supabase/migrations/20260716145744_profile_access_hardening.sql'
), 'utf8')

describe('profile security actions', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ error: null })
  })

  it('uses the session-bound managed RPC without accepting an actor', async () => {
    await expect(atualizarPerfilUsuario('target-id', 'supervisor', false)).resolves.toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('gerenciar_funcao_status_perfil', {
      p_usuario_alvo_id: 'target-id', p_funcao: 'supervisor', p_ativo: false,
    })
  })

  it('uses the audited self-service RPC for the approved name column', async () => {
    await expect(atualizarPerfilProprio('Operator Name')).resolves.toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('atualizar_nome_perfil', { p_nome: 'Operator Name' })
  })

  it('preserves action validation and database error contracts', async () => {
    await expect(atualizarPerfilUsuario('target-id', 'owner', true)).resolves.toEqual({
      success: false, error: 'FUNCAO_INVALIDA',
    })
    await expect(atualizarPerfilProprio('   ')).resolves.toEqual({
      success: false, error: 'NOME_INVALIDO',
    })
    rpc.mockResolvedValueOnce({ error: { message: 'HIERARQUIA_PERFIL_NEGADA' } })
    await expect(atualizarPerfilUsuario('target-id', 'admin', true)).resolves.toEqual({
      success: false, error: 'HIERARQUIA_PERFIL_NEGADA',
    })
  })

  it('defines an admin-only hierarchy above supervisors', () => {
    expect(migration).toMatch(/v_actor_role\s*<>\s*'admin'[\s\S]*p_funcao not in \('vendedor','cliente'\)/)
    expect(migration).toMatch(/v_actor_role\s*<>\s*'admin'[\s\S]*v_target\.funcao not in \('vendedor','cliente'\)/)
  })

  it('locks actor and target in deterministic order before authorization', () => {
    const lock = migration.indexOf('order by id for update')
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(migration.indexOf("message = 'USUARIO_NAO_AUTORIZADO'"))
    expect(migration).toContain('where id in (v_actor, p_usuario_alvo_id)')
  })

  it('makes profile policy recovery and audit insert privileges deterministic', () => {
    expect(migration).toContain('drop policy if exists "Profile owners update approved columns"')
    expect(migration).toContain('drop policy if exists "Inserção de logs por admin e supervisor"')
    expect(migration).toMatch(/revoke insert, update, delete, truncate on public\.logs_auditoria/)
  })
})
