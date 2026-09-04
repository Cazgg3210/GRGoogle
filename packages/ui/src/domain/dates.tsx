'use client'

import * as React from 'react'
import { CalendarX2 } from 'lucide-react'
import { cn } from '../lib/cn.js'
import { daysFromToday, formatDate, formatDateTime, formatRelative } from '../lib/format.js'

/** Fecha con tooltip absoluto y texto relativo (hidratado en cliente para evitar desfases). */
export function RelativeDate({
  value,
  className,
  withTime,
}: {
  value: string | null | undefined
  className?: string
  withTime?: boolean
}) {
  const [now, setNow] = React.useState<Date | null>(null)
  React.useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  if (!value) return <span className={cn('text-muted-foreground', className)}>—</span>
  const absolute = withTime ? formatDateTime(value) : formatDate(value)
  return (
    <time dateTime={value} title={absolute} className={className} suppressHydrationWarning>
      {now ? formatRelative(value, now) : absolute}
    </time>
  )
}

/**
 * Fecha compromiso: resalta vencidas y muestra "SIN FECHA" de forma explícita
 * (nunca un guion silencioso, §22).
 */
export function DueDate({
  value,
  isOverdue,
  status,
  className,
  showDays = true,
}: {
  value: string | null | undefined
  isOverdue?: boolean
  status?: string
  className?: string
  showDays?: boolean
}) {
  if (!value) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-sm border border-dashed border-warning-400 bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warning-800',
          className,
        )}
      >
        <CalendarX2 className="size-3" />
        Sin fecha
      </span>
    )
  }
  const closed = status === 'COMPLETED' || status === 'CANCELLED'
  const days = daysFromToday(value)
  const overdue = isOverdue ?? (!closed && days !== null && days < 0)
  let hint = ''
  if (showDays && !closed && days !== null) {
    if (days === 0) hint = 'hoy'
    else if (days === 1) hint = 'mañana'
    else if (days > 1) hint = `en ${days} d`
    else if (days === -1) hint = 'ayer'
    else hint = `hace ${Math.abs(days)} d`
  }
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5 whitespace-nowrap tabular',
        overdue
          ? 'font-semibold text-danger-700'
          : closed
            ? 'text-muted-foreground'
            : 'text-foreground',
        className,
      )}
      title={overdue ? 'Vencida' : undefined}
    >
      <time dateTime={value}>{formatDate(value)}</time>
      {hint ? (
        <span className={cn('text-[11px]', overdue ? 'text-danger-600' : 'text-muted-foreground')}>
          {hint}
        </span>
      ) : null}
    </span>
  )
}
