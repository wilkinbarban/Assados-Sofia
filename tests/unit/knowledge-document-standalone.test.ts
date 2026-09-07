import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

describe('knowledge document standalone dependencies', () => {
  it('traces mammoth and its workspace-scoped runtime dependencies', async () => {
    const config = await readFile('apps/web/next.config.ts', 'utf8')

    for (const dependency of [
      'mammoth',
      '@xmldom/xmldom',
      'argparse',
      'base64-js',
      'bluebird',
      'dingbat-to-unicode',
      'jszip',
      'lop',
      'path-is-absolute',
      'underscore',
      'xmlbuilder',
    ]) {
      expect(config).toContain(`"node_modules/${dependency}/**/*"`)
    }
  })
})
