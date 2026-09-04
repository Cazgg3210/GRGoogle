/**
 * Lectura del workbook legado (§16.2). Sólo se leen las hojas fuente por área;
 * `Dashboard`, `Maestro` y `Listas` son calculadas y se ignoran siempre.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { normalizeText } from '@smlxl/domain'

export const SOURCE_SHEETS = [
  'Jurídico',
  'Ventas y Marketing',
  'Operaciones y Proyectos',
  'Admin y Finanzas',
  'Dirección General',
  'Captación de Capital',
  'Servicio al Cliente',
  'Externos',
] as const
export type SourceSheet = (typeof SOURCE_SHEETS)[number]

export const EXTERNAL_SHEET: SourceSheet = 'Externos'

export type ColumnKey =
  | 'id'
  | 'title'
  | 'owner'
  | 'department'
  | 'project'
  | 'meetingDate'
  | 'week'
  | 'priority'
  | 'status'
  | 'completed'
  | 'overdue'
  | 'comments'
  | 'company'
  | 'contact'

export interface RawRow {
  /** Nombre canónico de la hoja (según SOURCE_SHEETS). */
  sheet: SourceSheet
  /** Nombre tal como aparece en el archivo. */
  sheetOriginal: string
  /** Número de fila en Excel (1-based). */
  sourceRow: number
  cells: Partial<Record<ColumnKey, unknown>>
  /** Encabezado original → valor, para rawPayload. */
  raw: Record<string, unknown>
}

export interface SheetReadResult {
  sheet: SourceSheet
  sheetOriginal: string
  headerRow: number | null
  columns: Partial<Record<ColumnKey, number>>
  headers: string[]
  rows: RawRow[]
  blankRowsSkipped: number
  warnings: string[]
}

export interface WorkbookReadResult {
  file: string
  sheetsFound: string[]
  sheetsIgnored: string[]
  sheetsMissing: SourceSheet[]
  sheets: SheetReadResult[]
}

/** Mapea un encabezado normalizado a una columna conocida. */
export function classifyHeader(header: string): ColumnKey | null {
  const h = normalizeText(header)
  if (h === '') return null
  if (h === 'id' || h === 'no' || h === 'num' || h === 'folio') return 'id'
  if (h.includes('pendiente') || h === 'tarea' || h === 'actividad') return 'title'
  if (h.includes('responsable')) return 'owner'
  if (h.includes('departamento') || h === 'area') return 'department'
  if (h.includes('proyecto') || h.includes('frente')) return 'project'
  if (h.includes('fecha')) return 'meetingDate'
  if (h.startsWith('semana')) return 'week'
  if (h.includes('prioridad')) return 'priority'
  if (h === 'status' || h === 'estatus' || h === 'estado') return 'status'
  if (h.startsWith('completad')) return 'completed'
  if (h.startsWith('vencid')) return 'overdue'
  if (h.startsWith('comentario') || h.startsWith('observacion')) return 'comments'
  if (h.includes('empresa')) return 'company'
  if (h.includes('contacto')) return 'contact'
  return null
}

function isHeaderRow(cells: unknown[]): boolean {
  const normalized = cells.map((c) => normalizeText(typeof c === 'string' ? c : ''))
  return (
    normalized.some((c) => c.includes('pendiente')) &&
    normalized.some((c) => c.includes('responsable'))
  )
}

function cellIsBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/** Resuelve el nombre canónico de una hoja fuente (tolerante a acentos/mayúsculas). */
export function resolveSourceSheet(name: string): SourceSheet | null {
  const n = normalizeText(name)
  for (const s of SOURCE_SHEETS) if (normalizeText(s) === n) return s
  return null
}

export function readSheet(workbook: XLSX.WorkBook, sheetName: string): SheetReadResult | null {
  const canonical = resolveSourceSheet(sheetName)
  if (!canonical) return null
  const ws = workbook.Sheets[sheetName]
  if (!ws) return null
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  })
  const result: SheetReadResult = {
    sheet: canonical,
    sheetOriginal: sheetName,
    headerRow: null,
    columns: {},
    headers: [],
    rows: [],
    blankRowsSkipped: 0,
    warnings: [],
  }

  let headerIndex = -1
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] ?? []
    if (isHeaderRow(row)) {
      headerIndex = i
      break
    }
  }
  if (headerIndex < 0) {
    result.warnings.push(
      `No se encontró fila de encabezado (Pendiente + Responsable) en la hoja "${sheetName}"`,
    )
    return result
  }
  result.headerRow = headerIndex + 1
  const headerCells = (matrix[headerIndex] ?? []).map((c) =>
    typeof c === 'string' ? c.trim() : c === null ? '' : String(c),
  )
  result.headers = headerCells
  for (const [col, header] of headerCells.entries()) {
    const key = classifyHeader(header)
    if (key && result.columns[key] === undefined) result.columns[key] = col
  }
  for (const required of ['title', 'owner'] as const) {
    if (result.columns[required] === undefined)
      result.warnings.push(`La hoja "${sheetName}" no tiene columna reconocible para ${required}`)
  }

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? []
    if (row.every(cellIsBlank)) {
      result.blankRowsSkipped++
      continue
    }
    const cells: Partial<Record<ColumnKey, unknown>> = {}
    for (const [key, col] of Object.entries(result.columns) as Array<[ColumnKey, number]>) {
      cells[key] = row[col] ?? null
    }
    const raw: Record<string, unknown> = {}
    for (const [col, header] of headerCells.entries()) {
      if (header === '') continue
      raw[header] = row[col] ?? null
    }
    result.rows.push({ sheet: canonical, sheetOriginal: sheetName, sourceRow: i + 1, cells, raw })
  }
  return result
}

export function readWorkbookFromBook(workbook: XLSX.WorkBook, file: string): WorkbookReadResult {
  const sheetsFound = workbook.SheetNames.slice()
  const sheets: SheetReadResult[] = []
  const sheetsIgnored: string[] = []
  const matched = new Set<SourceSheet>()
  for (const name of sheetsFound) {
    const read = readSheet(workbook, name)
    if (!read) {
      sheetsIgnored.push(name)
      continue
    }
    if (matched.has(read.sheet)) {
      read.warnings.push(`Hoja duplicada para "${read.sheet}"; se procesa igualmente`)
    }
    matched.add(read.sheet)
    sheets.push(read)
  }
  const sheetsMissing = SOURCE_SHEETS.filter((s) => !matched.has(s))
  return { file, sheetsFound, sheetsIgnored, sheetsMissing, sheets }
}

export function readWorkbook(filePath: string): WorkbookReadResult {
  const absolute = path.resolve(filePath)
  const buffer = readFileSync(absolute)
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  return readWorkbookFromBook(workbook, path.basename(absolute))
}
