export type SearchParams = Record<string, string | string[] | undefined>

export function first(sp: SearchParams, key: string): string | undefined {
  const v = sp[key]
  if (Array.isArray(v)) return v[0]
  return v || undefined
}

export function firstInt(sp: SearchParams, key: string, fallback: number): number {
  const v = first(sp, key)
  if (!v) return fallback
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function firstBool(sp: SearchParams, key: string): boolean | undefined {
  const v = first(sp, key)
  if (v === undefined) return undefined
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return undefined
}

export function oneOf<T extends string>(sp: SearchParams, key: string, allowed: readonly T[], fallback: T): T {
  const v = first(sp, key)
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback
}
