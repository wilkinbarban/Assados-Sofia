import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const separator = line.indexOf('=')
  process.env[line.slice(0, separator)] ??= line.slice(separator + 1)
}
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:8000'
delete process.env.NO_COLOR
delete process.env.FORCE_COLOR

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results-user',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3020',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'production-chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
