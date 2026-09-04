/**
 * Normalización de texto para aliases de personas/proyectos y reconciliación
 * (§16.4: `Andrés`/`Andres`, `Lisa de la Fuente`/`Lisa de La Fuente`, `Escandón`/`Escandon`).
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isBlankLike(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return value === 0 || Number.isNaN(value)
  if (typeof value === 'string') {
    const t = value.trim()
    return t === '' || t === '0' || t === '-' || t.toLowerCase() === 'n/a'
  }
  return false
}

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'del', 'y', 'a', 'en', 'con', 'para', 'por', 'un', 'una',
  'que', 'se', 'al', 'lo', 'su', 'sus', 'e', 'o', 'u', 'the', 'of', 'to', 'and',
])

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/** Similitud Jaccard sobre tokens (0..1). Determinística, sin embeddings. */
export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (ta.size === 0 && tb.size === 0) return 1
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

/** Similitud por trigramas de caracteres (0..1), útil para variantes ortográficas. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const n = `  ${normalizeText(s)} `
    const out = new Set<string>()
    for (let i = 0; i < n.length - 2; i++) out.add(n.slice(i, i + 3))
    return out
  }
  const ga = grams(a)
  const gb = grams(b)
  if (ga.size === 0 && gb.size === 0) return 1
  if (ga.size === 0 || gb.size === 0) return 0
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter++
  return inter / (ga.size + gb.size - inter)
}

export function normalizePriority(value: string | null | undefined): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null {
  const v = normalizeText(value)
  if (v === '') return null
  if (v === 'alta' || v === 'high' || v === 'a') return 'HIGH'
  if (v === 'media' || v === 'medium' || v === 'm' || v === 'normal') return 'MEDIUM'
  if (v === 'baja' || v === 'low' || v === 'b') return 'LOW'
  if (v === 'urgente' || v === 'urgent' || v === 'critica') return 'URGENT'
  return null
}

const RECURRING_HINTS = ['diaria', 'diario', 'dia a dia', 'semanal', 'cada semana', 'quincenal', 'mensual', 'todos los dias', 'cada dia', 'seguimiento continuo']

export function detectRecurrenceHint(text: string): { frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'; textOriginal: string } | null {
  const n = normalizeText(text)
  for (const hint of RECURRING_HINTS) {
    if (n.includes(hint)) {
      if (hint.startsWith('diari') || hint.includes('dia')) return { frequency: 'DAILY', textOriginal: hint }
      if (hint.includes('semana')) return { frequency: 'WEEKLY', textOriginal: hint }
      if (hint.startsWith('quincen')) return { frequency: 'BIWEEKLY', textOriginal: hint }
      if (hint.startsWith('mensual')) return { frequency: 'MONTHLY', textOriginal: hint }
      return { frequency: 'WEEKLY', textOriginal: hint }
    }
  }
  return null
}

export function isInternalEmail(email: string | null | undefined, domain: string): boolean {
  if (!email) return false
  return email.trim().toLowerCase().endsWith(`@${domain.toLowerCase()}`)
}

/** Clave legible de ActionItem: ACT-000123. */
export function formatExternalKey(sequence: number): string {
  return `ACT-${String(sequence).padStart(6, '0')}`
}
