/**
 * Normalización de filas legadas (§16.4, §16.5). Aplica exclusivamente reglas
 * del dominio (normalizeText, isBlankLike, normalizePriority,
 * initialStatusFromLegacy, detectRecurrenceHint, tokenJaccard).
 */
import * as XLSX from 'xlsx'
import {
  ActionItemStatus,
  detectRecurrenceHint,
  initialStatusFromLegacy,
  isBlankLike,
  normalizePriority,
  normalizeText,
  tokenJaccard,
  type ActionItemPriority,
  type RecurrenceRule,
} from '@smlxl/domain'
import { EXTERNAL_SHEET, type RawRow, type SourceSheet } from './reader.js'

export type IssueCode =
  | 'MISSING_TITLE'
  | 'CONTRADICTION_COMPLETED_FLAG'
  | 'UNRECOGNIZED_STATUS'
  | 'UNRECOGNIZED_PRIORITY'
  | 'INVALID_DATE'
  | 'BLANK_FIELD'

export interface RowIssue {
  code: IssueCode
  field?: string
  detail: string
}

export interface NormalizedRow {
  sheet: SourceSheet
  sheetOriginal: string
  sourceRow: number
  isExternalSheet: boolean
  legacyId: string | null
  title: string
  titleNormalized: string
  ownerText: string | null
  ownerNormalized: string
  departmentText: string | null
  projectText: string | null
  projectNormalized: string
  /** YYYY-MM-DD o null. */
  meetingDate: string | null
  meetingDateRaw: unknown
  weekText: string | null
  priorityRaw: string | null
  priority: ActionItemPriority | null
  statusRaw: string | null
  statusNormalized: string
  status: ActionItemStatus
  statusRecognized: boolean
  completedFlag: boolean | null
  overdueRaw: string | null
  overdueFlag: boolean | null
  comments: string | null
  company: string | null
  contact: string | null
  recurrence: RecurrenceRule | null
  issues: RowIssue[]
  rawPayload: Record<string, unknown>
}

export function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const t = value.trim()
    return t === '' ? null : t
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

/** Flags 0/1, Sí/No, true/false, x. */
export function parseFlag(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const t = normalizeText(String(value))
  if (t === '') return null
  if (['1', 'si', 's', 'x', 'true', 'yes', 'y', 'completa', 'completo', 'ok'].includes(t)) return true
  if (['0', 'no', 'n', 'false', 'pendiente'].includes(t)) return false
  return null
}

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
}

function ymd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Fecha legada → 'YYYY-MM-DD'. Acepta serial de Excel, Date, 'YYYY-MM-DD',
 * 'DD/MM/YYYY', 'DD-MM-YYYY' y 'DD de mes de YYYY'. Devuelve null si no se
 * reconoce (el importador lo reporta como INVALID_DATE).
 */
export function parseLegacyDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    return ymd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    const parsed = XLSX.SSF.parse_date_code(value)
    return parsed ? ymd(parsed.y, parsed.m, parsed.d) : null
  }
  const text = String(value).trim()
  if (text === '') return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text)
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text)
  if (m) return ymd(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?\s+(?:de\s+)?(\d{4})$/i.exec(normalizeText(text))
  if (m) {
    const month = MONTHS[m[2] as string]
    if (month) return ymd(Number(m[3]), month, Number(m[1]))
  }
  return null
}

const BLANK_TRACKED_FIELDS: Array<{ key: keyof RawRow['cells']; label: string; onlyInternal?: boolean }> = [
  { key: 'id', label: 'ID' },
  { key: 'owner', label: 'Responsable' },
  { key: 'department', label: 'Departamento', onlyInternal: true },
  { key: 'project', label: 'Proyecto / Frente' },
  { key: 'meetingDate', label: 'Fecha de la junta' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'status', label: 'Status' },
]

