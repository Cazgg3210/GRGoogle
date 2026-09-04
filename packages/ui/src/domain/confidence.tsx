import { cn } from '../lib/cn.js'
import { formatPercent } from '../lib/format.js'

export type ConfidenceBand = 'high' | 'medium' | 'low'

export function confidenceBand(value: number | null | undefined, thresholds = { autoAccept: 0.9, proposal: 0.7 }): ConfidenceBand | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  if (value >= thresholds.autoAccept) return 'high'
  if (value >= thresholds.proposal) return 'medium'
  return 'low'
}

const BAND_LABEL: Record<ConfidenceBand, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

/**
 * Indicador de confianza IA: porcentaje + barra con tono por banda
 * (>=0.9 alta, >=0.7 media, <0.7 baja). Umbrales configurables.
 */
export function ConfidenceIndicator({
  value,
  thresholds,
  variant = 'bar',
  className,
  showLabel = true,
}: {
  value: number | null | undefined
  thresholds?: { autoAccept: number; proposal: number }
  variant?: 'bar' | 'dots' | 'inline'
  className?: string
  showLabel?: boolean
}) {
  const band = confidenceBand(value, thresholds)
  if (band === null) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)} title="Sin confianza registrada">
        —
      </span>
    )
  }
  const pct = Math.round((value ?? 0) * 100)
  const tone = band === 'high' ? 'bg-success-500 text-success-800' : band === 'medium' ? 'bg-warning-500 text-warning-800' : 'bg-danger-500 text-danger-800'
  const textTone = band === 'high' ? 'text-success-800' : band === 'medium' ? 'text-warning-800' : 'text-danger-800'
  const title = `Confianza IA ${BAND_LABEL[band].toLowerCase()}: ${pct}%`

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-1 font-mono text-xs tabular', textTone, className)} title={title}>
        <span className={cn('size-1.5 rounded-full', tone.split(' ')[0])} aria-hidden />
        {formatPercent(value)}
      </span>
    )
  }

  if (variant === 'dots') {
    const filled = band === 'high' ? 3 : band === 'medium' ? 2 : 1
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)} title={title} aria-label={title}>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn('size-1.5 rounded-full', i < filled ? tone.split(' ')[0] : 'bg-paper-300')} />
          ))}
        </span>
        {showLabel ? <span className={cn('font-mono text-xs tabular', textTone)}>{pct}%</span> : null}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex min-w-[88px] items-center gap-2', className)} title={title} aria-label={title}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-200">
        <span className={cn('block h-full rounded-full', tone.split(' ')[0])} style={{ width: `${pct}%` }} />
      </span>
      {showLabel ? <span className={cn('w-9 text-right font-mono text-xs tabular', textTone)}>{pct}%</span> : null}
    </span>
  )
}
