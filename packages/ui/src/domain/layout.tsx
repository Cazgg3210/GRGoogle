import * as React from 'react'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn.js'
import { formatNumber } from '../lib/format.js'

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
  children,
}: {
  title: React.ReactNode
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-signal-600">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-[2rem] leading-none tracking-tight text-ink-950 sm:text-[2.35rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}

export function SectionTitle({
  title,
  description,
  actions,
  className,
  as: Tag = 'h2',
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  as?: 'h2' | 'h3'
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-end justify-between gap-2', className)}>
      <div>
        <Tag className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-800">
          {title}
        </Tag>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function KpiTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  delta,
  className,
  href,
  suffix,
}: {
  label: string
  value: number | string | null | undefined
  hint?: React.ReactNode
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'signal' | 'ai'
  icon?: LucideIcon
  delta?: { value: number; label?: string; invert?: boolean }
  className?: string
  href?: string
  suffix?: string
}) {
  const display = typeof value === 'number' ? formatNumber(value) : (value ?? '—')
  const positive = delta ? (delta.invert ? delta.value < 0 : delta.value > 0) : null
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <Icon
            className={cn(
              'size-4 shrink-0',
              tone === 'neutral' && 'text-paper-500',
              tone === 'info' && 'text-info-500',
              tone === 'success' && 'text-success-500',
              tone === 'warning' && 'text-warning-500',
              tone === 'danger' && 'text-danger-500',
              tone === 'signal' && 'text-signal-500',
              tone === 'ai' && 'text-ai-500',
            )}
          />
        ) : null}
      </div>
      <p
        className={cn(
          'mt-2 display-num text-[2rem] leading-none',
          tone === 'danger' && 'text-danger-700',
          tone === 'warning' && 'text-warning-700',
          tone === 'signal' && 'text-signal-700',
          tone === 'success' && 'text-success-700',
          tone === 'ai' && 'text-ai-700',
          (tone === 'neutral' || tone === 'info') && 'text-ink-950',
        )}
      >
        {display}
        {suffix ? <span className="ml-0.5 text-lg text-muted-foreground">{suffix}</span> : null}
      </p>
      {hint || delta ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {delta ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                positive ? 'text-success-700' : delta.value === 0 ? '' : 'text-danger-700',
              )}
            >
              {delta.value > 0 ? (
                <ArrowUpRight className="size-3" />
              ) : delta.value < 0 ? (
                <ArrowDownRight className="size-3" />
              ) : null}
              {delta.value > 0 ? '+' : ''}
              {delta.value}
              {delta.label ? ` ${delta.label}` : ''}
            </span>
          ) : null}
          {hint ? <span className="truncate">{hint}</span> : null}
        </div>
      ) : null}
    </>
  )
  const base = cn(
    'group relative flex flex-col rounded-lg border border-border bg-surface px-4 py-3.5 shadow-card transition-shadow',
    href && 'hover:shadow-raised hover:border-border-strong',
    tone === 'danger' && 'border-l-2 border-l-danger-500',
    tone === 'signal' && 'border-l-2 border-l-signal-500',
    tone === 'warning' && 'border-l-2 border-l-warning-500',
    className,
  )
  if (href) {
    return (
      <a href={href} className={base}>
        {body}
      </a>
    )
  }
  return <div className={base}>{body}</div>
}

/** Par etiqueta/valor para paneles de detalle. */
export function DetailRow({
  label,
  children,
  className,
  mono,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn('text-sm text-foreground', mono && 'font-mono text-xs')}>
        {children ?? '—'}
      </dd>
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded-sm border border-border bg-surface-muted px-1.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  )
}
