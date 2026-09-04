'use client'

import { cn } from '@smlxl/ui'

type Flat = Record<string, unknown>

function flatten(value: unknown, prefix = '', out: Flat = {}): Flat {
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = value
    return out
  }
  if (Array.isArray(value)) {
    if (value.length === 0) out[prefix || '[]'] = []
    value.forEach((v, i) => flatten(v, prefix ? `${prefix}[${i}]` : `[${i}]`, out))
    return out
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0 && prefix) out[prefix] = {}
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out)
    return out
  }
  out[prefix || 'valor'] = value
  return out
}

function show(v: unknown): string {
  if (v === undefined) return '—'
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

/** Vista antes/después de auditoría: resalta llaves agregadas, eliminadas y cambiadas. */
export function JsonDiff({ before, after, className }: { before: unknown; after: unknown; className?: string }) {
  const a = flatten(before)
  const b = flatten(after)
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort()
  if (keys.length === 0) return <p className="text-xs text-muted-foreground">Sin datos antes/después.</p>
  return (
    <div className={cn('overflow-x-auto rounded-md border border-border bg-surface scrollbar-thin', className)}>
      <table className="w-full text-xs">
        <thead className="bg-surface-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold">Campo</th>
            <th className="px-2 py-1.5 text-left font-semibold">Antes</th>
            <th className="px-2 py-1.5 text-left font-semibold">Después</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {keys.map((k) => {
            const inA = k in a
            const inB = k in b
            const changed = inA && inB && JSON.stringify(a[k]) !== JSON.stringify(b[k])
            const tone = !inA ? 'bg-success-50' : !inB ? 'bg-danger-50' : changed ? 'bg-warning-50' : ''
            return (
              <tr key={k} className={cn('border-t border-border/70', tone)}>
                <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{k}</td>
                <td className={cn('max-w-[280px] break-words px-2 py-1', changed && 'line-through decoration-danger-400')}>{inA ? show(a[k]) : '—'}</td>
                <td className={cn('max-w-[280px] break-words px-2 py-1', (changed || !inA) && 'font-semibold text-ink-900')}>{inB ? show(b[k]) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
