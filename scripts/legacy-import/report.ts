/**
 * Reporte del importador legado (§16.8 fase 7 y 9): excepciones y comparación
 * contra el baseline observado en el Dashboard del workbook (§16.3).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DuplicateCandidate, DuplicateId } from './normalize.js'

export interface SheetStats {
  sheet: string
  sheetOriginal: string
  headerRow: number | null
  rowsRead: number
  blankRowsSkipped: number
  alreadyImported: number
  skippedNoTitle: number
  imported: number
  warnings: string[]
}

export interface BaselineMetrics {
  internalRows: number
  externalRows: number
  /** Filas internas con Completada=1 (flag numérico del legado). */
  completedFlag: number
  enProceso: number
  pendiente: number
  /** Filas con Vencido?=Sí (KPI manual del dashboard). */
  overdue: number
  /** completedFlag / internalRows * 100. */
  progressPct: number
}

/** Baseline del Dashboard legado (§16.3). No se asume como dato limpio. */
export const BASELINE: BaselineMetrics = {
  internalRows: 166,
  externalRows: 7,
  completedFlag: 99,
  enProceso: 31,
  pendiente: 41,
  overdue: 19,
  progressPct: 59.6,
}

export interface BaselineDifference {
  metric: keyof BaselineMetrics
  baseline: number
  observed: number
  delta: number
}

export interface BaselineComparison {
  baseline: BaselineMetrics
  observed: BaselineMetrics
  differences: BaselineDifference[]
  notes: string[]
}

export interface RowRef {
  sheet: string
  row: number
}

export interface ImportReport {
  file: string
  mode: 'dry-run' | 'commit'
  batchId: string | null
  startedAt: string
  finishedAt: string
  sheetsFound: string[]
  sheetsIgnored: string[]
  sheetsMissing: string[]
  sheets: SheetStats[]
  totals: {
    rowsRead: number
    internalRows: number
    externalRows: number
    alreadyImported: number
    skippedNoTitle: number
    imported: number
    actionItems: number
    meetings: number
    newProjects: number
    newExternalAssignees: number
    newAreas: number
    completionProposals: number
    comments: number
  }
  statusDistribution: Record<string, number>
  legacyStatusDistribution: Record<string, number>
  priorityDistribution: Record<string, number>
  unresolvedOwners: Array<{ owner: string; count: number; sheets: string[]; externalAssignee: 'existing' | 'new' }>
  newProjects: Array<{ name: string; alias: string; count: number }>
  newExternalAssignees: string[]
  newAreas: string[]
  meetings: Array<{ sheet: string; date: string; title: string; rows: number; existing: boolean }>
  contradictions: Array<RowRef & { legacyId: string | null; title: string; statusRaw: string | null; completedFlag: boolean | null; resolvedStatus: string }>
  semanticDuplicates: DuplicateCandidate[]
  duplicateIds: DuplicateId[]
  recurring: Array<RowRef & { title: string; frequency: string; hint: string }>
  blankFields: Record<string, number>
  invalidDates: Array<RowRef & { value: string }>
  unrecognizedStatuses: Array<RowRef & { value: string }>
  unrecognizedPriorities: Array<RowRef & { value: string }>
  rowsWithoutMeetingDate: number
  overdueFlagged: number
  baseline: BaselineComparison
  errors: string[]
}

export function compareWithBaseline(
  observed: BaselineMetrics,
  context: { contradictions: number; duplicateIds: number; semanticDuplicates: number; blankRowsSkipped: number; skippedNoTitle: number; alreadyImported: number },
): BaselineComparison {
  const differences: BaselineDifference[] = []
  for (const metric of Object.keys(BASELINE) as Array<keyof BaselineMetrics>) {
    const b = BASELINE[metric]
    const o = observed[metric]
    if (Math.abs(b - o) > 0.05) differences.push({ metric, baseline: b, observed: o, delta: Number((o - b).toFixed(1)) })
  }
  const notes: string[] = []
  if (differences.length === 0) {
    notes.push('Los conteos observados coinciden con el baseline del Dashboard legado.')
  } else {
    notes.push(
      'El baseline proviene de fórmulas del Dashboard legado sobre el archivo real; un archivo distinto (p. ej. el fixture de pruebas) produce cifras distintas por diseño.',
    )
  }
  if (context.contradictions > 0)
    notes.push(
      `${context.contradictions} fila(s) con Status y Completada contradictorios: el Dashboard cuenta "completadas" por el flag, el importador confía en Status (§16.4.2), por lo que "completedFlag" y la distribución de estados pueden divergir.`,
    )
  if (context.duplicateIds > 0)
    notes.push(`${context.duplicateIds} ID(s) legado repetidos: se importan todas las filas (legacyId no es único, §16.4.1); el Maestro puede contarlas una sola vez.`)
  if (context.semanticDuplicates > 0)
    notes.push(`${context.semanticDuplicates} posible(s) duplicado(s) semántico(s) reportados sin fusionar (§16.8 fase 6).`)
  if (context.blankRowsSkipped > 0 || context.skippedNoTitle > 0)
    notes.push(`Se omitieron ${context.blankRowsSkipped} fila(s) vacías y ${context.skippedNoTitle} sin texto de pendiente; el Dashboard puede contarlas si tienen ID.`)
  if (context.alreadyImported > 0)
    notes.push(`${context.alreadyImported} fila(s) ya importadas en corridas anteriores (idempotencia): las cifras observadas se calculan sobre todas las filas leídas, no sólo las nuevas.`)
  notes.push('"Vencido?" no se persiste: el vencimiento se deriva de dueDate (§16.6); el conteo sólo sirve de referencia.')
  return { baseline: BASELINE, observed, differences, notes }
}

