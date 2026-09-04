import { createHash } from 'node:crypto'
import {
  DEFAULT_COMPANY_TIMEZONE,
  isoWeekOf,
  toLocalDateString,
  zonedDateTime,
  zonedParts,
  type IsoWeek,
} from '@smlxl/domain'

/** Zona horaria de la empresa para el seed (§18.2). */
export const TZ = DEFAULT_COMPANY_TIMEZONE

/** Instante de referencia: todas las fechas del seed son relativas a "ahora". */
export const NOW = new Date()

/**
 * UUID determinístico a partir de una clave (formato v5-like sobre SHA-1).
 * Permite que el seed sea idempotente: la misma clave produce el mismo id.
 */
export function stableId(key: string): string {
  const h = createHash('sha1').update(`smlxl-seed:${key}`).digest('hex')
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

/** Medianoche local de hoy + offset días (fecha calendario). */
export function localDate(offsetDays: number): Date {
  const p = zonedParts(NOW, TZ)
  return zonedDateTime(p.year, p.month, p.day + offsetDays, 0, 0, 0, TZ)
}

/** Instante a una hora local de hoy + offset días. */
export function at(offsetDays: number, hour: number, minute = 0): Date {
  const p = zonedParts(NOW, TZ)
  return zonedDateTime(p.year, p.month, p.day + offsetDays, hour, minute, 0, TZ)
}

/** Próximo día de la semana (0=domingo … 6=sábado) estrictamente posterior a hoy, medianoche local. */
export function nextWeekday(weekday: number): Date {
  const p = zonedParts(NOW, TZ)
  let delta = (weekday - p.weekday + 7) % 7
  if (delta === 0) delta = 7
  return localDate(delta)
}

export function hoursFromNow(hours: number): Date {
  return new Date(NOW.getTime() + hours * 3600_000)
}

export function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000)
}

export function ymd(date: Date): string {
  return toLocalDateString(date, TZ)
}

/** Semana ISO anterior a la actual (para el digest "de la semana pasada"). */
export function lastIsoWeek(): IsoWeek {
  const current = isoWeekOf(NOW, TZ)
  return isoWeekOf(new Date(current.weekStart.getTime() - 86_400_000), TZ)
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}
