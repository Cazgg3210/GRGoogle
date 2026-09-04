/**
 * Formateo de fechas/números para la UI: es-MX, zona America/Mexico_City.
 * Los DTO traen ISO 8601 (con offset) o 'YYYY-MM-DD' para fechas de calendario.
 */
export const UI_LOCALE = 'es-MX'
export const UI_TIMEZONE = 'America/Mexico_City'

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const m = DATE_ONLY.exec(value)
  if (m) {
    // Fecha de calendario: se interpreta como mediodía local para evitar saltos de día.
    return new Date(`${value}T12:00:00-06:00`)
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(UI_LOCALE, { timeZone: UI_TIMEZONE, ...options })
    fmtCache.set(key, f)
  }
  return f
}

/** "3 sep 2026" */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value)
  if (!d) return fallback
  return fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace('.', '')
}

/** "3 sep 2026, 14:30" */
export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value)
  if (!d) return fallback
  return fmt({
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace('.', '')
}

/** "14:30" */
export function formatTime(value: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value)
  if (!d) return fallback
  return fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

/** "jue 3 sep" */
export function formatShortDate(value: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value)
  if (!d) return fallback
  return fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(/\./g, '')
}

/** "viernes" */
export function formatWeekday(dayOfWeek: number): string {
  const base = new Date(Date.UTC(2024, 0, 7 + dayOfWeek, 12)) // 2024-01-07 es domingo
  return new Intl.DateTimeFormat(UI_LOCALE, { weekday: 'long', timeZone: 'UTC' }).format(base)
}

/** "hace 3 días" / "en 2 días" / "hoy" */
export function formatRelative(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const d = toDate(value)
  if (!d) return '—'
  const diffMs = d.getTime() - now.getTime()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(UI_LOCALE, { numeric: 'auto' })
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (abs < minute) return 'ahora'
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute')
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour')
  if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), 'day')
  if (abs < 365 * day) return rtf.format(Math.round(diffMs / (30 * day)), 'month')
  return rtf.format(Math.round(diffMs / (365 * day)), 'year')
}

/** Diferencia en días naturales (positivo = futuro). */
export function daysFromToday(
  dateOnly: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const d = toDate(dateOnly)
  if (!d) return null
  const todayStr = toLocalDateString(now)
  const today = new Date(`${todayStr}T12:00:00-06:00`)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

export function toLocalDateString(date: Date = new Date()): string {
  const parts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** "1 h 05 min" / "45 min" */
export function formatDuration(seconds: number | null | undefined, fallback = '—'): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return fallback
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

/** "00:12:34" a partir de un ISO o de un string ya en HH:MM:SS. */
export function formatClock(
  value: string | null | undefined,
  meetingStart?: string | null,
): string {
  if (!value) return '—'
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) return value
  const d = toDate(value)
  if (!d) return value
  const start = toDate(meetingStart)
  if (start) {
    const s = Math.max(0, Math.round((d.getTime() - start.getTime()) / 1000))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return formatTime(d)
}

export function formatPercent(
  value: number | null | undefined,
  digits = 0,
  fallback = '—',
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback
  const pct = value <= 1 && value >= 0 ? value * 100 : value
  return `${pct.toFixed(digits)}%`
}

export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback
  return new Intl.NumberFormat(UI_LOCALE).format(value)
}

export function formatCurrencyUsd(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(value)
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}
