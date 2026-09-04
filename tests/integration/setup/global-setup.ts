import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Global setup de las pruebas de integración: carga `.env.test` (si existe) y
 * luego `.env` de la raíz (sin sobreescribir variables ya definidas) y verifica
 * que DATABASE_URL apunte a una base de pruebas.
 *
 * Las migraciones se aplican fuera (`pnpm db:deploy` en CI, `pnpm db:migrate`
 * en local) para no ejecutar Prisma CLI dentro del runner.
 *
 * Sin dependencia de `dotenv`: el lector es mínimo (KEY=VALUE, comentarios con #,
 * comillas simples/dobles opcionales).
 */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export default function globalSetup(): void {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(here, '../../..')
  loadEnvFile(path.join(root, '.env.test'))
  loadEnvFile(path.join(root, '.env'))

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL no definida: las pruebas de integración requieren PostgreSQL')
  }
  if (process.env.NODE_ENV === 'production' || /prod/i.test(url)) {
    throw new Error('Las pruebas de integración no deben ejecutarse contra una base de producción')
  }
}