function pct(n: number, d: number): string {
  return d === 0 ? '0.0%' : `${((n / d) * 100).toFixed(1)}%`
}

export function printReport(report: ImportReport): void {
  const log = console.log
  log('')
  log(`=== Importador legado — ${report.mode.toUpperCase()} — ${report.file} ===`)
  log(`Hojas fuente procesadas: ${report.sheets.map((s) => s.sheet).join(', ') || '(ninguna)'}`)
  if (report.sheetsIgnored.length) log(`Hojas ignoradas (calculadas/no fuente): ${report.sheetsIgnored.join(', ')}`)
  if (report.sheetsMissing.length) log(`Hojas fuente ausentes: ${report.sheetsMissing.join(', ')}`)
  if (report.batchId) log(`Lote: ${report.batchId}`)

  log('\nFilas por hoja:')
  console.table(
    report.sheets.map((s) => ({
      hoja: s.sheet,
      encabezado: s.headerRow ?? '-',
      leidas: s.rowsRead,
      vacias: s.blankRowsSkipped,
      sinTitulo: s.skippedNoTitle,
      yaImportadas: s.alreadyImported,
      importadas: s.imported,
    })),
  )

  log('Totales:')
  console.table([report.totals])

  log('Distribución de estados (canónico):')
  console.table(Object.entries(report.statusDistribution).map(([estado, total]) => ({ estado, total })))
  log('Distribución de Status legado (normalizado):')
  console.table(Object.entries(report.legacyStatusDistribution).map(([status, total]) => ({ status, total })))

  if (report.unresolvedOwners.length) {
    log('Responsables no resueltos como usuarios (→ ExternalAssignee):')
    console.table(report.unresolvedOwners)
  }
  if (report.newProjects.length) {
    log('Proyectos nuevos (alias creado):')
    console.table(report.newProjects)
  }
  if (report.newAreas.length) log(`Áreas nuevas: ${report.newAreas.join(', ')}`)
  if (report.meetings.length) {
    log('Reuniones legado (una por hoja+fecha):')
    console.table(report.meetings)
  }
  if (report.contradictions.length) {
    log('Contradicciones Status vs Completada (se confía en Status):')
    console.table(report.contradictions)
  }
  if (report.duplicateIds.length) {
    log('IDs legado repetidos (permitidos):')
    console.table(report.duplicateIds.map((d) => ({ legacyId: d.legacyId, ocurrencias: d.occurrences.map((o) => `${o.sheet}!${o.row}`).join(', ') })))
  }
  if (report.semanticDuplicates.length) {
    log('Posibles duplicados semánticos (no fusionados):')
    console.table(report.semanticDuplicates)
  }
  if (report.recurring.length) {
    log('Actividades recurrentes detectadas:')
    console.table(report.recurring)
  }
  if (Object.keys(report.blankFields).length) {
    log('Campos vacíos/0 por columna:')
    console.table(Object.entries(report.blankFields).map(([campo, total]) => ({ campo, total })))
  }
  if (report.invalidDates.length) {
    log('Fechas de junta no reconocidas:')
    console.table(report.invalidDates)
  }
  if (report.unrecognizedStatuses.length) {
    log('Status no reconocidos (→ PENDING):')
    console.table(report.unrecognizedStatuses)
  }
  if (report.unrecognizedPriorities.length) {
    log('Prioridades no reconocidas (→ MEDIUM):')
    console.table(report.unrecognizedPriorities)
  }
  log(`Filas con "Vencido?" marcado: ${report.overdueFlagged} (no se persiste; se deriva de dueDate)`)

  log('\nComparación contra baseline §16.3:')
  const b = report.baseline
  console.table(
    (Object.keys(b.baseline) as Array<keyof BaselineMetrics>).map((metric) => ({
      metrica: metric,
      baseline: b.baseline[metric],
      observado: b.observed[metric],
      delta: Number((b.observed[metric] - b.baseline[metric]).toFixed(1)),
    })),
  )
  log(`Avance observado: ${pct(b.observed.completedFlag, b.observed.internalRows)} (baseline ${b.baseline.progressPct}%)`)
  for (const n of b.notes) log(`  - ${n}`)

  if (report.errors.length) {
    log('\nErrores:')
    for (const e of report.errors) log(`  ! ${e}`)
  }
  log('')
}

export async function writeReportJson(report: ImportReport, filePath: string): Promise<string> {
  const absolute = path.resolve(filePath)
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, JSON.stringify(report, null, 2), 'utf8')
  return absolute
}
