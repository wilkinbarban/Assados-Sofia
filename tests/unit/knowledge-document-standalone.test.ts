import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

describe('knowledge document standalone dependencies', () => {
  it('copies workspace-local dependencies into the Docker builder', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8')

    expect(dockerfile).toContain('COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules')
  })

  it('uses a static mammoth import so Turbopack can resolve document parsing', async () => {
    const action = await readFile('apps/web/src/app/actions/conhecimento.ts', 'utf8')

    expect(action).toContain("import mammoth from 'mammoth'")
    expect(action).not.toContain("require('mammoth')")
  })

  it('externalizes and traces the workspace-scoped mammoth package', async () => {
    const config = await readFile('apps/web/next.config.ts', 'utf8')

    expect(config).toContain('serverExternalPackages: ["mammoth"]')
    expect(config).toContain('"node_modules/mammoth/**/*"')
  })
})
