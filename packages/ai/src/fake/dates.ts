/**
 * Resolutor determinístico de fechas relativas en español (para el analizador
 * fake y como referencia de la semántica que se pide al modelo en los prompts).
 * Trabaja sobre fechas calendario (YYYY-MM-DD); la zona horaria sólo importa
 * para derivar `referenceDate`, que ya llega resuelta.
 */
export interface ResolvedDate {
  date: string | null
  textOriginal: string | null
  confidence: number
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  quince: 15, veinte: 20, treinta: 30,
}

const CHAR_MAP: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'a', É: 'e', Í: 'i', Ó: 'o', Ú: 'u', Ü: 'u', Ñ: 'n',
}

/** Normalización que conserva la longitud (índices 1:1 con el original). */
export function foldForMatch(text: string): string {
  let out = ''
  for (const ch of text) out += CHAR_MAP[ch] ?? ch.toLowerCase()
  return out
}

export function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

export function toIsoDate(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const p = parseIsoDate(iso)
  if (!p) return iso
  return toIsoDate(p.y, p.m, p.d + days)
}

export function weekdayOf(iso: string): number {
  const p = parseIsoDate(iso)
  if (!p) return 0
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
}

/** Siguiente ocurrencia del día de la semana estrictamente posterior a la referencia. */
export function nextWeekday(referenceDate: string, weekday: number): string {
  const current = weekdayOf(referenceDate)
  let delta = (weekday - current + 7) % 7
  if (delta === 0) delta = 7
  return addDays(referenceDate, delta)
}

