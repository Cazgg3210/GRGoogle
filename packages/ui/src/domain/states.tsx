import * as React from 'react'
import { AlertOctagon, Inbox, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn.js'
import { Button } from '../components/button.js'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-muted/40 text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-paper-200 text-paper-700">
        <Icon className="size-5" />
      </span>
      <div className="max-w-md">
        <p className="font-medium text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'No se pudo cargar la información',
  message,
  code,
  correlationId,
  onRetry,
  retryHref,
  className,
  compact,
}: {
  title?: string
  message?: string
  code?: string
  correlationId?: string
  onRetry?: () => void
  retryHref?: string
  className?: string
  compact?: boolean
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-danger-200 bg-danger-50/60 text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-danger-100 text-danger-700">
        <AlertOctagon className="size-5" />
      </span>
      <div className="max-w-lg">
        <p className="font-medium text-danger-900">{title}</p>
        {message ? <p className="mt-1 text-sm text-danger-800/90">{message}</p> : null}
        {code || correlationId ? (
          <p className="mt-2 font-mono text-[11px] text-danger-700/80">
            {code ? <span>{code}</span> : null}
            {code && correlationId ? ' · ' : null}
            {correlationId ? <span>ref {correlationId}</span> : null}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : retryHref ? (
        <Button variant="outline" size="sm" asChild>
          <a href={retryHref}>Reintentar</a>
        </Button>
      ) : null}
    </div>
  )
}

export function InlineNotice({
  tone = 'info',
  title,
  children,
  className,
  icon: Icon,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'ai' | 'neutral'
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
  icon?: LucideIcon
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-md border px-3.5 py-3 text-sm',
        tone === 'info' && 'border-info-200 bg-info-50 text-info-900',
        tone === 'warning' && 'border-warning-200 bg-warning-50 text-warning-900',
        tone === 'danger' && 'border-danger-200 bg-danger-50 text-danger-900',
        tone === 'success' && 'border-success-200 bg-success-50 text-success-900',
        tone === 'ai' && 'border-ai-200 bg-ai-50 text-ai-900',
        tone === 'neutral' && 'border-border bg-surface-muted text-foreground',
        className,
      )}
    >
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 opacity-80" /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5 opacity-90')}>{children}</div> : null}
      </div>
    </div>
  )
}
