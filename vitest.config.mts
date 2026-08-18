import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': path.resolve(import.meta.dirname, 'apps/web/src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'apps/web/src/app/api/webhooks/mercadopago/route.ts',
        'apps/web/src/app/api/webhooks/telegram/route.ts',
        'apps/web/src/app/api/webhooks/evolution/route.ts',
        'apps/web/src/app/api/webhooks/whatsapp/route.ts',
        'apps/web/src/lib/auth/safe-redirect.ts',
        'apps/web/src/lib/runtime/environment.ts',
      ],
      thresholds: {
        perFile: true,
        statements: 25,
        branches: 20,
        functions: 25,
        lines: 25,
      },
    },
  },
})
