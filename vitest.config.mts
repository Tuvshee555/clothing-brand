import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': r('./src'),
      // `server-only` throws outside the React server runtime; tests call services directly.
      'server-only': r('./tests/stubs/server-only.ts'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          // Services get their own database handle; this only satisfies modules that
          // build the app-wide pool at import time (it never connects).
          env: { DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused', NODE_ENV: 'test' },
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
})
