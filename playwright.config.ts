import { defineConfig } from '@playwright/test'

const port = 3100
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run build && rm -rf .next/standalone/.next/static .next/standalone/public && mkdir -p .next/standalone/.next && cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public && env -u FORCE_COLOR HOSTNAME=${host} PORT=${port} node .next/standalone/server.js`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
