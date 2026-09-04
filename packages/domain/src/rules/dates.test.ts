import { describe, expect, it } from 'vitest'
import { ActionItemStatus } from '../enums.js'
import {
  endOfDay,
  isOverdue,
  isoWeekOf,
  nextDigestRunAt,
  parseLocalDate,
  toLocalDateString,
  zonedDateTime,
} from './dates.js'

const TZ = 'America/Mexico_City'

describe('fechas con zona horaria', () => {
  it('endOfDay respeta la zona de la empresa', () => {
    const due = parseLocalDate('2026-09-08', TZ)!
    const eod = endOfDay(due, TZ)
    // 2026-09-08 23:59:59.999 CDMX == 2026-09-09 05:59:59.999 UTC (UTC-6, sin DST desde 2022)
    expect(eod.toISOString()).toBe('2026-09-09T05:59:59.999Z')
  })

  it('isOverdue se deriva y respeta estados cerrados', () => {
    const due = parseLocalDate('2026-09-08', TZ)!
    const beforeEod = new Date('2026-09-09T05:00:00Z')
    const afterEod = new Date('2026-09-09T06:00:00Z')
    expect(isOverdue({ dueDate: due, status: ActionItemStatus.PENDING }, beforeEod, TZ)).toBe(false)
    expect(isOverdue({ dueDate: due, status: ActionItemStatus.PENDING }, afterEod, TZ)).toBe(true)
    expect(isOverdue({ dueDate: due, status: ActionItemStatus.COMPLETED }, afterEod, TZ)).toBe(
      false,
    )
    expect(isOverdue({ dueDate: due, status: ActionItemStatus.CANCELLED }, afterEod, TZ)).toBe(
      false,
    )
    expect(isOverdue({ dueDate: null, status: ActionItemStatus.PENDING }, afterEod, TZ)).toBe(false)
  })

  it('semana ISO se calcula desde la fecha local', () => {
    // 2026-09-03 es jueves -> ISO 2026-W36 (lunes 2026-08-31)
    const w = isoWeekOf(zonedDateTime(2026, 9, 3, 10, 0, 0, TZ), TZ)
    expect(w.label).toBe('2026-W36')
    expect(toLocalDateString(w.weekStart, TZ)).toBe('2026-08-31')
    expect(toLocalDateString(w.weekEnd, TZ)).toBe('2026-09-06')
    // Borde de año: 2027-01-01 (viernes) pertenece a 2026-W53
    expect(isoWeekOf(zonedDateTime(2027, 1, 1, 12, 0, 0, TZ), TZ).label).toBe('2026-W53')
  })

  it('nextDigestRunAt encuentra el próximo viernes/sábado configurado', () => {
    const now = zonedDateTime(2026, 9, 3, 10, 0, 0, TZ) // jueves
    const friday = nextDigestRunAt({ dayOfWeek: 5, localTime: '18:00', timezone: TZ }, now)
    expect(toLocalDateString(friday, TZ)).toBe('2026-09-04')
    const saturday = nextDigestRunAt({ dayOfWeek: 6, localTime: '09:30', timezone: TZ }, now)
    expect(toLocalDateString(saturday, TZ)).toBe('2026-09-05')
    // Si ya pasó la hora del mismo día, salta una semana
    const fridayLate = zonedDateTime(2026, 9, 4, 19, 0, 0, TZ)
    expect(
      toLocalDateString(
        nextDigestRunAt({ dayOfWeek: 5, localTime: '18:00', timezone: TZ }, fridayLate),
        TZ,
      ),
    ).toBe('2026-09-11')
  })

  it('parseLocalDate rechaza formatos inválidos', () => {
    expect(parseLocalDate('08/09/2026')).toBeNull()
    expect(parseLocalDate('2026-13-01')).toBeNull()
  })
})
