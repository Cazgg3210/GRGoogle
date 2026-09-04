import { ActionItemStatus } from '../enums.js'

/**
 * Utilidades de fecha con zona horaria explícita, sin dependencias externas.
 * La empresa opera en America/Mexico_City (configurable; ver §18.2).
 */

export const DEFAULT_COMPANY_TIMEZONE = 'America/Mexico_City'

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

const partsCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    partsCache.set(timeZone, f)
  }
  return f
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function zonedParts(date: Date, timeZone = DEFAULT_COMPANY_TIMEZONE): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date)
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '0'
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  }
}

/** Offset (ms) de la zona respecto a UTC en el instante dado. */
export function timeZoneOffsetMs(date: Date, timeZone = DEFAULT_COMPANY_TIMEZONE): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Construye un instante a partir de fecha/hora local en la zona indicada. */
export function zonedDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = DEFAULT_COMPANY_TIMEZONE,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const offset = timeZoneOffsetMs(guess, timeZone)
  const candidate = new Date(guess.getTime() - offset)
  // Segunda pasada para cambios de horario cerca del instante.
  const offset2 = timeZoneOffsetMs(candidate, timeZone)
  return offset2 === offset ? candidate : new Date(guess.getTime() - offset2)
}

/** Fin de día (23:59:59.999) local de la fecha indicada. */
export function endOfDay(date: Date, timeZone = DEFAULT_COMPANY_TIMEZONE): Date {
  const p = zonedParts(date, timeZone)
  const start = zonedDateTime(p.year, p.month, p.day, 0, 0, 0, timeZone)
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
}

export function startOfDay(date: Date, timeZone = DEFAULT_COMPANY_TIMEZONE): Date {
  const p = zonedParts(date, timeZone)
  return zonedDateTime(p.year, p.month, p.day, 0, 0, 0, timeZone)
}

/** Fecha calendario (YYYY-MM-DD) en la zona indicada. */
export function toLocalDateString(date: Date, timeZone = DEFAULT_COMPANY_TIMEZONE): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Parsea 'YYYY-MM-DD' como medianoche local en la zona. */
export function parseLocalDate(value: string, timeZone = DEFAULT_COMPANY_TIMEZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return zonedDateTime(y, mo, d, 0, 0, 0, timeZone)
}

/**
 * isOverdue (§16.6): dueDate != null AND now > endOfDay(dueDate) AND status abierto.
 * Nunca se persiste; siempre se deriva.
 */
export function isOverdue(
  input: { dueDate: Date | null; status: ActionItemStatus },
  now: Date,
  timeZone = DEFAULT_COMPANY_TIMEZONE,
): boolean {
  if (!input.dueDate) return false
  if (input.status === ActionItemStatus.COMPLETED || input.status === ActionItemStatus.CANCELLED)
    return false
  return now.getTime() > endOfDay(input.dueDate, timeZone).getTime()
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}

export function daysOpen(createdAt: Date, now: Date, completedAt: Date | null): number {
  return daysBetween(createdAt, completedAt ?? now)
}

export function daysUntilDue(
  dueDate: Date,
  now: Date,
  timeZone = DEFAULT_COMPANY_TIMEZONE,
): number {
  return daysBetween(startOfDay(now, timeZone), startOfDay(dueDate, timeZone))
}

// ---------------------------------------------------------------------------
// Semana ISO (derivada, nunca capturada manualmente — §16.2, §20.4)
// ---------------------------------------------------------------------------

export interface IsoWeek {
  isoYear: number
  isoWeek: number
  /** Lunes 00:00 local. */
  weekStart: Date
  /** Domingo 23:59:59.999 local. */
  weekEnd: Date
  label: string
}

export function isoWeekOf(date: Date, timeZone = DEFAULT_COMPANY_TIMEZONE): IsoWeek {
  const p = zonedParts(date, timeZone)
  // Trabajar en UTC "plano" con la fecha local para calcular ISO week.
  const local = new Date(Date.UTC(p.year, p.month - 1, p.day))
  const dayNum = local.getUTCDay() || 7 // 1..7, lunes=1
  const thursday = new Date(local)
  thursday.setUTCDate(local.getUTCDate() + 4 - dayNum)
  const isoYear = thursday.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const isoWeek = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const monday = new Date(local)
  monday.setUTCDate(local.getUTCDate() - (dayNum - 1))
  const weekStart = zonedDateTime(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  )
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const weekEnd = endOfDay(
    zonedDateTime(
      sunday.getUTCFullYear(),
      sunday.getUTCMonth() + 1,
      sunday.getUTCDate(),
      12,
      0,
      0,
      timeZone,
    ),
    timeZone,
  )
  return {
    isoYear,
    isoWeek,
    weekStart,
    weekEnd,
    label: `${isoYear}-W${String(isoWeek).padStart(2, '0')}`,
  }
}

export function previousWeeks(
  from: Date,
  count: number,
  timeZone = DEFAULT_COMPANY_TIMEZONE,
): IsoWeek[] {
  const weeks: IsoWeek[] = []
  let cursor = from
  for (let i = 0; i < count; i++) {
    const w = isoWeekOf(cursor, timeZone)
    weeks.unshift(w)
    cursor = new Date(w.weekStart.getTime() - 24 * 60 * 60 * 1000)
  }
  return weeks
}

/**
 * Próximo instante de envío del digest (§18.2) a partir de `now` en la zona configurada.
 * Si `now` cae exactamente en el instante o después dentro del mismo día, devuelve la semana siguiente.
 */
export function nextDigestRunAt(
  cfg: { dayOfWeek: number; localTime: string; timezone: string },
  now: Date,
): Date {
  const [hh, mm] = cfg.localTime.split(':').map((v) => Number(v))
  const hour = Number.isFinite(hh) ? (hh as number) : 18
  const minute = Number.isFinite(mm) ? (mm as number) : 0
  const p = zonedParts(now, cfg.timezone)
  let delta = (cfg.dayOfWeek - p.weekday + 7) % 7
  let candidate = zonedDateTime(p.year, p.month, p.day + delta, hour, minute, 0, cfg.timezone)
  if (candidate.getTime() <= now.getTime()) {
    delta += 7
    candidate = zonedDateTime(p.year, p.month, p.day + delta, hour, minute, 0, cfg.timezone)
  }
  return candidate
}
