/**
 * Seed de datos demo (§37, §50). Idempotente y determinístico: cada entidad
 * tiene un id estable derivado de su clave natural y se hace upsert. Las
 * fechas son relativas a "ahora" para que la demo siempre luzca fresca.
 *
 * Ejecutar: pnpm db:seed
 */
import { createPrismaClient } from '../packages/database/src/index.js'
import { seedActionItems } from './seed/action-items.js'
import { seedCatalogs } from './seed/catalogs.js'
import { NOW, TZ } from './seed/helpers.js'
import { seedMeetings } from './seed/meetings.js'
import { seedSystem } from './seed/system.js'

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está definida')
  const db = createPrismaClient()
  const started = Date.now()
  try {
    console.log(`Seed SMLXL — referencia ${NOW.toISOString()} (${TZ})`)
    const catalogs = await seedCatalogs(db)
    const meetings = await seedMeetings(db, catalogs)
    const items = await seedActionItems(db, catalogs, meetings)
    const system = await seedSystem(db, catalogs, meetings, items)

    const summary: Record<string, number> = {
      areas: Object.keys(catalogs.areas).length,
      projects: Object.keys(catalogs.projects).length,
      users: Object.keys(catalogs.users).length,
      externalAssignees: Object.keys(catalogs.externals).length,
      ...meetings.counts,
      ...items.counts,
      ...system,
    }
    console.log('\nResumen del seed:')
    console.table(Object.entries(summary).map(([entidad, total]) => ({ entidad, total })))
    console.log(`Listo en ${((Date.now() - started) / 1000).toFixed(1)}s`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error('Seed falló:', err)
  process.exitCode = 1
})
