import { config } from 'dotenv'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

// Carga el .env de la raíz del monorepo para todos los comandos de Prisma.
config({ path: path.resolve(process.cwd(), '../../.env') })

export default defineConfig({
  earlyAccess: true,
  schema: path.resolve(process.cwd(), '../../prisma/schema.prisma'),
  migrations: {
    path: path.resolve(process.cwd(), '../../prisma/migrations'),
    seed: 'tsx ../../prisma/seed.ts',
  },
})
