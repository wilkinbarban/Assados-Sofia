import { defineConfig } from '@playwright/test'
import { localSupabaseEnv, recoverImagePersistenceFunction } from './tests/e2e/fixtures/local-supabase'

const port = 3100
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`
const supabaseEnv = localSupabaseEnv()
const webServerEnv = { ...process.env, ...supabaseEnv }
delete webServerEnv.NO_COLOR
recoverImagePersistenceFunction()

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run build && rm -rf apps/web/.next/standalone/apps/web/.next/static apps/web/.next/standalone/apps/web/public && mkdir -p apps/web/.next/standalone/apps/web/.next && cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static && cp -R apps/web/public apps/web/.next/standalone/apps/web/public && env -u FORCE_COLOR HOSTNAME=${host} PORT=${port} node apps/web/.next/standalone/apps/web/server.js`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    env: webServerEnv,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