export function endOfMonth(referenceDate: string): string {
  const p = parseIsoDate(referenceDate)
  if (!p) return referenceDate
  return toIsoDate(p.y, p.m + 1, 0)
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

interface Rule {
  regex: RegExp
  resolve: (m: RegExpExecArray, ref: string) => { date: string; confidence: number } | null
}

const WEEKDAY_ALT = Object.keys(WEEKDAYS).join('|')
const MONTH_ALT = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|')
const NUM_ALT = Object.keys(NUMBER_WORDS).join('|')

const RULES: Rule[] = [
  { regex: /\b(\d{4})-(\d{2})-(\d{2})\b/, resolve: (m) => (isValidDate(+m[1]!, +m[2]!, +m[3]!) ? { date: toIsoDate(+m[1]!, +m[2]!, +m[3]!), confidence: 0.98 } : null) },
  {
    regex: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
    resolve: (m) => (isValidDate(+m[3]!, +m[2]!, +m[1]!) ? { date: toIsoDate(+m[3]!, +m[2]!, +m[1]!), confidence: 0.95 } : null),
  },
  {
    regex: new RegExp(`\\b(?:el |del |para el |antes del |a mas tardar el |hasta el )?(\\d{1,2})(?:\\s*de\\s+|\\s+)(${MONTH_ALT})\\b(?:\\s+(?:de|del)\\s+(\\d{4}))?`),
    resolve: (m, ref) => {
      const day = Number(m[1])
      const month = MONTHS[m[2]!]
      if (!month) return null
      const refP = parseIsoDate(ref)
      if (!refP) return null
      let year = m[3] ? Number(m[3]) : refP.y
      if (!m[3] && (month < refP.m || (month === refP.m && day < refP.d))) year += 1
      if (!isValidDate(year, month, day)) return null
      return { date: toIsoDate(year, month, day), confidence: m[3] ? 0.96 : 0.9 }
    },
  },
  { regex: /\bpasado manana\b/, resolve: (_m, ref) => ({ date: addDays(ref, 2), confidence: 0.92 }) },
  { regex: /\bmanana\b(?! por la manana)/, resolve: (_m, ref) => ({ date: addDays(ref, 1), confidence: 0.9 }) },
  { regex: /\b(?:para hoy|hoy mismo|de hoy|antes de que termine el dia)\b/, resolve: (_m, ref) => ({ date: ref, confidence: 0.9 }) },
  {
    regex: new RegExp(`\\b(?:el |para el |antes del |a mas tardar el |hasta el |este |el proximo |el siguiente |proximo |siguiente )?(${WEEKDAY_ALT})(?:\\s+(?:proximo|siguiente|que viene|que entra))?\\b`),
    resolve: (m, ref) => {
      const wd = WEEKDAYS[m[1]!]
      if (wd === undefined) return null
      return { date: nextWeekday(ref, wd), confidence: 0.85 }
    },
  },
  { regex: /\b(?:a |para |antes de |hasta )?(?:fin|finales|final) de(?:l)? mes\b/, resolve: (_m, ref) => ({ date: endOfMonth(ref), confidence: 0.8 }) },
  {
    regex: /\b(?:fin|finales) de semana\b/,
    resolve: (_m, ref) => ({ date: nextWeekday(ref, 5), confidence: 0.6 }),
  },
  {
    regex: /\b(?:a )?(?:inicio|inicios|principio|principios) de(?:l)? (?:proximo|siguiente) mes\b/,
    resolve: (_m, ref) => {
      const p = parseIsoDate(ref)
      return p ? { date: toIsoDate(p.y, p.m + 1, 1), confidence: 0.7 } : null
    },
  },
  {
    regex: new RegExp(`\\ben (\\d{1,2}|${NUM_ALT}) (dia|dias|semana|semanas|mes|meses)\\b`),
    resolve: (m, ref) => {
      const raw = m[1]!
      const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw]
      if (!n) return null
      const unit = m[2]!
      if (unit.startsWith('dia')) return { date: addDays(ref, n), confidence: 0.85 }
      if (unit.startsWith('semana')) return { date: addDays(ref, n * 7), confidence: 0.85 }
      const p = parseIsoDate(ref)
      return p ? { date: toIsoDate(p.y, p.m + n, p.d), confidence: 0.75 } : null
    },
  },
  {
    regex: /\b(?:la )?(?:proxima|siguiente) semana\b|\bla semana que viene\b|\bla semana que entra\b/,
    resolve: (_m, ref) => ({ date: nextWeekday(ref, 1), confidence: 0.5 }),
  },
  {
    regex: /\b(?:el |antes del |para el |hasta el )(?:dia )?(\d{1,2})\b(?:\s+de este mes)?(?!\s*(?:de|\/|-|:|%|por))/,
    resolve: (m, ref) => {
      const day = Number(m[1])
      const p = parseIsoDate(ref)
      if (!p || day < 1 || day > 31) return null
      const month = day >= p.d ? p.m : p.m + 1
      const y = p.y
      if (!isValidDate(y, ((month - 1) % 12) + 1, day)) return null
      return { date: toIsoDate(y, month, day), confidence: 0.6 }
    },
  },
]

/**
 * Resuelve la primera expresión de fecha encontrada en `text` contra
 * `referenceDate` (YYYY-MM-DD). Devuelve el fragmento original coincidente.
 */
export function resolveRelativeDate(text: string, referenceDate: string, _timezone?: string): ResolvedDate {
  if (!parseIsoDate(referenceDate)) return { date: null, textOriginal: null, confidence: 0 }
  const folded = foldForMatch(text)
  let best: { index: number; result: { date: string; confidence: number }; original: string } | null = null
  for (const rule of RULES) {
    const m = rule.regex.exec(folded)
    if (!m) continue
    const result = rule.resolve(m, referenceDate)
    if (!result) continue
    const original = text.slice(m.index, m.index + m[0].length).trim()
    if (!best || m.index < best.index || (m.index === best.index && result.confidence > best.result.confidence)) {
      best = { index: m.index, result, original }
    }
  }
  if (!best) return { date: null, textOriginal: null, confidence: 0 }
  return { date: best.result.date, textOriginal: best.original, confidence: best.result.confidence }
}
