/**
 * CLI del importador legado (§16.8).
 *
 *   pnpm legacy:import --file ./imports/01_SMLXL_Maestro_de_Tareas_AGOSTO_2026.xlsx --dry-run
 *   pnpm legacy:import --file ./imports/01_SMLXL_Maestro_de_Tareas_AGOSTO_2026.xlsx --commit [--report ./imports/report.json]
 */
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { featureFlagsFromEnv, loadEnv } from '@smlxl/config'
import { createPrismaClient, type RepositoryDefaults } from '@smlxl/database'
import { runLegacyImport, type ImportMode } from './importer.js'
import { readWorkbook } from './reader.js'
import { printReport, writeReportJson } from './report.js'

function usage(): void {
  console.log(`Uso: pnpm legacy:import --file <ruta.xlsx> (--dry-run | --commit) [--report <salida.json>]

  --file, -f     Workbook legado (.xlsx)
  --dry-run      Sólo analiza y reporta; no escribe nada en la base (por defecto)
  --commit       Importa dentro de una transacción
  --report, -r   Escribe el reporte JSON en la ruta indicada
  --help, -h     Esta ayuda`)
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', short: 'f' },
      'dry-run': { type: 'boolean', default: false },
      commit: { type: 'boolean', default: false },
      report: { type: 'string', short: 'r' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  })
  if (values.help) {
    usage()
    return 0
  }
  if (!values.file) {
    usage()
    console.error('\nFalta --file')
    return 1
  }
  if (values.commit && values['dry-run']) {
    console.error('Indica sólo uno: --dry-run o --commit')
    return 1
  }
  if (!existsSync(values.file)) {
    console.error(`No existe el archivo: ${values.file}`)
    return 1
  }
  const mode: ImportMode = values.commit ? 'commit' : 'dry-run'

  const env = loadEnv()
  const defaults: RepositoryDefaults = {
    featureFlags: featureFlagsFromEnv(env),
    companyTimezone: env.COMPANY_TIMEZONE,
    companyDomain: env.GOOGLE_WORKSPACE_DOMAIN,
  }

  const workbook = readWorkbook(values.file)
  const client = createPrismaClient(env.DATABASE_URL)
  try {
    const { report } = await runLegacyImport(client, defaults, workbook, { mode })
    printReport(report)
    if (values.report) {
      const written = await writeReportJson(report, values.report)
      console.log(`Reporte JSON escrito en ${written}`)
    }
    if (mode === 'dry-run') console.log('Modo dry-run: no se escribió nada en la base de datos.')
    else
      console.log(
        `Modo commit: ${report.totals.imported} fila(s) importadas${report.batchId ? ` (lote ${report.batchId})` : ' (sin cambios)'}.`,
      )
    return report.errors.length > 0 ? 2 : 0
  } finally {
    await client.$disconnect()
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err: unknown) => {
    console.error('Importación fallida:', err)
    process.exitCode = 1
  })