export function normalizeRow(raw: RawRow): NormalizedRow {
  const c = raw.cells
  const isExternalSheet = raw.sheet === EXTERNAL_SHEET
  const issues: RowIssue[] = []

  const title = cellText(c.title) ?? ''
  if (isBlankLike(title)) issues.push({ code: 'MISSING_TITLE', field: 'Pendiente', detail: 'Fila sin texto de pendiente' })

  for (const f of BLANK_TRACKED_FIELDS) {
    if (f.onlyInternal && isExternalSheet) continue
    if (!(f.key in c)) continue
    if (isBlankLike(c[f.key])) issues.push({ code: 'BLANK_FIELD', field: f.label, detail: `Valor vacío/0 en ${f.label}` })
  }

  const ownerText = isBlankLike(c.owner) ? null : cellText(c.owner)
  const projectText = isBlankLike(c.project) ? null : cellText(c.project)
  const statusRaw = isBlankLike(c.status) ? null : cellText(c.status)
  const statusInfo = initialStatusFromLegacy(statusRaw)
  if (statusRaw && !statusInfo.recognized)
    issues.push({ code: 'UNRECOGNIZED_STATUS', field: 'Status', detail: `Status "${statusRaw}" no reconocido; se usa PENDING` })

  const priorityRaw = isBlankLike(c.priority) ? null : cellText(c.priority)
  const priority = normalizePriority(priorityRaw)
  if (priorityRaw && !priority)
    issues.push({ code: 'UNRECOGNIZED_PRIORITY', field: 'Prioridad', detail: `Prioridad "${priorityRaw}" no reconocida; se usa MEDIUM` })

  const completedFlag = parseFlag(c.completed)
  const statusSaysDone = statusInfo.status === ActionItemStatus.COMPLETED
  if (completedFlag === true && statusInfo.recognized && !statusSaysDone && statusInfo.status !== ActionItemStatus.COMPLETION_PROPOSED) {
    issues.push({
      code: 'CONTRADICTION_COMPLETED_FLAG',
      field: 'Completada',
      detail: `Completada=1 pero Status="${statusRaw}"; se confía en Status (${statusInfo.status})`,
    })
  } else if (completedFlag === false && statusSaysDone) {
    issues.push({
      code: 'CONTRADICTION_COMPLETED_FLAG',
      field: 'Completada',
      detail: `Completada=0 pero Status="${statusRaw}"; se confía en Status (COMPLETED)`,
    })
  }

  const meetingDateRaw = c.meetingDate ?? null
  const meetingDate = parseLegacyDate(isBlankLike(meetingDateRaw) ? null : meetingDateRaw)
  if (!isBlankLike(meetingDateRaw) && !meetingDate)
    issues.push({ code: 'INVALID_DATE', field: 'Fecha de la junta', detail: `Fecha "${String(meetingDateRaw)}" no reconocida` })

  const overdueRaw = isBlankLike(c.overdue) ? null : cellText(c.overdue)
  const comments = isBlankLike(c.comments) ? null : cellText(c.comments)
  const recurrence = detectRecurrenceHint(`${title} ${comments ?? ''}`)

  return {
    sheet: raw.sheet,
    sheetOriginal: raw.sheetOriginal,
    sourceRow: raw.sourceRow,
    isExternalSheet,
    legacyId: isBlankLike(c.id) ? null : cellText(c.id),
    title: title.trim(),
    titleNormalized: normalizeText(title),
    ownerText,
    ownerNormalized: normalizeText(ownerText),
    departmentText: isBlankLike(c.department) ? null : cellText(c.department),
    projectText,
    projectNormalized: normalizeText(projectText),
    meetingDate,
    meetingDateRaw,
    weekText: isBlankLike(c.week) ? null : cellText(c.week),
    priorityRaw,
    priority,
    statusRaw,
    statusNormalized: normalizeText(statusRaw),
    status: statusInfo.status,
    statusRecognized: statusInfo.recognized,
    completedFlag,
    overdueRaw,
    overdueFlag: parseFlag(overdueRaw),
    comments,
    company: isBlankLike(c.company) ? null : cellText(c.company),
    contact: isBlankLike(c.contact) ? null : cellText(c.contact),
    recurrence: recurrence ? { frequency: recurrence.frequency, textOriginal: recurrence.textOriginal } : null,
    issues,
    rawPayload: raw.raw,
  }
}

export interface DuplicateCandidate {
  sheet: SourceSheet
  rowA: number
  rowB: number
  titleA: string
  titleB: string
  score: number
}

/** Duplicados semánticos dentro de la misma área (tokenJaccard ≥ umbral). Sólo se reportan (§16.8). */
export function findSemanticDuplicates(rows: NormalizedRow[], threshold = 0.8): DuplicateCandidate[] {
  const out: DuplicateCandidate[] = []
  const bySheet = new Map<SourceSheet, NormalizedRow[]>()
  for (const r of rows) {
    if (!r.title) continue
    const list = bySheet.get(r.sheet) ?? []
    list.push(r)
    bySheet.set(r.sheet, list)
  }
  for (const [sheet, list] of bySheet) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as NormalizedRow
        const b = list[j] as NormalizedRow
        const score = tokenJaccard(a.title, b.title)
        if (score >= threshold) {
          out.push({ sheet, rowA: a.sourceRow, rowB: b.sourceRow, titleA: a.title, titleB: b.title, score: Number(score.toFixed(3)) })
        }
      }
    }
  }
  return out
}

export interface DuplicateId {
  legacyId: string
  occurrences: Array<{ sheet: SourceSheet; row: number }>
}

export function findDuplicateIds(rows: NormalizedRow[]): DuplicateId[] {
  const map = new Map<string, Array<{ sheet: SourceSheet; row: number }>>()
  for (const r of rows) {
    if (!r.legacyId) continue
    const key = normalizeText(r.legacyId)
    const list = map.get(key) ?? []
    list.push({ sheet: r.sheet, row: r.sourceRow })
    map.set(key, list)
  }
  const out: DuplicateId[] = []
  for (const [legacyId, occurrences] of map) if (occurrences.length > 1) out.push({ legacyId, occurrences })
  return out
}
