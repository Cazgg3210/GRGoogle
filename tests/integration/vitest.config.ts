import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Pruebas de integración (§36): repositorios Prisma, casos de uso con BD real,
 * webhook idempotente, jobs, importador legado. Requieren PostgreSQL accesible
 * en DATABASE_URL (docker compose en local; servicio postgres:16 en CI).
 *
 * Ejecutar: `pnpm test:integration` desde la raíz.
 */
const root = path.resolve(here, '../..')
const pkg = (name: string): string => path.join(root, 'packages', name, 'src', 'index.ts')

export default defineConfig({
  root: here,
  resolve: {
    // Los paquetes internos se consumen desde su código fuente (sin build).
    alias: {
      '@smlxl/domain': pkg('domain'),
      '@smlxl/contracts': pkg('contracts'),
      '@smlxl/config': pkg('config'),
      '@smlxl/observability': pkg('observability'),
      '@smlxl/database': pkg('database'),
      '@smlxl/application': pkg('application'),
      '@smlxl/application/testing': path.join(root, 'packages/application/src/testing/index.ts'),
      '@smlxl/google-workspace': pkg('google-workspace'),
      '@smlxl/ai': pkg('ai'),
      '@smlxl/auth': pkg('auth'),
    },
  },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    globalSetup: ['./setup/global-setup.ts'],
    setupFiles: ['./setup/setup-file.ts'],
    // Comparten la misma BD: sin paralelismo entre archivos.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: process.env.CI ? { junit: './test-results/junit.xml' } : undefined,
    env: {
      NODE_ENV: 'test',
      AUTH_DEV_BYPASS: 'false',
      GOOGLE_INTEGRATION_ENABLED: 'false',
      AI_PROCESSING_ENABLED: 'false',
      GMAIL_NOTIFICATIONS_ENABLED: 'false',
      SHEETS_SYNC_ENABLED: 'false',
    },
  },
})
