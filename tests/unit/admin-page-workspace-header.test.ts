import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('apps/web/src/app/atendimento/admin/page.tsx', 'utf8')
const dashboardSource = readFileSync('apps/web/src/components/operator/AdminDashboard.tsx', 'utf8')

describe('admin page workspace shell', () => {
  it('owns the shared admin header and removes the legacy back header', () => {
    expect(source).toContain("import { OperatorWorkspaceHeader }")
    expect(source).toContain('<OperatorWorkspaceHeader')
    expect(source).toContain('active="admin"')
    expect(source).toContain('role={perfil.funcao}')
    expect(source).toContain('adminTab={initialTab}')
    expect(source).not.toContain('Voltar para o Atendimento')
    expect(dashboardSource).not.toContain('<OperatorWorkspaceHeader')
  })
})
