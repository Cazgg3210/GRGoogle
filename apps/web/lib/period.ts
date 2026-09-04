import { toLocalDateString } from '@smlxl/ui'

export type PeriodKey = '7d' | '30d' | '90d' | 'ytd' | 'all'

export const PERIOD_COOKIE = 'smlxl_period'
export const DEFAULT_PERIOD: PeriodKey = '30d'

export const PERIODS: ReadonlyArray<{ key: PeriodKey; label: string; short: string }> = [
  { key: '7d', label: 'Últimos 7 días', short: '7 d' },
  { key: '30d', label: 'Últimos 30 días', short: '30 d' },
  { key: '90d', label: 'Últimos 90 días', short: '90 d' },
  { key: 'ytd', label: 'Año en curso', short: 'Año' },
  { key: 'all', label: 'Todo el historial', short: 'Todo' },
]

export function isPeriodKey(value: string | undefined | null): value is PeriodKey {
  return PERIODS.some((p) => p.key === value)
}

export interface PeriodRange {
  from?: string
  to?: string
}

/** Rango (YYYY-MM-DD, zona de la empresa) para un periodo. `all` no acota. */
export function periodRange(key: PeriodKey, now: Date = new Date()): PeriodRange {
  const to = toLocalDateString(now)
  if (key === 'all') return {}
  if (key === 'ytd') return { from: `${to.slice(0, 4)}-01-01`, to }
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90
  const from = toLocalDateString(new Date(now.getTime() - days * 86_400_000))
  return { from, to }
}

export function periodLabel(key: PeriodKey): string {
  return PERIODS.find((p) => p.key === key)?.label ?? key
}
