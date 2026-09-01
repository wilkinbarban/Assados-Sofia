import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8')

describe('production web image bundler', () => {
  it('uses the supported Next 16 webpack fallback instead of the reproducibly crashing Turbopack build', () => {
    expect(dockerfile).toContain('RUN npm run build --workspace @asados/web -- --webpack')
  })
})
