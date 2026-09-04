import { describe, expect, it } from 'vitest'
import { endOfMonth, nextWeekday, resolveRelativeDate } from './dates.js'

// 2026-09-03 es jueves.
const REF = '2026-09-03'

describe('resolveRelativeDate', () => {
  it('resuelve mañana / hoy / pasado mañana', () => {
    expect(resolveRelativeDate('lo mando mañana temprano', REF)).toMatchObject({
      date: '2026-09-04',
      textOriginal: 'mañana',
    })
    expect(resolveRelativeDate('para hoy sin falta', REF).date).toBe(REF)
    expect(resolveRelativeDate('pasado mañana lo reviso', REF).date).toBe('2026-09-05')
    // "hoy" suelto no se toma como fecha compromiso.
    expect(resolveRelativeDate('hoy está en un quince por ciento', REF).date).toBeNull()
  })

  it('resuelve días de la semana (siguiente ocurrencia estricta)', () => {
    expect(resolveRelativeDate('yo voy a enviar la carta el próximo martes', REF)).toMatchObject({
      date: '2026-09-08',
      textOriginal: 'el próximo martes',
    })
    expect(resolveRelativeDate('tengamos comentarios para el viernes', REF)).toMatchObject({
      date: '2026-09-04',
      textOriginal: 'para el viernes',
    })
    expect(resolveRelativeDate('el jueves que viene', REF).date).toBe('2026-09-10')
    expect(resolveRelativeDate('este lunes', REF).date).toBe('2026-09-07')
    expect(nextWeekday(REF, 4)).toBe('2026-09-10')
  })

  it('resuelve fin de mes, en N días/semanas y próxima semana', () => {
    expect(resolveRelativeDate('firmar antes de fin de mes', REF).date).toBe('2026-09-30')
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(resolveRelativeDate('en 3 días', REF).date).toBe('2026-09-06')
    expect(resolveRelativeDate('en dos semanas', REF).date).toBe('2026-09-17')
    expect(resolveRelativeDate('en quince días', REF).date).toBe('2026-09-18')
    expect(resolveRelativeDate('la próxima semana', REF)).toMatchObject({
      date: '2026-09-07',
      confidence: 0.5,
    })
    expect(resolveRelativeDate('a inicios del próximo mes', REF).date).toBe('2026-10-01')
  })

  it('resuelve fechas explícitas DD de mes, ISO y numéricas', () => {
    expect(resolveRelativeDate('antes del 20 de septiembre', REF)).toMatchObject({
      date: '2026-09-20',
      textOriginal: 'antes del 20 de septiembre',
    })
    expect(resolveRelativeDate('el 15 de enero', REF).date).toBe('2027-01-15')
    expect(resolveRelativeDate('el 15 de enero de 2026', REF).date).toBe('2026-01-15')
    expect(resolveRelativeDate('entrega 2026-10-01 fija', REF).date).toBe('2026-10-01')
    expect(resolveRelativeDate('entrega 01/10/2026', REF).date).toBe('2026-10-01')
    expect(resolveRelativeDate('antes del 20 de este mes', REF)).toMatchObject({
      date: '2026-09-20',
    })
    expect(resolveRelativeDate('el día 2', REF).date).toBe('2026-10-02')
  })

  it('devuelve null cuando no hay fecha y con referencia inválida', () => {
    expect(resolveRelativeDate('sin fecha definida', REF)).toEqual({
      date: null,
      textOriginal: null,
      confidence: 0,
    })
    expect(resolveRelativeDate('mañana', 'nope').date).toBeNull()
  })
})
