import { zonedDateTime, zonedParts, type EvidenceQuote, type RecurrenceRule } from '@smlxl/domain'
import { Prisma } from '../generated/client/index.js'

/** Contexto que necesitan los mappers (zona horaria para columnas DATE). */
export interface MapperContext {
  timeZone: string
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/**
 * Copia JSON-safe de cualquier valor (fechas → ISO, undefined → omitido,
 * ciclos → marcador). Nunca lanza.
 */
export function jsonSafe(value: unknown): Prisma.InputJsonValue {
  try {
    const text = JSON.stringify(value, (_key, v: unknown) => {
      if (typeof v === 'bigint') return v.toString()
      if (v instanceof Date) return v.toISOString()
      return v
    })
    if (text === undefined) return Prisma.JsonNull as unknown as Prisma.InputJsonValue
    return JSON.parse(text) as Prisma.InputJsonValue
  } catch (err) {
    return { unserializable: true, error: err instanceof Error ? err.message : String(err) }
  }
}

/** JSON obligatorio en columna `Json` (no nullable). null → JsonNull. */
export function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull
  return jsonSafe(value)
}

/** JSON en columna `Json?`. null → DbNull (NULL de SQL). */
export function toNullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull
  return jsonSafe(value)
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

export function asEvidence(value: unknown): EvidenceQuote[] {
  if (!Array.isArray(value)) return []
  const out: EvidenceQuote[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (typeof rec.text !== 'string') continue
    const q: EvidenceQuote = { text: rec.text }
    if (typeof rec.speaker === 'string') q.speaker = rec.speaker
    if (typeof rec.startTime === 'string') q.startTime = rec.startTime
    if (typeof rec.endTime === 'string') q.endTime = rec.endTime
    if (typeof rec.segmentId === 'string') q.segmentId = rec.segmentId
    out.push(q)
  }
  return out
}

const FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])

export function asRecurrence(value: unknown): RecurrenceRule | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  if (typeof rec.frequency !== 'string' || !FREQUENCIES.has(rec.frequency)) return null
  const rule: RecurrenceRule = { frequency: rec.frequency as RecurrenceRule['frequency'] }
  if (typeof rec.interval === 'number') rule.interval = rec.interval
  if (Array.isArray(rec.weekdays))
    rule.weekdays = rec.weekdays.filter((d): d is number => typeof d === 'number')
  if (typeof rec.textOriginal === 'string') rule.textOriginal = rec.textOriginal
  return rule
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

// ---------------------------------------------------------------------------
// Fechas DATE (sin hora)
// ---------------------------------------------------------------------------

/**
 * Prisma persiste `@db.Date` tomando la parte de fecha en UTC. El dominio
 * representa fechas calendario como medianoche local en la zona de la empresa,
 * así que convertimos: instante local → fecha calendario → medianoche UTC.
 */
export function dateOnlyToDb(date: Date | null | undefined, ctx: MapperContext): Date | null {
  if (!date) return null
  const p = zonedParts(date, ctx.timeZone)
  return new Date(Date.UTC(p.year, p.month - 1, p.day))
}

/** Inverso: medianoche UTC leída de la BD → medianoche local en la zona de la empresa. */
export function dateOnlyFromDb(date: Date | null | undefined, ctx: MapperContext): Date | null {
  if (!date) return null
  return zonedDateTime(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    0,
    0,
    0,
    ctx.timeZone,
  )
}

/** Fecha calendario de "hoy" en la zona de la empresa, expresada como la BD la guarda. */
export function todayDb(now: Date, ctx: MapperContext): Date {
  return dateOnlyToDb(now, ctx) as Date
}
