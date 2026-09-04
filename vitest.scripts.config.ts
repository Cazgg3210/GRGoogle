import { config } from 'dotenv'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests de los scripts operativos (importador legado). Cargan DATABASE_URL del .env raíz;
// las suites que requieren base de datos se omiten si la variable no existe.
config({ path: path.resolve(__dirname, '.env') })

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
